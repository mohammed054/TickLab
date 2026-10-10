import type { RuleConfig } from '../config';
import { mk, unknown, type RuleFn } from '../types';
type C = RuleConfig['rules']['R11_THIN_CROWD'];
export const R11: RuleFn<C> = (i, c) => {
  const id = 'R11_THIN_CROWD';
  const b = i.latest?.buyersH1 ?? null, v = i.latest?.volH1 ?? null;
  if (b === null || v === null) return unknown(id, 'buyers or volume unknown');
  return mk(id, b < c.maxBuyersH1 && v > c.minVolH1, c.points, { buyers_h1: b, vol_h1: v, maxBuyersH1: c.maxBuyersH1, minVolH1: c.minVolH1 });
};
