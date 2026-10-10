import { Clock } from 'lucide-react';
import { fmtAge, fmtDate, fmtUsd } from '@shared/format';
import type { RuleResult, TokenDetail } from '@shared/types';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { StatCard } from '../../components/StatCard';
import { Tooltip } from '../../components/Tooltip';
import { useNow } from '../../state/hooks';
import { evidenceLine, ruleName } from '../../rules';
import { usdPrice } from '../Feed/columns';
import { ExitEstimate } from './ExitEstimate';
import { MiniChart } from './MiniChart';

export const STALE_MS = 180_000;
const dot = (points: number): string => (points >= 20 ? 'var(--bad)' : points >= 10 ? 'var(--warn)' : 'var(--text-3)');

function FlagRow({ r }: { r: RuleResult }) {
  return (
    <div className="row-flex" style={{ height: 28, borderBottom: '1px solid var(--border)', padding: '0 8px', gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot(r.points), flex: 'none' }} />
      <span style={{ fontSize: 12, fontWeight: 600, flex: 'none' }}>{ruleName(r.ruleId)}</span>
      <span className="truncate" style={{ fontSize: 11, color: 'var(--text-2)', flex: 1 }}>{evidenceLine(r.evidence)}</span>
      <span className="mono" style={{ fontSize: 12 }}>+{r.points}</span>
    </div>
  );
}

export function Overview({ detail }: { detail: TokenDetail }) {
  const now = useNow(5000);
  const snap = detail.latest;
  const stale = !snap || now - snap.observedAt > STALE_MS;
  const sub = (
    <span className="row-flex" style={{ gap: 4 }}>
      {stale ? <Tooltip content="Older than 3 minutes"><Clock size={12} strokeWidth={1.5} color="var(--warn)" aria-label="Stale value" /></Tooltip> : null}
      as of {snap ? fmtDate(snap.observedAt, now) : '—'}
    </span>
  );
  const cards: [React.ReactNode, string][] = [
    ['Price', usdPrice(snap?.priceUsd ?? null)], [<GlossaryTerm key="l" term="Liquidity" />, fmtUsd(snap?.liquidityUsd)], [<GlossaryTerm key="f" term="FDV" />, fmtUsd(snap?.fdvUsd)],
    ['Vol 1h', fmtUsd(snap?.volH1)], ['Buyers 1h', snap?.buyersH1 == null ? '—' : String(snap.buyersH1)], ['Age', fmtAge(now - detail.pool.createdAtChain)],
  ];
  const results = detail.judgement?.results ?? [];
  const hits = results.filter((r) => r.status === 'hit').sort((a, b) => b.points - a.points);
  const unknown = results.filter((r) => r.status === 'unknown');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {cards.map(([label, value], i) => <StatCard key={i} label={label} value={value} sub={sub} width="100%" />)}
        </div>
        <section className="panel" style={{ padding: 12 }}>
          <h3 className="section-title" style={{ marginBottom: 8 }}>Risk flags</h3>
          {!detail.judgement ? <div className="muted" style={{ fontSize: 12 }}>No judgement yet.</div> : hits.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No rules triggered. This does not mean the token is safe.</div> : hits.map((r) => <FlagRow key={r.ruleId} r={r} />)}
          {unknown.length > 0 ? (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12, color: 'var(--text-2)', cursor: 'pointer' }}>Unknown (data missing)</summary>
              {unknown.map((r) => <div key={r.ruleId} style={{ fontSize: 12, color: 'var(--text-3)', padding: '2px 8px' }}>{ruleName(r.ruleId)}</div>)}
            </details>
          ) : null}
        </section>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <MiniChart tokenId={detail.token.id} />
        <ExitEstimate tokenId={detail.token.id} />
      </div>
    </div>
  );
}
