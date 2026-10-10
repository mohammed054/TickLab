// docs/03 §3.6 — Tier 2 tracking: track filter, snapshot cadence with adaptive multiplier, authority check, expiry.
import type { PipelineCtx } from './context';
import { promote } from '../db/queries/pools';
import { setAuthorities } from '../db/queries/tokens';
import { logError } from '../db/queries/usage';
import { ingestPools } from './ingest';
import { MS } from '../../shared/constants';
import type { Snapshot } from '../../shared/types';

export const FAST_MS = 30_000, SLOW_MS = 300_000, BUDGET_CALLS_PER_MIN = 12, TWO_HOURS = 2 * MS.hour;

export interface TrackRule { maxAgeMin: number; minLiquidityUsd: number; minTx5m: number }
export function passesTrackFilter(ageMs: number, s: Pick<Snapshot, 'liquidityUsd' | 'buysM5' | 'sellsM5'> | null, r: TrackRule): boolean {
  if (!s || s.liquidityUsd === null || s.buysM5 === null || s.sellsM5 === null) return false;
  return ageMs < r.maxAgeMin * MS.min && s.liquidityUsd >= r.minLiquidityUsd && s.buysM5 + s.sellsM5 >= r.minTx5m;
}

/** requiredCallsPerMin = ceil(n30/30)*2 + ceil(n300/30)*0.2 ; k = max(1, required/12). */
export function intervalMultiplier(n30: number, n300: number): number {
  const required = Math.ceil(n30 / 30) * 2 + Math.ceil(n300 / 30) * 0.2;
  return required > BUDGET_CALLS_PER_MIN ? required / BUDGET_CALLS_PER_MIN : 1;
}
export const effectiveInterval = (baseMs: number, k: number): number => (k <= 1 ? baseMs : Math.ceil((baseMs * k) / 15_000) * 15_000);

interface TrackedRow { pool_id: number; token_id: number; address: string; created_at_chain: number; last_snapshot_at: number | null; tracked_until: number | null }

export class Tracker {
  private authTries = new Map<number, number>();
  multiplier = 1;
  constructor(private c: PipelineCtx) {}

  /** Promote qualifying young pools (+ watchlisted / open-decision tokens regardless of filter). */
  evaluateAndPromote(poolIds: number[]): number {
    const { db, settings } = this.c; const now = this.c.now();
    const rule: TrackRule = { maxAgeMin: settings.get('track.maxAgeMinForEntry'), minLiquidityUsd: settings.get('track.minLiquidityUsd'), minTx5m: settings.get('track.minTx5m') };
    const until = now + settings.get('track.durationHours') * MS.hour;
    let promoted = 0;
    for (const id of poolIds) {
      const p = db.prepare('SELECT p.id, p.tier, p.created_at_chain FROM pools p WHERE p.id=?').get(id) as { id: number; tier: number; created_at_chain: number } | undefined;
      if (!p || p.tier === 2) continue;
      const s = db.prepare('SELECT liquidity_usd liquidityUsd, buys_m5 buysM5, sells_m5 sellsM5 FROM pool_snapshots WHERE pool_id=? ORDER BY observed_at DESC, id DESC LIMIT 1').get(id) as Pick<Snapshot, 'liquidityUsd' | 'buysM5' | 'sellsM5'> | undefined;
      if (passesTrackFilter(now - p.created_at_chain, s ?? null, rule)) { promote(db, id, now, until); promoted++; }
    }
    return promoted;
  }

  /** Watchlisted tokens and tokens with an open decision are tracked with no end. */
  ensureForcedTracking(): void {
    const { db } = this.c; const now = this.c.now();
    const rows = db.prepare(`SELECT DISTINCT p.id FROM pools p WHERE p.token_id IN (SELECT token_id FROM watchlist)
      OR p.token_id IN (SELECT d.token_id FROM decisions d WHERE EXISTS (SELECT 1 FROM v_fills_valid f WHERE f.decision_id=d.id AND f.kind='entry')
        AND NOT EXISTS (SELECT 1 FROM v_fills_valid f WHERE f.decision_id=d.id AND f.kind='exit') AND NOT EXISTS (SELECT 1 FROM decision_notes n WHERE n.decision_id=d.id AND n.kind='cancel'))`).all() as { id: number }[];
    for (const r of rows) promote(db, r.id, now, null);
  }

  private tracked(): TrackedRow[] {
    return this.c.db.prepare(`SELECT p.id pool_id, p.token_id, p.address, p.created_at_chain, p.last_snapshot_at, p.tracked_until FROM pools p
      WHERE p.tier=2 AND (p.tracked_until IS NULL OR p.tracked_until>?)`).all(this.c.now()) as TrackedRow[];
  }

  /** Pools whose snapshot is due now, given cadence + multiplier. Updates `multiplier`. */
  pickDue(): TrackedRow[] {
    const now = this.c.now(); const rows = this.tracked();
    const n30 = rows.filter((r) => now - r.created_at_chain < TWO_HOURS).length;
    this.multiplier = intervalMultiplier(n30, rows.length - n30);
    return rows.filter((r) => {
      const base = now - r.created_at_chain < TWO_HOURS ? FAST_MS : SLOW_MS;
      return r.last_snapshot_at === null || now - r.last_snapshot_at >= effectiveInterval(base, this.multiplier);
    });
  }

  /** One scheduler tick: promote forced tracking, snapshot due pools in chunks of 30, run authority checks, queue judge. */
  async tick(): Promise<{ polled: number; ok: boolean }> {
    this.ensureForcedTracking();
    const due = this.pickDue();
    let ok = true;
    for (let i = 0; i < due.length; i += 30) {
      const chunk = due.slice(i, i + 30);
      const r = await this.c.gt.poolsMulti(chunk.map((x) => x.address), 2);
      if (!r.ok) { ok = false; logError(this.c.db, 'geckoterminal', r.error.code, r.error.message, this.c.now()); this.c.monitor.fail('geckoterminal', r.error.code); break; }
      this.c.monitor.ok('geckoterminal');
      this.c.counters.skippedQuote += r.value.skippedQuote; this.c.counters.rejected += r.value.rejected;
      const ing = ingestPools(this.c, r.value.pools);
      this.c.batcher.add(ing.touchedTokenIds);
      for (const t of ing.touchedTokenIds) this.c.judge.run(t);
    }
    await this.authorityChecks();
    return { polled: due.length, ok };
  }

  /** Once per tracked token: getAccountInfo(mint) -> authorities (sets authorities_checked_at). Max 3 tries per token per run. */
  async authorityChecks(): Promise<void> {
    const { db } = this.c;
    const rows = db.prepare(`SELECT t.id, t.mint FROM tokens t JOIN pools p ON p.token_id=t.id WHERE p.tier=2 AND t.authorities_checked_at IS NULL GROUP BY t.id LIMIT 5`).all() as { id: number; mint: string }[];
    for (const t of rows) {
      if ((this.authTries.get(t.id) ?? 0) >= 3) continue;
      this.authTries.set(t.id, (this.authTries.get(t.id) ?? 0) + 1);
      const r = await this.c.rpc.mintInfo(t.mint);
      if (!r.ok) { logError(db, 'rpc', r.error.code, r.error.message, this.c.now()); this.c.monitor.fail('rpc', r.error.code); continue; }
      this.c.monitor.ok('rpc');
      setAuthorities(db, t.id, r.value, this.c.now());
      this.c.judge.run(t.id);
      this.c.batcher.add([t.id]);
    }
  }
}
