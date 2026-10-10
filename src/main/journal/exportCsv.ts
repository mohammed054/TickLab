// docs/06 §6.4 — CSV export, exact column list.
import type { DecisionRow } from '../../shared/types';

export const CSV_COLUMNS = ['decision_id', 'account', 'created_at', 'symbol', 'mint', 'size_usd', 'score', 'band', 'completeness', 'stop_rule', 'target_rule', 'thesis', 'entry_time', 'entry_price', 'exit_time', 'exit_price', 'fees_usd', 'pnl_usd', 'pnl_pct', 'status'] as const;

/** Quotes fields and neutralises spreadsheet formula injection from attacker-controlled token names. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const iso = (t: number | undefined): string => (t === undefined ? '' : new Date(t).toISOString());

export function toCsv(rows: DecisionRow[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const d of rows) {
    const fees = (d.entry?.feeUsd ?? 0) + (d.exit?.feeUsd ?? 0);
    lines.push([d.id, d.account, iso(d.createdAt), d.symbol, d.mint, d.sizeUsd, d.score, d.band, d.completeness, d.stopRule, d.targetRule, d.thesis,
      iso(d.entry?.occurredAt), d.entry?.priceUsd ?? '', iso(d.exit?.occurredAt), d.exit?.priceUsd ?? '', d.entry || d.exit ? fees : '', d.pnlUsd ?? '', d.pnlPct ?? '', d.status].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}
