import type { RuleConfig } from '../config';
import { mk, unknown, type RuleFn } from '../types';
type C = RuleConfig['rules']['R05_CREATOR_SERIAL'];
const DAY = 86_400_000;
export const R05: RuleFn<C> = (i, c) => {
  if (!i.token.creatorWallet) return unknown('R05_CREATOR_SERIAL', 'creator wallet unknown');
  if (i.creatorPriorTokens === null) return unknown('R05_CREATOR_SERIAL', 'creator history not available');
  const recent = i.creatorPriorTokens.filter((t) => t.ageMs <= c.lookbackDays * DAY);
  const dumped = recent.filter((t) => t.maxLiqUsd !== null && t.liqAt24hUsd !== null && t.maxLiqUsd >= c.minPeakLiqUsd && t.liqAt24hUsd <= c.dumpFraction * t.maxLiqUsd);
  const hit = recent.length >= c.minPriorTokens && dumped.length >= c.minDumped;
  return mk('R05_CREATOR_SERIAL', hit, c.points, { priorTokens: recent.length, dumped: dumped.length, minPriorTokens: c.minPriorTokens, minDumped: c.minDumped, lookbackDays: c.lookbackDays });
};
