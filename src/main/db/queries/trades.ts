import type { Db } from '../open';
import type { Trade } from '../../../shared/types';

interface R { id: number; pool_id: number; tx_sig: string; block_time: number; slot: number | null; side: 'buy' | 'sell'; wallet: string; usd_value: number | null; token_amount: number | null; price_usd: number | null; observed_at: number }
const map = (r: R): Trade => ({ id: r.id, poolId: r.pool_id, txSig: r.tx_sig, blockTime: r.block_time, slot: r.slot, side: r.side, wallet: r.wallet, usdValue: r.usd_value, tokenAmount: r.token_amount, priceUsd: r.price_usd, observedAt: r.observed_at });

export function insertTrades(db: Db, trades: Trade[]): number {
  const st = db.prepare('INSERT OR IGNORE INTO trades(pool_id,tx_sig,block_time,slot,side,wallet,usd_value,token_amount,price_usd,observed_at) VALUES(@poolId,@txSig,@blockTime,@slot,@side,@wallet,@usdValue,@tokenAmount,@priceUsd,@observedAt)');
  let n = 0;
  db.transaction(() => { for (const t of trades) n += st.run(t).changes; })();
  return n;
}
export const listTrades = (db: Db, poolId: number, opts: { minUsd?: number; limit?: number; upTo?: number } = {}): Trade[] =>
  (db.prepare(`SELECT * FROM trades WHERE pool_id=? AND COALESCE(usd_value,0)>=? ${opts.upTo !== undefined ? 'AND block_time<=?' : ''} ORDER BY block_time DESC, id DESC LIMIT ?`).all(...[poolId, opts.minUsd ?? 0, ...(opts.upTo !== undefined ? [opts.upTo] : []), opts.limit ?? 300]) as R[]).map(map);
export const allTradesAsc = (db: Db, poolId: number, upTo?: number): Trade[] =>
  (db.prepare(`SELECT * FROM trades WHERE pool_id=? ${upTo !== undefined ? 'AND block_time<=?' : ''} ORDER BY block_time, id`).all(...(upTo !== undefined ? [poolId, upTo] : [poolId])) as R[]).map(map);
export const tradeCount = (db: Db, poolId: number): number => (db.prepare('SELECT COUNT(*) c FROM trades WHERE pool_id=?').get(poolId) as { c: number }).c;
