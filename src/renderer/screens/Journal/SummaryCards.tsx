import { fmtPct, fmtUsd } from '@shared/format';
import type { JournalSummary } from '@shared/api';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { StatCard } from '../../components/StatCard';

export function SummaryCards({ s }: { s: JournalSummary | null }) {
  const pnl = s?.realizedPnl ?? null;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <StatCard label="Equity" value={fmtUsd(s?.equity)} sub={s ? `peak ${fmtUsd(s.peak)}` : undefined} />
        <StatCard label="Realized PnL" value={pnl === null ? '—' : `${pnl > 0 ? '+' : ''}${fmtUsd(pnl)}`} valueClass={pnl === null || pnl === 0 ? '' : pnl > 0 ? 'good' : 'bad'} />
        <StatCard label={`Win rate (n=${s?.n ?? 0})`} value={s?.winRate == null ? '—' : fmtPct(s.winRate * 100, false)} />
        <StatCard label="Open exposure" value={fmtUsd(s?.openExposure)} />
        <StatCard label={<GlossaryTerm term="Drawdown">Drawdown from peak</GlossaryTerm>} value={fmtPct(s?.drawdownPct, false)} />
        <StatCard label="Risk state" value={s ? (s.risk.active ? 'ACTIVE' : 'PAUSED') : '—'} valueClass={s ? (s.risk.active ? 'good' : 'bad') : ''} />
      </div>
      {s && s.n < 30 ? <div className="meta" style={{ marginTop: 4 }}>Small samples are noisy.</div> : null}
    </div>
  );
}
