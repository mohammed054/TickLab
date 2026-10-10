import { z } from 'zod';
import type { Db } from '../db/open';
import { clock } from '../clock';
import { DEFAULT_SETTINGS, SETTING_KEYS, LOOSEN_UP_KEYS, LOOSEN_DOWN_KEYS, type SettingKey } from './defaults';

const pos = z.number().positive();
const nn = z.number().min(0);
const winBounds = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number(), displayId: z.number().optional(), maximized: z.boolean().optional() }).nullable();

export const SETTING_SCHEMAS: Record<SettingKey, z.ZodTypeAny> = {
  'sources.gt.enabled': z.boolean(),
  'sources.gt.callsPerMinuteCap': z.number().int().min(1).max(30),
  'sources.gt.discoveryIntervalSec': z.number().int().min(5).max(300),
  'sources.rpc.url': z.string().url().refine((u) => u.startsWith('https://'), 'RPC URL must be https'),
  'sources.rpc.creditCost': z.record(z.number().min(0)),
  'sources.rpc.monthlyCreditBudget': pos,
  'track.minLiquidityUsd': nn, 'track.minTx5m': nn, 'track.maxAgeMinForEntry': pos, 'track.durationHours': pos,
  'backfill.maxPages': z.number().int().min(1).max(50), 'backfill.maxClosedHours': pos,
  'retention.snapshotDays': z.number().int().min(1).max(365), 'retention.tradeDays': z.number().int().min(1).max(365),
  'judge.rulesVersion': z.string().min(1), 'judge.defaultPositionUsd': pos,
  'costs.tradeFeePctPerSide': z.number().min(0).max(20), 'costs.networkFeeUsdPerTx': nn,
  'alerts.enabled': z.boolean(), 'alerts.maxScore': z.number().min(0).max(100), 'alerts.minCompleteness': z.number().min(0).max(1),
  'alerts.minLiquidityUsd': nn, 'alerts.minBuyersH1': nn, 'alerts.minAgeMin': nn, 'alerts.maxAgeMin': pos,
  'journal.startEquityUsd': pos,
  'risk.maxPositionPct': z.number().gt(0).max(100), 'risk.maxOpenPositions': z.number().int().min(1).max(100),
  'risk.maxDrawdownPct': z.number().gt(0).max(100), 'risk.maxLosingTradesPerDay': z.number().int().min(1).max(100),
  'risk.loosenCooldownHours': z.number().min(0).max(24 * 30),
  'ai.enabled': z.boolean(), 'ai.models': z.array(z.string().endsWith(':free')).max(3), 'ai.dailyLimit': z.number().int().min(1).max(1000),
  'wallet.address': z.string().min(32).max(44).nullable(), 'wallet.solUsdPool': z.string().min(32).max(44).nullable(),
  'ui.feedMaxRows': z.number().int().min(100).max(50000),
  'window.feed': winBounds, 'window.detail': winBounds, 'app.firstRunDone': z.boolean(),
};

export const isSettingKey = (k: string): k is SettingKey => (SETTING_KEYS as string[]).includes(k);
const isRiskKey = (k: SettingKey) => k.startsWith('risk.');

export interface PendingLimit { key: string; value: unknown; effectiveAt: number }
export interface Limits { maxPositionPct: number; maxOpen: number; maxDrawdownPct: number; maxLosingPerDay: number }

export class SettingsStore {
  constructor(private db: Db) {}

  private raw(key: SettingKey): unknown {
    const r = this.db.prepare('SELECT value_json FROM settings WHERE key=?').get(key) as { value_json: string } | undefined;
    if (!r) return DEFAULT_SETTINGS[key];
    try { return JSON.parse(r.value_json); } catch { return DEFAULT_SETTINGS[key]; }
  }

  /** Effective value at `now`: for risk.* keys this applies the loosening cooldown via settings_audit. */
  get<K extends SettingKey>(key: K, now: number = clock.now()): (typeof DEFAULT_SETTINGS)[K] {
    if (isRiskKey(key)) {
      const r = this.db.prepare('SELECT new_json FROM settings_audit WHERE key=? AND effective_at<=? ORDER BY changed_at DESC, id DESC LIMIT 1').get(key, now) as { new_json: string } | undefined;
      if (r) return JSON.parse(r.new_json);
    }
    return this.raw(key) as (typeof DEFAULT_SETTINGS)[K];
  }

  getAll(keys?: string[], now: number = clock.now()): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of SETTING_KEYS) if (!keys || keys.includes(k)) out[k] = this.get(k, now);
    return out;
  }

  /** Validates, audits and stores. Loosening risk limits is delayed by risk.loosenCooldownHours (docs/06 §6.3). */
  set(key: string, value: unknown, now: number = clock.now()): { effectiveAt: number } {
    if (!isSettingKey(key)) throw new Error(`Unknown setting: ${key}`);
    const parsed = SETTING_SCHEMAS[key].parse(value);
    const old = this.get(key, now);
    const oldJson = JSON.stringify(old ?? null);
    const newJson = JSON.stringify(parsed ?? null);
    if (oldJson === newJson) return { effectiveAt: now };
    let effectiveAt = now;
    if (isRiskKey(key)) {
      const loosening =
        (LOOSEN_UP_KEYS.includes(key) && (parsed as number) > (old as number)) ||
        (LOOSEN_DOWN_KEYS.includes(key) && (parsed as number) < (old as number));
      if (loosening) effectiveAt = now + (this.get('risk.loosenCooldownHours', now) as number) * 3_600_000;
    }
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO settings_audit(key,old_json,new_json,changed_at,effective_at) VALUES(?,?,?,?,?)').run(key, oldJson, newJson, now, effectiveAt);
      if (effectiveAt <= now) {
        this.db.prepare('INSERT INTO settings(key,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at').run(key, newJson, now);
      }
    })();
    return { effectiveAt };
  }

  /** Pending (not yet effective) changes that have not been superseded by a later change. */
  pending(now: number = clock.now()): PendingLimit[] {
    const rows = this.db.prepare('SELECT key,new_json,changed_at,effective_at,id FROM settings_audit WHERE key LIKE \'risk.%\' AND effective_at>? ORDER BY changed_at, id').all(now) as
      { key: string; new_json: string; changed_at: number; effective_at: number; id: number }[];
    return rows.filter((r) => {
      const later = this.db.prepare('SELECT 1 FROM settings_audit WHERE key=? AND (changed_at>? OR (changed_at=? AND id>?)) LIMIT 1').get(r.key, r.changed_at, r.changed_at, r.id);
      return !later;
    }).map((r) => ({ key: r.key, value: JSON.parse(r.new_json), effectiveAt: r.effective_at }));
  }

  effectiveLimits(now: number = clock.now()): Limits {
    return {
      maxPositionPct: this.get('risk.maxPositionPct', now), maxOpen: this.get('risk.maxOpenPositions', now),
      maxDrawdownPct: this.get('risk.maxDrawdownPct', now), maxLosingPerDay: this.get('risk.maxLosingTradesPerDay', now),
    };
  }
}
