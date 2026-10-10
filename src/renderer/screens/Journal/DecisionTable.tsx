import { useMemo } from 'react';
import { fmtDate, fmtUsd } from '@shared/format';
import type { DecisionRow } from '@shared/types';
import { Chip } from '../../components/Chip';
import { Identicon } from '../../components/Identicon';
import { Pct } from '../../components/Pct';
import { ScoreChip } from '../../components/ScoreChip';
import { Table } from '../../components/Table';
import type { Column } from '../../components/Table';
import { usdPrice } from '../Feed/columns';

const STATUS_COLOR: Record<string, string> = { open: 'var(--accent)', closed: 'var(--text-2)', pending: 'var(--warn)', cancelled: 'var(--text-3)', expired: 'var(--text-3)' };
const pnlClass = (v: number | null): string => (v === null || v === 0 ? 'neutral' : v > 0 ? 'good' : 'bad');

export const decisionColumns: Column<DecisionRow>[] = [
  { id: 'created', header: 'Created', width: 110, render: (d) => fmtDate(d.createdAt) },
  { id: 'token', header: 'Token', width: 150, render: (d) => <span className="row-flex" style={{ gap: 6 }}><Identicon seed={d.mint} /><b style={{ fontWeight: 600 }}>{d.symbol}</b><span className="meta">{d.account}</span></span> },
  { id: 'size', header: 'Size', width: 80, align: 'right', render: (d) => fmtUsd(d.sizeUsd) },
  { id: 'entry', header: 'Entry', width: 90, align: 'right', render: (d) => usdPrice(d.entry?.priceUsd ?? null) },
  { id: 'exit', header: 'Exit', width: 90, align: 'right', render: (d) => usdPrice(d.exit?.priceUsd ?? null) },
  { id: 'pnl', header: 'PnL $', width: 80, align: 'right', render: (d) => <span className={`mono ${pnlClass(d.pnlUsd)}`}>{d.pnlUsd === null ? '—' : `${d.pnlUsd > 0 ? '+' : ''}${fmtUsd(d.pnlUsd)}`}</span> },
  { id: 'pnlpct', header: 'PnL %', width: 70, align: 'right', render: (d) => <Pct value={d.pnlPct} /> },
  { id: 'score', header: 'Score@entry', width: 80, render: (d) => <ScoreChip score={d.score} band={d.band} completeness={d.completeness} showBand={false} /> },
  { id: 'status', header: 'Status', width: 80, render: (d) => <Chip color={STATUS_COLOR[d.status] ?? 'var(--text-2)'}>{d.status}</Chip> },
  { id: 'thesis', header: 'Thesis', width: 160, flex: true, render: (d) => d.thesis },
];

export interface DecisionTableProps { rows: DecisionRow[]; onOpen: (d: DecisionRow) => void; fill?: boolean; selectedId?: number | null }

/** Journal decisions table. With `fill` it takes its parent's height; otherwise it sizes to its rows (max 480px). */
export function DecisionTable({ rows, onOpen, fill = false, selectedId = null }: DecisionTableProps) {
  const height = fill ? '100%' : Math.min(480, 28 + rows.length * 24 + 2);
  const key = useMemo(() => (d: DecisionRow) => String(d.id), []);
  return (
    <div className="panel" style={{ height }}>
      <Table columns={decisionColumns} rows={rows} rowKey={key} selectedKey={selectedId === null ? null : String(selectedId)} onSelect={(d) => onOpen(d)} onActivate={onOpen} fallbackHeight={fill ? 400 : 28 + rows.length * 24} />
    </div>
  );
}
