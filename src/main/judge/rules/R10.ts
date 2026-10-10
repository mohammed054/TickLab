import type { RuleConfig } from '../config';
import { mk, unknown, type RuleFn } from '../types';
type C = RuleConfig['rules']['R10_LIQ_DROP'];
export const R10: RuleFn<C> = (i, c) => {
  const id = 'R10_LIQ_DROP';
  const liqs = i.history.map((s) => s.liquidityUsd).filter((v): v is number => v !== null);
  if (liqs.length < c.minSnapshots) return unknown(id, 'not enough snapshots', { snapshots: liqs.length, needed: c.minSnapshots });
  const peak = Math.max(...liqs);
  const cur = liqs[liqs.length - 1];
  const hit = peak >= c.minPeakUsd && cur <= c.dropFraction * peak;
  return mk(id, hit, c.points, { peakLiquidityUsd: peak, currentLiquidityUsd: cur, dropFraction: c.dropFraction, dropPct: peak > 0 ? (1 - cur / peak) * 100 : null });
};
