// lab:*, health:*, settings:*, secret:*, ai:*, app:* handlers.
import { createHash } from 'node:crypto';
import { ZodError } from 'zod';
import { ok, err, type FrozenConfig, type LabParams } from '../../../shared/types';
import type { Handlers, Services } from './types';
import { loadDefaultConfig, parseRuleConfig, type RuleConfig } from '../../judge/config';
import { stableJson } from '../../judge/engine';
import { runLab } from '../../lab/replay';
import { listGaps, gapsSince } from '../../db/queries/gaps';
import { listErrors, creditsThisMonth } from '../../db/queries/usage';
import { validateAddress } from '../../wallet/address';
import { MS } from '../../../shared/constants';

type Keys = 'lab:run' | 'lab:freeze' | 'lab:configs' | 'health:overview' | 'health:gaps' | 'health:errors' | 'health:backfill' | 'health:diagnostics'
  | 'settings:get' | 'settings:set' | 'secret:set' | 'secret:has' | 'ai:explain' | 'ai:models' | 'ai:usage' | 'app:openExternal' | 'app:info'
  | 'app:openDataFolder' | 'app:backupNow' | 'app:firstRun';

/** Only https links to these hosts may be opened in the OS browser. */
export const EXTERNAL_HOSTS = ['www.geckoterminal.com', 'geckoterminal.com', 'solscan.io', 'www.solscan.io', 'openrouter.ai', 'www.helius.dev', 'dancesafe.org'];
export function isAllowedExternal(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password && EXTERNAL_HOSTS.includes(u.hostname); } catch { return false; }
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

export function miscHandlers(s: Services): Pick<Handlers, Keys> {
  const { db } = s;
  const configRow = (id: number): FrozenConfig | null => {
    const r = db.prepare('SELECT * FROM rule_configs WHERE id=?').get(id) as { id: number; name: string; config_json: string; sha256: string; frozen_at: number } | undefined;
    return r ? { id: r.id, name: r.name, configJson: r.config_json, sha256: r.sha256, frozenAt: r.frozen_at } : null;
  };
  const rulesFor = (p: LabParams): RuleConfig | null => {
    if (p.configId === null) return loadDefaultConfig();
    const c = configRow(p.configId);
    return c ? parseRuleConfig(JSON.parse(c.configJson)) : null;
  };
  const dbBytes = (): number => {
    const pc = (db.pragma('page_count', { simple: true }) as number) ?? 0; const ps = (db.pragma('page_size', { simple: true }) as number) ?? 0;
    return pc * ps;
  };
  return {
    'lab:run': (r) => {
      const rules = rulesFor(r);
      if (!rules) return err('VALIDATION', 'Unknown frozen config.');
      const res = runLab(db, r, rules, { positionUsd: s.settings.get('judge.defaultPositionUsd') });
      db.prepare('INSERT INTO lab_runs(config_id,params_json,run_at,result_json) VALUES(?,?,?,?)').run(r.configId, JSON.stringify(r), s.now(), JSON.stringify(res));
      return ok(res);
    },
    'lab:freeze': (r) => {
      const rules = rulesFor(r.params);
      if (!rules) return err('VALIDATION', 'Unknown frozen config.');
      const json = stableJson(rules); const hash = sha(json);
      db.prepare('INSERT OR IGNORE INTO rule_configs(name,config_json,sha256,frozen_at) VALUES(?,?,?,?)').run(r.name, json, hash, s.now());
      const row = db.prepare('SELECT id FROM rule_configs WHERE sha256=?').get(hash) as { id: number };
      return ok({ configId: row.id, sha256: hash });
    },
    'lab:configs': () => ok((db.prepare('SELECT id FROM rule_configs ORDER BY id DESC').all() as { id: number }[]).flatMap((x) => { const c = configRow(x.id); return c ? [c] : []; })),
    'health:overview': () => {
      const now = s.now();
      const c = (sql: string): number => (db.prepare(sql).get() as { c: number }).c;
      const ai = s.ai.usage();
      return ok({
        sources: s.monitor.status(),
        budgets: {
          gtCallsLastMinute: s.monitor.callsLastMinute('geckoterminal'), gtCap: s.settings.get('sources.gt.callsPerMinuteCap'),
          rpcCreditsMonth: creditsThisMonth(db, 'rpc', now), rpcBudget: s.settings.get('sources.rpc.monthlyCreditBudget'), aiToday: ai.today, aiLimit: ai.limit,
        },
        gaps24h: gapsSince(db, now - MS.day), intervalMultiplier: s.scheduler.intervalMultiplier, dbBytes: dbBytes(),
        trackedCount: c('SELECT COUNT(*) c FROM pools WHERE tier>=2'), deepCount: s.scheduler.deep.activeTokenIds().length, skippedQuote: s.counters.skippedQuote,
      });
    },
    'health:gaps': (r) => ok(listGaps(db, r.limit)),
    'health:errors': (r) => ok(listErrors(db, r.limit)),
    'health:backfill': () => { void s.scheduler.backfillNow(); return ok(undefined); },
    'health:diagnostics': () => s.platform.writeDiagnostics(),
    'settings:get': (r) => ok({ ...s.settings.getAll(r.keys, s.now()), __pending: s.settings.pending(s.now()) }),
    'settings:set': (r) => {
      try {
        let value = r.value;
        if (r.key === 'wallet.address' && typeof value === 'string') {
          const v = value.trim() === '' ? null : validateAddress(value);
          if (v && !v.ok) return err('VALIDATION', v.message);
          value = v ? v.address : null;
        }
        return ok(s.settings.set(r.key, value, s.now()));
      } catch (e) {
        if (e instanceof ZodError) return err('VALIDATION', e.issues[0]?.message ?? 'Invalid value.');
        return err('VALIDATION', e instanceof Error ? e.message : 'Invalid setting.');
      }
    },
    'secret:set': (r) => {
      try { s.secrets.set(r.name, r.value.trim()); return ok(undefined); } catch (e) { return err('VALIDATION', e instanceof Error ? e.message : 'Could not store the key.'); }
    },
    'secret:has': (r) => ok(s.secrets.has(r.name)),
    'ai:explain': (r) => s.ai.explain(r.tokenId, r.preset, r.question),
    'ai:models': () => s.ai.listModels(),
    'ai:usage': () => ok(s.ai.usage()),
    'app:openExternal': (r) => {
      if (!isAllowedExternal(r.url)) return err('VALIDATION', 'That link is not on the allowed list.');
      s.platform.openExternal(r.url); return ok(undefined);
    },
    'app:info': () => ok({ version: s.platform.version, dataDir: s.platform.dataDir, firstRunDone: s.settings.get('app.firstRunDone') }),
    'app:openDataFolder': () => { s.platform.openDataFolder(); return ok(undefined); },
    'app:backupNow': () => s.platform.backupNow(),
    'app:firstRun': (r) => { if (r.done !== undefined) s.settings.set('app.firstRunDone', r.done, s.now()); return ok({ firstRunDone: s.settings.get('app.firstRunDone') }); },
  };
}
