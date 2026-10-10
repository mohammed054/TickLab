import { useEffect, useState } from 'react';
import type { Candle } from '@shared/types';
import { Segmented } from '../../components/Tabs';
import { useInvoke } from '../../state/hooks';
import { THEME } from '../../theme';
import { precisionFor, safeRemove, toTime, useChart } from './chartUtil';

type Tf = '1m' | '5m' | '15m';
const TFS = [{ id: '1m' as const, label: '1m' }, { id: '5m' as const, label: '5m' }, { id: '15m' as const, label: '15m' }];
export const MIN_CANDLES = 5;

function clean(candles: Candle[]): Candle[] {
  const seen = new Set<number>();
  return [...candles].sort((a, b) => a.t - b.t).filter((c) => { const t = toTime(c.t); if (seen.has(t)) return false; seen.add(t); return true; });
}

export function ChartTab({ tokenId }: { tokenId: number }) {
  const [tf, setTf] = useState<Tf>('5m');
  const { ref, chart } = useChart();
  const q = useInvoke('detail:candles', { tokenId, tf }, { intervalMs: 30000 });
  const count = q.data?.length ?? 0;
  useEffect(() => {
    if (!chart || !q.data || q.data.length < MIN_CANDLES) return;
    const data = clean(q.data);
    const last = data[data.length - 1]?.c ?? 1;
    const p = precisionFor(last);
    const candle = chart.addCandlestickSeries({ upColor: THEME.good, downColor: THEME.bad, wickUpColor: THEME.good, wickDownColor: THEME.bad, borderVisible: false, priceFormat: { type: 'price', precision: p, minMove: 10 ** -p } });
    candle.setData(data.map((c) => ({ time: toTime(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.3 } });
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
    vol.setData(data.map((c) => ({ time: toTime(c.t), value: c.v, color: c.c >= c.o ? THEME.good : THEME.bad })));
    chart.timeScale().fitContent();
    return () => safeRemove(chart, candle, vol);
  }, [chart, q.data]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 360 }}>
      <div className="row-flex" style={{ height: 32, flex: 'none' }}><Segmented options={TFS} value={tf} onChange={setTf} /></div>
      <div className="panel" style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
        {!q.loading && count < MIN_CANDLES ? <div className="center-fill" style={{ position: 'absolute', inset: 0, background: 'var(--bg-1)' }}>Not enough history yet.</div> : null}
      </div>
    </div>
  );
}
