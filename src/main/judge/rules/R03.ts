import type { RuleConfig } from '../config';
import { mk, unknown, type RuleFn } from '../types';
type C = RuleConfig['rules']['R03_TOP1_HOLDER'];
export const R03: RuleFn<C> = (i, c) => {
  const h = i.holders;
  if (!h || h.top1Pct === null) return unknown('R03_TOP1_HOLDER', 'holders not observed');
  return mk('R03_TOP1_HOLDER', h.top1Pct > c.thresholdPct, c.points, { top1_pct: h.top1Pct, threshold: c.thresholdPct, holdersObservedAt: h.observedAt });
};
