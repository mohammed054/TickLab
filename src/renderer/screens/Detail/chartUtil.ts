import { useEffect, useRef, useState } from 'react';
import { ColorType, CrosshairMode, createChart } from 'lightweight-charts';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import { THEME } from '../../theme';

/** Candle times may be seconds or milliseconds; lightweight-charts wants seconds. */
export const toTime = (t: number): UTCTimestamp => (t > 1e12 ? Math.floor(t / 1000) : t) as UTCTimestamp;
export const precisionFor = (price: number): number => (price > 0 ? Math.max(2, Math.min(12, 3 - Math.floor(Math.log10(price)))) : 2);

/** Creates a dark-themed chart inside the returned ref's element and disposes it on unmount. */
export function useChart(): { ref: React.RefObject<HTMLDivElement>; chart: IChartApi | null } {
  const ref = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<IChartApi | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const c = createChart(el, {
      width: el.clientWidth || 300, height: el.clientHeight || 200,
      layout: { background: { type: ColorType.Solid, color: THEME.bg1 }, textColor: THEME.text2, fontFamily: 'JetBrains Mono, monospace' },
      grid: { vertLines: { color: THEME.border }, horzLines: { color: THEME.border } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: THEME.text3 }, horzLine: { color: THEME.text3 } },
      rightPriceScale: { borderColor: THEME.border }, timeScale: { borderColor: THEME.border, timeVisible: true },
    });
    setChart(c);
    const ro = new ResizeObserver(() => c.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => { ro.disconnect(); c.remove(); setChart(null); };
  }, []);
  return { ref, chart };
}

/** The chart may already be disposed when a series effect cleans up on unmount. */
export function safeRemove(chart: IChartApi, ...series: Parameters<IChartApi['removeSeries']>[0][]): void {
  for (const s of series) {
    try { chart.removeSeries(s); } catch { /* chart already disposed */ }
  }
}
