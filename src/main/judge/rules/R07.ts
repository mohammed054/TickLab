import type { RuleConfig } from '../config';
import { mk, unknown, type RuleFn } from '../types';
type C = RuleConfig['rules']['R07_SHARED_FUNDER'];
export const R07: RuleFn<C> = (i, c) => {
  const id = 'R07_SHARED_FUNDER';
  if (i.earlyBuyerFunders === null) return unknown(id, 'funders not fetched');
  const sample = i.earlyBuyerFunders.slice(0, c.sample);
  const counts = new Map<string, number>();
  for (const f of sample) if (f.funder) counts.set(f.funder, (counts.get(f.funder) ?? 0) + 1);
  const max = Math.max(0, ...counts.values());
  return mk(id, max >= c.minShared, c.points, { maxSharedFunderCount: max, sampled: sample.length, threshold: c.minShared });
};
