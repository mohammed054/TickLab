import type { RuleConfig } from '../config';
import { mk, unknown, type RuleFn } from '../types';
type C = RuleConfig['rules']['R06_EARLY_SYNC'];
export const R06: RuleFn<C> = (i, c) => {
  const id = 'R06_EARLY_SYNC';
  if (i.trades === null) return unknown(id, 'trades not fetched');
  const t0 = i.pool.createdAtChain;
  const earlyEnd = t0 + c.earlySec * 1000;
  const sorted = [...i.trades].sort((a, b) => a.blockTime - b.blockTime);
  if (sorted.length === 0) return unknown(id, 'no trades');
  const first = sorted[0].blockTime;
  if (first > t0 + c.maxFirstTradeDelaySec * 1000) return unknown(id, 'early trades missed', { firstTradeAt: first, createdAtChain: t0 });
  if (!sorted.some((t) => t.blockTime > earlyEnd)) return unknown(id, 'trade history does not cover the early window yet', { createdAtChain: t0 });
  const buys = sorted.filter((t) => t.side === 'buy' && t.blockTime >= t0 && t.blockTime <= earlyEnd);
  const win = c.windowSec * 1000;
  let best = 0, lo = 0;
  for (let hi = 0; hi < buys.length; hi++) {
    while (buys[hi].blockTime - buys[lo].blockTime > win) lo++;
    const wallets = new Set(buys.slice(lo, hi + 1).map((b) => b.wallet));
    if (wallets.size > best) best = wallets.size;
  }
  return mk(id, best >= c.minWallets, c.points, { maxDistinctBuyersInWindow: best, windowSec: c.windowSec, threshold: c.minWallets, earlySec: c.earlySec });
};
