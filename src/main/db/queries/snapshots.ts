import type { Db } from '../open';
import type { Snapshot } from '../../../shared/types';

interface R { id: number; pool_id: number; observed_at: number; price_usd: number | null; liquidity_usd: number | null; fdv_usd: number | null; mcap_usd: number | null; vol_m5: number | null; vol_h1: number | null; vol_h24: number | null; buys_m5: number | null; sells_m5: number | null; buyers_m5: number | null; sellers_m5: number | null; buys_h1: number | null; sells_h1: number | null; buyers_h1: number | null; sellers_h1: number | null; chg_m5: number | null; chg_h1: number | null; source: string }
export const mapSnap = (r: R): Snapshot => ({ id: r.id, poolId: r.pool_id, observedAt: r.observed_at, priceUsd: r.price_usd, liquidityUsd: r.liquidity_usd, fdvUsd: r.fdv_usd, mcapUsd: r.mcap_usd, volM5: r.vol_m5, volH1: r.vol_h1, volH24: r.vol_h24, buysM5: r.buys_m5, sellsM5: r.sells_m5, buyersM5: r.buyers_m5, sellersM5: r.sellers_m5, buysH1: r.buys_h1, sellsH1: r.sells_h1, buyersH1: r.buyers_h1, sellersH1: r.sellers_h1, chgM5: r.chg_m5, chgH1: r.chg_h1, source: r.source });

export function insertSnapshot(db: Db, s: Snapshot): number {
  const r = db.prepare(`INSERT INTO pool_snapshots(pool_id,observed_at,price_usd,liquidity_usd,fdv_usd,mcap_usd,vol_m5,vol_h1,vol_h24,buys_m5,sells_m5,buyers_m5,sellers_m5,buys_h1,sells_h1,buyers_h1,sellers_h1,chg_m5,chg_h1,source)
    VALUES(@poolId,@observedAt,@priceUsd,@liquidityUsd,@fdvUsd,@mcapUsd,@volM5,@volH1,@volH24,@buysM5,@sellsM5,@buyersM5,@sellersM5,@buysH1,@sellsH1,@buyersH1,@sellersH1,@chgM5,@chgH1,@source)`).run(s);
  db.prepare('UPDATE pools SET last_snapshot_at=? WHERE id=?').run(s.observedAt, s.poolId);
  return Number(r.lastInsertRowid);
}
export const latestSnapshot = (db: Db, poolId: number): Snapshot | null => { const r = db.prepare('SELECT * FROM pool_snapshots WHERE pool_id=? ORDER BY observed_at DESC, id DESC LIMIT 1').get(poolId) as R | undefined; return r ? mapSnap(r) : null; };
export const snapshotHistory = (db: Db, poolId: number, upTo?: number): Snapshot[] =>
  (db.prepare(`SELECT * FROM pool_snapshots WHERE pool_id=? ${upTo !== undefined ? 'AND observed_at<=?' : ''} ORDER BY observed_at, id`).all(...(upTo !== undefined ? [poolId, upTo] : [poolId])) as R[]).map(mapSnap);
export const snapshotCount = (db: Db, poolId: number): number => (db.prepare('SELECT COUNT(*) c FROM pool_snapshots WHERE pool_id=?').get(poolId) as { c: number }).c;
