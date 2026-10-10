// Shared by discovery, backfill and tracker: upsert token/pool + insert a snapshot per pool.
import type { PipelineCtx } from './context';
import type { NormalizedPool } from '../sources/normalize';
import { upsertToken } from '../db/queries/tokens';
import { upsertPool } from '../db/queries/pools';
import { insertSnapshot } from '../db/queries/snapshots';

export interface IngestResult { newPools: { tokenId: number; poolId: number; created: number }[]; touchedTokenIds: number[]; poolIds: number[] }

export function ingestPools(c: PipelineCtx, pools: NormalizedPool[]): IngestResult {
  const now = c.now();
  const res: IngestResult = { newPools: [], touchedTokenIds: [], poolIds: [] };
  c.db.transaction(() => {
    for (const p of pools) {
      const t = upsertToken(c.db, p.token, now);
      const pl = upsertPool(c.db, { ...p.pool, tokenId: t.id, source: 'geckoterminal' }, now);
      if (p.token.decimals !== null) c.db.prepare('UPDATE tokens SET decimals=COALESCE(decimals,?) WHERE id=?').run(p.token.decimals, t.id);
      insertSnapshot(c.db, { ...p.snapshot, poolId: pl.id, observedAt: now, source: 'geckoterminal' });
      res.touchedTokenIds.push(t.id); res.poolIds.push(pl.id);
      if (pl.isNew) res.newPools.push({ tokenId: t.id, poolId: pl.id, created: p.pool.createdAtChain });
    }
  })();
  return res;
}
