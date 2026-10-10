import { DoorClosed, Droplets, Link2, PieChart, Repeat, ShieldAlert, Snowflake, TrendingDown, Users, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface RuleMeta { name: string; icon: LucideIcon; points: string }

/** Names from docs/04 §4.2; icons from docs/05 §5.6. Points are the configured defaults. */
export const RULES: Record<string, RuleMeta> = {
  R01: { name: 'Mint authority still active', icon: ShieldAlert, points: '25' },
  R02: { name: 'Freeze authority active', icon: Snowflake, points: '20' },
  R03: { name: 'One wallet holds a lot', icon: PieChart, points: '15' },
  R04: { name: 'Top 10 wallets hold most', icon: PieChart, points: '15' },
  R05: { name: 'Creator launches repeatedly and dumps', icon: Repeat, points: '20' },
  R06: { name: 'Many wallets buy in the same moment', icon: Zap, points: '10' },
  R07: { name: 'Early buyers share a funder', icon: Link2, points: '15' },
  R08: { name: 'Selling would move the price a lot', icon: DoorClosed, points: '10 or 20' },
  R09: { name: 'Very little liquidity', icon: Droplets, points: '10 or 20' },
  R10: { name: 'Liquidity collapsed', icon: TrendingDown, points: '25' },
  R11: { name: 'Big volume from few buyers', icon: Users, points: '10' },
};
export const ruleCode = (ruleId: string): string => ruleId.slice(0, 3);
export const ruleName = (ruleId: string): string => RULES[ruleCode(ruleId)]?.name ?? ruleId;

/** One-line summary of a rule's evidence object for the Flags panel. */
export function evidenceLine(evidence: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(evidence)) {
    if (v === null || v === undefined || typeof v === 'object') continue;
    if (/at$/i.test(k) && typeof v === 'number' && v > 1e11) continue;
    parts.push(`${k}: ${typeof v === 'number' ? Math.round(v * 1000) / 1000 : String(v)}`);
    if (parts.length >= 4) break;
  }
  return parts.join(' · ');
}
