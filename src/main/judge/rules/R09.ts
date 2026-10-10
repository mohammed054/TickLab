import type { RuleConfig } from '../config';
import { mk, unknown, type RuleFn } from '../types';
type C = RuleConfig['rules']['R09_LOW_LIQ'];
export const R09: RuleFn<C> = (i, c) => {
  const id = 'R09_LOW_LIQ';
  const L = i.latest?.liquidityUsd ?? null;
  if (L === null) return unknown(id, 'liquidity unknown');
  let pts = 0;
  for (const t of c.tiers) if (L < t.below && t.points > pts) pts = t.points;
  return mk(id, pts > 0, pts, { liquidityUsd: L, tiers: c.tiers });
};
