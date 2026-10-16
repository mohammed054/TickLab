// Read-only equity timeline (Legacy Archive, T1.5). No deposit/withdrawal
// adjustments can be added; existing equity events are displayed as recorded.
import { useEffect } from 'react';
import { fmtDate, fmtUsd } from '@shared/format';
import type { Account } from '@shared/types';
import { useInvoke } from '../../state/hooks';
import { useStore } from '../../state/store';
import { THEME } from '../../theme';
import { toTime, useChart } from '../Detail/chartUtil';
import { safeRemove } from '../Detail/chartUtil';

export function EquityTab({ account }: { account: Account }) {
  const tick = useStore((s) => s.journalTick);
  const q = useInvoke('journal:equity:list', { account }, { intervalMs: 0 });
  const { ref, chart } = useChart();
  useEffect(() => { q.reload(); }, [tick, q.reload]);
  const pts = q.data ?? [];
  useEffect(() => {
    if (!chart || pts.length === 0) return;
    const seen = new Set<number>();
    const data = pts.map((p) => ({ time: toTime(p.at), value: p.equity })).sort((a, b) => a.time - b.time).filter((p) => !seen.has(p.time) && !!seen.add(p.time));
    const s = chart.addLineSeries({ color: THEME.accent, lineWidth: 2, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
    s.setData(data);
    chart.timeScale().fitContent();
    return () => safeRemove(chart, s);
  }, [chart, pts]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="panel" style={{ height: 260, position: 'relative' }}>
        <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
        {pts.length === 0 ? <div className="center-fill" style={{ position: 'absolute', inset: 0 }}>No equity events yet.</div> : null}
      </div>
      <table className="dense">
        <thead><tr><th>Time</th><th>Kind</th><th className="r">Equity</th><th>Note</th></tr></thead>
        <tbody>{[...pts].reverse().map((p, i) => <tr key={`${p.at}-${i}`}><td className="mono">{fmtDate(p.at)}</td><td>{p.kind}</td><td className="num">{fmtUsd(p.equity)}</td><td>{p.note}</td></tr>)}</tbody>
      </table>
      <div className="muted" style={{ fontSize: 11 }}>Equity events are a read-only legacy record; no deposits or withdrawals can be added.</div>
    </div>
  );
}
