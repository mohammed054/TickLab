import type { RuleConfig } from '../config';
import { mk, unknown, type RuleFn } from '../types';
type C = RuleConfig['rules']['R04_TOP10_HOLDERS'];
export const R04: RuleFn<C> = (i, c) => {
  const h = i.holders;
  if (!h || h.top10Pct === null) return unknown('R04_TOP10_HOLDERS', 'holders not observed');
  return mk('R04_TOP10_HOLDERS', h.top10Pct > c.thresholdPct, c.points, { top10_pct: h.top10Pct, threshold: c.thresholdPct, holdersObservedAt: h.observedAt });
};
