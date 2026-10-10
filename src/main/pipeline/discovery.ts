// docs/03 §3.4 — discovery loop (one poll per call; the scheduler owns the timer).
import type { PipelineCtx } from './context';
import { ingestPools } from './ingest';
import { Tracker } from './tracker';
import { logError, setJobState } from '../db/queries/usage';

export class Discovery {
  constructor(private c: PipelineCtx, private tracker: Tracker) {}

  async pollOnce(): Promise<{ ok: boolean; newLaunches: number }> {
    const now = this.c.now();
    const r = await this.c.gt.newPools(1, 1);
    if (!r.ok) {
      logError(this.c.db, 'geckoterminal', r.error.code, r.error.message, now);
      this.c.monitor.fail('geckoterminal', r.error.code);
      setJobState(this.c.db, 'discovery', { ok: false, error: r.error.message }, now);
      return { ok: false, newLaunches: 0 };
    }
    this.c.counters.skippedQuote += r.value.skippedQuote; this.c.counters.rejected += r.value.rejected;
    if (r.value.rejected > 0) logError(this.c.db, 'geckoterminal', 'PARSE_FAIL', `${r.value.rejected} pool(s) failed validation`, now);
    // newest first -> process in the order returned
    const ing = ingestPools(this.c, r.value.pools);
    for (const n of ing.newPools) this.c.emit('evt:launch-new', { tokenId: n.tokenId });
    this.c.batcher.add(ing.touchedTokenIds);
    this.tracker.evaluateAndPromote(ing.poolIds);
    for (const n of ing.newPools) this.c.judge.run(n.tokenId, n.poolId); // shallow judge on discovery
    this.c.monitor.ok('geckoterminal');
    setJobState(this.c.db, 'discovery', { ok: true }, this.c.now());
    return { ok: true, newLaunches: ing.newPools.length };
  }
}
