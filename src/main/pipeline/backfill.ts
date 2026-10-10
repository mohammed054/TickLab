// docs/03 §3.5 — backfill on open; gaps are never silently filled.
import type { PipelineCtx } from './context';
import { ingestPools } from './ingest';
import { Tracker } from './tracker';
import { insertGap } from '../db/queries/gaps';
import { jobState, logError } from '../db/queries/usage';
import { MS } from '../../shared/constants';

export interface BackfillResult { skipped: 'first_run' | null; calls: number; gap: 'app_closed' | 'backfill_cap' | null; newLaunches: number }
export const PAGE_DELAY_MS = 3000;

export async function runBackfill(c: PipelineCtx, tracker: Tracker): Promise<BackfillResult> {
  const now = c.now();
  const lastOk = jobState(c.db, 'discovery').lastOkAt;
  const res: BackfillResult = { skipped: null, calls: 0, gap: null, newLaunches: 0 };
  if (lastOk === null) { res.skipped = 'first_run'; return res; }
  const closedMs = now - lastOk;
  if (closedMs > c.settings.get('backfill.maxClosedHours') * MS.hour) {
    insertGap(c.db, { source: 'geckoterminal', startAt: lastOk, endAt: now, reason: 'app_closed' });
    res.gap = 'app_closed'; return res;
  }
  const maxPages = c.settings.get('backfill.maxPages');
  let oldestSeen: number | null = null; let reachedOverlap = false; let failed = false;
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await c.sleep(PAGE_DELAY_MS);
    const r = await c.gt.newPools(page, 1); res.calls++;
    if (!r.ok) { logError(c.db, 'geckoterminal', r.error.code, `backfill page ${page}: ${r.error.message}`, c.now()); failed = true; break; }
    const ing = ingestPools(c, r.value.pools);
    res.newLaunches += ing.newPools.length;
    c.batcher.add(ing.touchedTokenIds); tracker.evaluateAndPromote(ing.poolIds);
    for (const n of ing.newPools) c.judge.run(n.tokenId, n.poolId);
    const o = r.value.oldestCreatedAt;
    if (o !== null) oldestSeen = oldestSeen === null ? o : Math.min(oldestSeen, o);
    if (r.value.rawCount === 0 || (o !== null && o <= lastOk - 5 * MS.min)) { reachedOverlap = true; break; }
  }
  if (!reachedOverlap) {
    insertGap(c.db, { source: 'geckoterminal', startAt: lastOk, endAt: oldestSeen ?? now, reason: failed ? 'outage' : 'backfill_cap' });
    res.gap = failed ? null : 'backfill_cap';
  }
  return res;
}
