import { fmtDate, fmtPct } from '@shared/format';
import { AddrText } from '../../components/AddrText';
import { Chip } from '../../components/Chip';
import { StatCard } from '../../components/StatCard';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { useInvoke } from '../../state/hooks';

const CLASS_COLOR = { wallet: 'var(--accent)', program: 'var(--text-2)', burn: 'var(--warn)' } as const;

export function Holders({ tokenId }: { tokenId: number }) {
  const q = useInvoke('detail:holders', { tokenId }, { intervalMs: 60000 });
  const h = q.data;
  if (!h) return <div className="muted">{q.loading ? 'Loading…' : 'Holder data has not been fetched yet. It loads while this window is open.'}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <StatCard label={<GlossaryTerm term="Holder concentration">Top wallet %</GlossaryTerm>} value={fmtPct(h.top1Pct, false)} />
        <StatCard label="Top 10 wallets %" value={fmtPct(h.top10Pct, false)} />
        <StatCard label="In programs %" value={fmtPct(h.programsPct, false)} />
        <StatCard label="Burned %" value={fmtPct(h.burnedPct, false)} />
      </div>
      <table className="dense" style={{ tableLayout: 'fixed', maxWidth: 640 }}>
        <thead><tr><th style={{ width: 40 }}>#</th><th style={{ width: 130 }}>Owner</th><th style={{ width: 90 }}>Class</th><th className="r" style={{ width: 80 }}>% of supply</th><th style={{ width: 160 }} /></tr></thead>
        <tbody>
          {h.rows.slice(0, 20).map((r, i) => (
            <tr key={`${r.address}${i}`} style={{ height: 24 }}>
              <td className="mono">{i + 1}</td>
              <td><AddrText value={r.owner} /></td>
              <td><Chip color={CLASS_COLOR[r.class]}>{r.class}</Chip></td>
              <td className="num">{fmtPct(r.pct, false)}</td>
              <td><div style={{ width: 120, height: 8 }} className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, r.pct))}%`, background: r.class === 'wallet' ? 'var(--accent)' : 'var(--text-3)' }} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="meta">Observed {fmtDate(h.observedAt)} (refreshes every 10 min while open)</div>
    </div>
  );
}
