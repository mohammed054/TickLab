import { useEffect } from 'react';
import { useInvoke } from '../../state/hooks';
import { THEME } from '../../theme';
import { precisionFor, safeRemove, toTime, useChart } from './chartUtil';

const TWO_HOURS_S = 2 * 3600;

/** 100% x 200px line of closing prices for the last 2 hours (from 1m candles). */
export function MiniChart({ tokenId }: { tokenId: number }) {
  const { ref, chart } = useChart();
  const candles = useInvoke('detail:candles', { tokenId, tf: '1m' }, { intervalMs: 60000 });
  useEffect(() => {
    if (!chart || !candles.data || candles.data.length === 0) return;
    const pts = candles.data.map((c) => ({ time: toTime(c.t), value: c.c }));
    const last = pts[pts.length - 1];
    if (!last) return;
    const recent = pts.filter((p) => p.time >= last.time - TWO_HOURS_S);
    const s = chart.addLineSeries({ color: THEME.accent, lineWidth: 2, priceFormat: { type: 'price', precision: precisionFor(last.value), minMove: 10 ** -precisionFor(last.value) } });
    s.setData(recent);
    chart.timeScale().fitContent();
    return () => safeRemove(chart, s);
  }, [chart, candles.data]);
  const empty = !candles.loading && (candles.data?.length ?? 0) === 0;
  return (
    <div className="panel" style={{ position: 'relative', height: 200 }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      {empty ? <div className="center-fill" style={{ position: 'absolute', inset: 0, fontSize: 12 }}>No price history yet.</div> : null}
    </div>
  );
}
