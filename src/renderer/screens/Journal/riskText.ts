import { fmtUsd } from '@shared/format';
import type { RiskState } from '@shared/types';

export function pausedText(r: RiskState): string {
  if (r.pausedReason === 'drawdown') return `Drawdown reached ${r.drawdownPct.toFixed(1)}% from the peak. New decisions are paused until you review.`;
  if (r.pausedReason === 'daily_losses') return `${r.losingToday} losing trades today. New decisions resume after local midnight.`;
  return 'Paused.';
}
export function activeText(r: RiskState): string {
  return `max position ${fmtUsd(r.maxPositionUsd)}, open ${r.openCount}/${r.maxOpen}`;
}
/** Reason a decision cannot be created right now (null = allowed). */
export function blockReason(r: RiskState | null | undefined): string | null {
  if (!r) return null;
  if (!r.active) return pausedText(r);
  if (r.openCount >= r.maxOpen) return `Open positions limit reached (${r.openCount}/${r.maxOpen}).`;
  return null;
}
