import type { RuleConfig } from '../config';
import { exitImpact } from '../exitImpact';
import { mk, unknown, type RuleFn } from '../types';
type C = RuleConfig['rules']['R08_EXIT_IMPACT'];
export const R08: RuleFn<C> = (i, c) => {
  const id = 'R08_EXIT_IMPACT';
  const impact = exitImpact(i.positionUsd, i.latest?.liquidityUsd ?? null);
  if (impact === null) return unknown(id, 'liquidity unknown');
  let pts = 0;
  for (const t of c.tiers) if (impact > t.above && t.points > pts) pts = t.points;
  return mk(id, pts > 0, pts, { impact, positionUsd: i.positionUsd, liquidityUsd: i.latest?.liquidityUsd ?? null, tiers: c.tiers });
};
