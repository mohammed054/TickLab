// docs/06 §6.4 — journal stats. Always shown with n; "Small samples are noisy" when n < 30.
import type { DecisionRow } from '../../shared/types';

export interface JournalStats {
  n: number; winRate: number | null; meanPnlPct: number | null; medianPnlPct: number | null; worstPnlPct: number | null;
  totalPnl: number; maxDrawdownUsd: number; costShare: number | null; note: string | null;
}
const median = (a: number[]): number | null => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function computeStats(decisions: DecisionRow[]): JournalStats {
  const closed = decisions.filter((d) => d.status === 'closed' && d.pnlUsd !== null && d.exit && d.entry).sort((a, b) => a.exit!.occurredAt - b.exit!.occurredAt);
  const n = closed.length;
  if (n === 0) return { n: 0, winRate: null, meanPnlPct: null, medianPnlPct: null, worstPnlPct: null, totalPnl: 0, maxDrawdownUsd: 0, costShare: null, note: 'Small samples are noisy' };
  const pcts = closed.map((d) => d.pnlPct ?? 0);
  const wins = closed.filter((d) => (d.pnlUsd ?? 0) > 0).length;
  let eq = 0, peak = 0, dd = 0, fees = 0, gross = 0;
  for (const d of closed) {
    eq += d.pnlUsd ?? 0; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq);
    fees += d.entry!.feeUsd + d.exit!.feeUsd; gross += d.entry!.usdValue;
  }
  return {
    n, winRate: wins / n, meanPnlPct: pcts.reduce((a, b) => a + b, 0) / n, medianPnlPct: median(pcts), worstPnlPct: Math.min(...pcts),
    totalPnl: eq, maxDrawdownUsd: dd, costShare: gross > 0 ? fees / gross : null, note: n < 30 ? 'Small samples are noisy' : null,
  };
}
