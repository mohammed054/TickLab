import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp
} from 'lightweight-charts'
import { publishWorkspaceChange, useWorkspaceContext } from '../../shared/sync-bus'
import {
  aggregateCandles,
  cvd,
  ema,
  midPrices,
  rollingRealizedVol,
  sma,
  toLine,
  vwap
} from './indicators'
import { generateFixture } from './fixtureData'
import { PriceChartOverlay } from './PriceChartOverlay'
import type {
  CandleDatum,
  ChartMode,
  OverlayDef,
  OverlayId,
  TimeframeId
} from './types'
import { TIMEFRAME_MS } from './types'
import { EMPTY_MARKS } from './types'

export interface PriceChartProps {
  symbol: string
  exchange: string
}

const MODES: { id: ChartMode; label: string; disabledReason: string | null }[] = [
  { id: 'candles', label: 'Candles', disabledReason: null },
  { id: 'line', label: 'Line', disabledReason: null },
  { id: 'area', label: 'Area', disabledReason: null },
  { id: 'tick', label: 'Tick', disabledReason: null },
  { id: 'trades', label: 'Trades', disabledReason: null },
  // §7.2.1: shown but disabled with tooltip while the dataset lacks the
  // finer-grained event data (docs/05 §5.5) or the live normalized stream.
  { id: 'footprint', label: 'Footprint', disabledReason: 'Needs the fine-grained event stream (docs/05 §5.5) — unavailable for this dataset' },
  { id: 'depth', label: 'Depth', disabledReason: 'Needs order-book state (Block 3.3) — unavailable yet' },
  { id: 'orderflow', label: 'Order flow', disabledReason: 'Needs the fine-grained event stream (docs/05 §5.5) — unavailable for this dataset' },
  { id: 'replay', label: 'Replay', disabledReason: null } // enabled only while Sync Bus replay is active (see below)
]

const TIMEFRAMES: TimeframeId[] = ['tick', '1s', '5s', '15s', '30s', '1m', '5m', '15m', '1h', '4h', '1d', 'custom']

const OVERLAYS: OverlayDef[] = [
  { id: 'vwap', label: 'VWAP', disabledReason: null },
  { id: 'ma', label: 'Moving average', disabledReason: null },
  { id: 'ema', label: 'EMA', disabledReason: null },
  { id: 'volume', label: 'Volume', disabledReason: null },
  { id: 'volatility', label: 'Volatility (realized, §9.11)', disabledReason: null },
  { id: 'cvd', label: 'Cumulative volume delta', disabledReason: null },
  { id: 'midPrice', label: 'Mid price', disabledReason: null },
  // Book-feed overlays: disabled until the order-book stream exists (Block 3.3).
  { id: 'spread', label: 'Spread', disabledReason: 'Needs the order-book feed (Block 3.3)' },
  { id: 'obImbalance', label: 'Order-book imbalance', disabledReason: 'Needs the order-book feed (Block 3.3)' },
  { id: 'microPrice', label: 'Micro-price', disabledReason: 'Needs the order-book feed (Block 3.3)' },
  // Strategy-gated overlays: only shown when a strategy exposes them (§7.2.4,
  // fair_value per docs/08 §8.6). Hidden section while no strategy is attached.
  { id: 'fairValue', label: 'Fair value (strategy)', disabledReason: 'No strategy attached' },
  { id: 'strategyQuotes', label: 'Strategy quotes', disabledReason: 'No strategy attached' },
  { id: 'simOrders', label: 'Simulated orders', disabledReason: 'No strategy attached' },
  { id: 'liveOrders', label: 'Live orders', disabledReason: 'No strategy attached' },
  { id: 'simFills', label: 'Simulated fills', disabledReason: 'No strategy attached' },
  { id: 'liveFills', label: 'Live fills', disabledReason: 'No strategy attached' },
  { id: 'inventory', label: 'Inventory', disabledReason: 'No strategy attached' },
  { id: 'pnl', label: 'P&L', disabledReason: 'No strategy attached' },
  { id: 'latencyMarkers', label: 'Latency markers', disabledReason: 'No strategy attached' }
]

const STRATEGY_OVERLAYS: OverlayId[] = ['fairValue', 'strategyQuotes', 'simOrders', 'liveOrders', 'simFills', 'liveFills', 'inventory', 'pnl', 'latencyMarkers']

interface ChartPrefs {
  mode: ChartMode
  timeframe: TimeframeId
  customMs: number
  overlays: Record<string, boolean>
  maPeriod: number
  emaPeriod: number
}

const DEFAULT_PREFS: ChartPrefs = {
  mode: 'candles',
  timeframe: '1m',
  customMs: 120_000,
  overlays: { vwap: false },
  maPeriod: 20,
  emaPeriod: 12
}

function loadPrefs(symbol: string): ChartPrefs {
  try {
    const raw = localStorage.getItem(`ticklab.chartprefs.${symbol}`)
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ChartPrefs>) }
  } catch { /* corrupted prefs → defaults */ }
  return DEFAULT_PREFS
}

/**
 * Central price chart (docs/07 §7.2) on lightweight-charts + overlay canvas.
 * Timeframe/mode/overlay prefs are local UI state (docs/02 §2.3.3); overlay
 * visibility persistence is per-user (docs/15 §15.5 user_chart_prefs) — stored
 * in localStorage until a prefs endpoint exists in the §15.2 REST table.
 */
export function PriceChart({ symbol, exchange }: PriceChartProps) {
  void exchange
  const timestamp = useWorkspaceContext((s) => s.timestamp)
  const setTimestamp = useWorkspaceContext((s) => s.setTimestamp)
  const replay = useWorkspaceContext((s) => s.replay)
  const strategy = useWorkspaceContext((s) => s.strategy)

  const [prefs, setPrefs] = useState<ChartPrefs>(() => loadPrefs(symbol))
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [jumpInput, setJumpInput] = useState('')
  const [showOverlays, setShowOverlays] = useState(false)
  const [showCustomTf, setShowCustomTf] = useState(false)
  const [customDur, setCustomDur] = useState('2')
  const [customUnit, setCustomUnit] = useState<'s' | 'm' | 'h'>('m')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hover, setHover] = useState<{ x: number; y: number; candle: CandleDatum } | null>(null)
  const [usingFixture, setUsingFixture] = useState(true)

  const wrapRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick' | 'Line' | 'Area' | 'Histogram'> | null>(null)
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<'Line' | 'Histogram'>>>(new Map())
  const candlesRef = useRef<CandleDatum[]>([])
  const byTimeRef = useRef<Map<number, CandleDatum>>(new Map())
  const lastPreviewRef = useRef(0)
  const lastCommitRef = useRef<number | null>(null)
  const lockRef = useRef<number | null>(null)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  // Fixture source (dev) — replaced by the market/replay feed when available.
  const fixture = useMemo(() => generateFixture(symbol), [symbol])
  useEffect(() => {
    setUsingFixture(true)
    setPrefs(loadPrefs(symbol))
    lastCommitRef.current = null
    lockRef.current = null
  }, [symbol])

  const tfMs = prefs.timeframe === 'tick' ? 1000
    : prefs.timeframe === 'custom' ? prefs.customMs
    : TIMEFRAME_MS[prefs.timeframe]
  const candles = useMemo(
    () => aggregateCandles(fixture.candles1s, tfMs),
    [fixture, tfMs]
  )
  useEffect(() => {
    candlesRef.current = candles
    const m = new Map<number, CandleDatum>()
    for (const c of candles) m.set(Math.floor(c.timeNs / 1_000_000_000), c)
    byTimeRef.current = m
  }, [candles])

  // Persist prefs per user+symbol (server user_chart_prefs sync: no endpoint yet).
  useEffect(() => {
    try {
      localStorage.setItem(`ticklab.chartprefs.${symbol}`, JSON.stringify(prefs))
    } catch { /* storage full/blocked → prefs stay session-local */ }
  }, [prefs, symbol])

  const replayActive = replay != null
  const effectiveMode: ChartMode = prefs.mode === 'replay' && !replayActive ? 'candles' : prefs.mode

  const setPref = useCallback(<K extends keyof ChartPrefs>(k: K, v: ChartPrefs[K]) => {
    setPrefs((p) => ({ ...p, [k]: v }))
  }, [])

  const toggleOverlay = useCallback((id: OverlayId) => {
    setPrefs((p) => ({ ...p, overlays: { ...p.overlays, [id]: !p.overlays[id] } }))
  }, [])

  // ---- chart lifecycle ----
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let chart: IChartApi | null = null
    try {
      chart = createChart(el, {
        width: el.clientWidth,
        height: el.clientHeight,
        layout: {
          background: { color: 'transparent' },
          textColor: '#888',
          fontFamily: 'sans-serif',
          fontSize: 11
        },
        grid: {
          vertLines: { color: 'rgba(51,51,51,0.5)' },
          horzLines: { color: 'rgba(51,51,51,0.5)' }
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: '#888', labelBackgroundColor: '#333' },
          horzLine: { color: '#888', labelBackgroundColor: '#333' }
        },
        rightPriceScale: { borderColor: '#333' },
        leftPriceScale: { visible: false, borderColor: '#333' },
        timeScale: { borderColor: '#333', timeVisible: true, secondsVisible: true }
      })
    } catch (e) {
      console.error('[PriceChart] failed to create chart:', e)
      return
    }
    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      chart?.applyOptions({ width: el.clientWidth, height: el.clientHeight })
    })
    ro.observe(el)

    // Hover → tooltip + throttled (≤20Hz) Sync Bus timestamp preview (§7.2.5).
    const onCross = (param: { time?: unknown; point?: { x: number; y: number } }) => {
      if (param.time == null || param.point == null) {
        setHover(null)
        return
      }
      const sec = typeof param.time === 'number' ? param.time : null
      const candle = sec != null ? byTimeRef.current.get(sec) ?? null : null
      setHover(candle ? { x: param.point.x, y: param.point.y, candle } : null)
      if (candle) {
        const now = performance.now()
        if (now - lastPreviewRef.current >= 50) {
          lastPreviewRef.current = now
          // Preview publish only (no local commit): linked read-only displays
          // update without navigating the Secondary Monitor (docs/02 §2.3.2/4).
          publishWorkspaceChange({ timestamp: candle.timeNs })
        }
      }
    }
    chart.subscribeCrosshairMove(onCross as never)

    // Click → commit crosshair as active timestamp (§7.2.5, docs/02 §2.3.2 item 3).
    const onClick = (param: { time?: unknown }) => {
      if (param.time == null || typeof param.time !== 'number') return
      const candle = byTimeRef.current.get(param.time)
      if (!candle) return
      lockRef.current = candle.timeNs
      lastCommitRef.current = candle.timeNs
      setTimestamp(candle.timeNs)
      publishWorkspaceChange({ timestamp: candle.timeNs })
    }
    chart.subscribeClick(onClick as never)

    return () => {
      ro.disconnect()
      try {
        chart.unsubscribeCrosshairMove(onCross as never)
        chart.unsubscribeClick(onClick as never)
        chart.remove()
      } catch { /* already disposed */ }
      chartRef.current = null
      mainSeriesRef.current = null
      overlaySeriesRef.current.clear()
    }
  }, [setTimestamp])

  // ---- main series per mode ----
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    if (mainSeriesRef.current) {
      try { chart.removeSeries(mainSeriesRef.current) } catch { /* gone */ }
      mainSeriesRef.current = null
    }
    const data = candlesRef.current
    if (data.length === 0) return

    const toSec = (ns: number): UTCTimestamp => Math.floor(ns / 1_000_000_000) as UTCTimestamp
    let s: ISeriesApi<'Candlestick' | 'Line' | 'Area' | 'Histogram'> | null = null
    try {
      if (effectiveMode === 'candles' || effectiveMode === 'replay') {
        const cs = chart.addCandlestickSeries({
          upColor: '#35c26e', downColor: '#e5534b',
          wickUpColor: '#35c26e', wickDownColor: '#e5534b',
          borderVisible: false
        })
        cs.setData(data.map((c) => ({ time: toSec(c.timeNs), open: c.open, high: c.high, low: c.low, close: c.close })))
        s = cs
      } else if (effectiveMode === 'line' || effectiveMode === 'tick') {
        const ls = chart.addLineSeries({ color: '#58a6ff', lineWidth: 2 })
        ls.setData(data.map((c) => ({ time: toSec(c.timeNs), value: c.close })))
        s = ls
      } else if (effectiveMode === 'area') {
        const as = chart.addAreaSeries({
          lineColor: '#58a6ff', topColor: 'rgba(88,166,255,0.4)', bottomColor: 'rgba(88,166,255,0.0)'
        })
        as.setData(data.map((c) => ({ time: toSec(c.timeNs), value: c.close })))
        s = as
      } else if (effectiveMode === 'trades') {
        const hs = chart.addHistogramSeries({ priceScaleId: '' })
        hs.setData(data.map((c) => ({
          time: toSec(c.timeNs), value: c.tradeCount,
          color: c.close >= c.open ? 'rgba(53,194,110,0.7)' : 'rgba(229,83,75,0.7)'
        })))
        s = hs
      }
    } catch (e) {
      console.error('[PriceChart] failed to build series:', e)
      return
    }
    mainSeriesRef.current = s
    try {
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.length - 300), to: data.length - 1 })
    } catch { /* empty range */ }

    // Replay range shading + playhead via series markers.
    if (effectiveMode === 'replay' && replayActive && replay && s) {
      try {
        (s as ISeriesApi<'Candlestick'>).setMarkers([
          { time: toSec(replay.rangeStart), position: 'inBar', color: '#d29922', shape: 'vertical', text: '▶ start' } as never,
          { time: toSec(replay.rangeEnd), position: 'inBar', color: '#d29922', shape: 'vertical', text: 'end ◀' } as never
        ])
      } catch { /* markers unsupported on this series kind */ }
    }
  }, [effectiveMode, candles, replayActive, replay])

  // ---- overlay series ----
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const data = candlesRef.current
    if (data.length === 0) return
    const toSec = (ns: number): UTCTimestamp => Math.floor(ns / 1_000_000_000) as UTCTimestamp
    const live = overlaySeriesRef.current
    const p = prefsRef.current
    const closes = data.map((c) => c.close)
    const candleSec = Math.max(1, Math.round(((data[1]?.timeNs ?? data[0].timeNs + 1_000_000_000) - data[0].timeNs) / 1_000_000_000))

    const ensure = (id: string, build: () => ISeriesApi<'Line' | 'Histogram'> | null) => {
      if (!live.has(id)) {
        const s = build()
        if (s) live.set(id, s)
      }
      return live.get(id)
    }
    const drop = (id: string) => {
      const s = live.get(id)
      if (s) {
        try { chart.removeSeries(s) } catch { /* gone */ }
        live.delete(id)
      }
    }
    const setLine = (id: string, pts: { timeNs: number; value: number }[], color: string, scale: '' | 'left' = '') => {
      const s = ensure(id, () => {
        const ls = chart.addLineSeries({ color, lineWidth: 1, priceScaleId: scale, crosshairMarkerVisible: false })
        return ls
      })
      if (s && (s as ISeriesApi<'Line'>).setData) {
        ;(s as ISeriesApi<'Line'>).setData(pts.map((pt) => ({ time: toSec(pt.timeNs), value: pt.value })))
      }
    }

    try {
      if (p.overlays.vwap) setLine('vwap', vwap(data), '#d29922')
      else drop('vwap')

      if (p.overlays.ma) setLine('ma', toLine(data, sma(closes, p.maPeriod)), '#e6e6e6')
      else drop('ma')

      if (p.overlays.ema) setLine('ema', toLine(data, ema(closes, p.emaPeriod)), '#58a6ff')
      else drop('ema')

      if (p.overlays.midPrice) setLine('midPrice', midPrices(data), '#8b949e')
      else drop('midPrice')

      if (p.overlays.cvd) setLine('cvd', cvd(data), '#58a6ff', 'left')
      else drop('cvd')

      if (p.overlays.volatility) {
        setLine('volatility', toLine(data, rollingRealizedVol(closes, candleSec)), '#d29922', 'left')
      } else drop('volatility')

      if (p.overlays.volume) {
        const s = ensure('volume', () => chart.addHistogramSeries({
          priceScaleId: 'vol', priceFormat: { type: 'volume' }
        }))
        if (s) {
          (s as ISeriesApi<'Histogram'>).setData(data.map((c) => ({
            time: toSec(c.timeNs), value: c.volume,
            color: c.close >= c.open ? 'rgba(53,194,110,0.5)' : 'rgba(229,83,75,0.5)'
          })))
          chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
        }
      } else {
        drop('volume')
        try { chart.priceScale('vol').applyOptions({ scaleMargins: { top: 1, bottom: 1 } }) } catch { /* no vol scale */ }
      }

      const needLeft = Boolean(p.overlays.cvd || p.overlays.volatility)
      chart.priceScale('left').applyOptions({ visible: needLeft })
    } catch (e) {
      console.error('[PriceChart] overlay update failed:', e)
    }
  }, [candles, prefs.overlays, prefs.maPeriod, prefs.emaPeriod])

  // ---- simulated live tick on the fixture (dev only; exercises the update path) ----
  useEffect(() => {
    if (!usingFixture) return
    const t = setInterval(() => {
      const s = mainSeriesRef.current
      const data = candlesRef.current
      if (!s || data.length === 0) return
      const last = data[data.length - 1]
      const drift = (Math.random() - 0.5) * last.close * 0.0002
      const close = Math.max(last.close + drift, 0.01)
      last.close = close
      last.high = Math.max(last.high, close)
      last.low = Math.min(last.low, close)
      try {
        const time = Math.floor(last.timeNs / 1_000_000_000) as UTCTimestamp
        if (effectiveMode === 'candles' || effectiveMode === 'replay') {
          (s as ISeriesApi<'Candlestick'>).update({ time, open: last.open, high: last.high, low: last.low, close })
        } else if (effectiveMode === 'line' || effectiveMode === 'tick') {
          (s as ISeriesApi<'Line'>).update({ time, value: close })
        } else if (effectiveMode === 'area') {
          (s as ISeriesApi<'Area'>).update({ time, value: close })
        }
      } catch { /* series replaced mid-tick */ }
    }, 1000)
    return () => clearInterval(t)
  }, [usingFixture, effectiveMode])

  // ---- remote timestamp → animated jump (§7.2.6) ----
  useEffect(() => {
    if (timestamp == null || timestamp === lastCommitRef.current) return
    animateJumpTo(timestamp)
  }, [timestamp])

  const animateJumpTo = useCallback((timeNs: number) => {
    const chart = chartRef.current
    if (!chart) return
    const data = candlesRef.current
    const targetSec = Math.floor(timeNs / 1_000_000_000)
    let idx = -1
    for (let i = 0; i < data.length; i++) {
      if (Math.floor(data[i].timeNs / 1_000_000_000) <= targetSec) idx = i
      else break
    }
    if (idx < 0) return
    // Animate (not snap) so spatial context is preserved (§7.2.6).
    let range: { from: number; to: number } | null = null
    try { range = chart.timeScale().getVisibleLogicalRange() } catch { return }
    if (!range) return
    const span = range.to - range.from
    const target = { from: idx - span / 2, to: idx + span / 2 }
    const start = { ...range }
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 350)
      const e = 1 - (1 - k) * (1 - k)
      try {
        chart.timeScale().setVisibleLogicalRange({
          from: start.from + (target.from - start.from) * e,
          to: start.to + (target.to - start.to) * e
        })
      } catch { return }
      if (k < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [])

  const fitToData = useCallback(() => {
    const chart = chartRef.current
    const n = candlesRef.current.length
    if (!chart || n === 0) return
    try {
      chart.timeScale().setVisibleLogicalRange({ from: 0, to: n - 1 })
    } catch { /* empty */ }
  }, [])

  const resetView = useCallback(() => {
    // Clears zoom/overlay-local state, not global settings (§7.2.7).
    lockRef.current = null
    setHover(null)
    setMenu(null)
    fitToData()
  }, [fitToData])

  const clearLock = useCallback(() => {
    lockRef.current = null
    setHover(null)
  }, [])

  const takeScreenshot = useCallback(() => {
    const chart = chartRef.current
    if (!chart) return
    try {
      const url = chart.takeScreenshot().toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `ticklab-${symbol}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
      a.click()
    } catch (e) {
      console.error('[PriceChart] screenshot failed:', e)
    }
  }, [symbol])

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen().catch((e) => console.error('[PriceChart] fullscreen failed:', e))
  }, [])

  useEffect(() => {
    const onFs = () => setIsFullscreen(document.fullscreenElement != null)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Scoped to the chart container; centralized in useKeyboardShortcuts (Block 4.8, §14.6).
    if (e.key === 'f' || e.key === 'F') { fitToData(); e.preventDefault() }
    else if (e.key === 'Escape') { clearLock(); setMenu(null) }
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const jumpToInput = () => {
    const v = jumpInput.trim()
    if (!v) return
    let ns: number | null = null
    if (/^\d+$/.test(v)) {
      // Bare digits: ns epoch, or ms/s epoch auto-scaled.
      const n = Number(v)
      ns = v.length > 15 ? n : v.length > 12 ? n * 1_000_000 : n * 1_000_000_000
    } else {
      const ms = Date.parse(v)
      if (!Number.isNaN(ms)) ns = ms * 1_000_000
    }
    if (ns == null) return
    lastCommitRef.current = ns
    setTimestamp(ns)
    publishWorkspaceChange({ timestamp: ns })
    animateJumpTo(ns)
    setMenu(null)
  }

  const jumpToLatest = () => {
    const data = candlesRef.current
    if (data.length === 0) return
    const ns = data[data.length - 1].timeNs
    lastCommitRef.current = ns
    setTimestamp(ns)
    publishWorkspaceChange({ timestamp: ns })
    fitToData()
    setMenu(null)
  }

  const hasStrategy = strategy != null
  const visibleOverlays = OVERLAYS.filter((o) => hasStrategy || !STRATEGY_OVERLAYS.includes(o.id))

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        height: '100%', minHeight: 320, background: 'var(--color-bg-panel)',
        border: '1px solid var(--color-border-subtle)', borderRadius: 4, outline: 'none'
      }}
    >
      {/* Toolbar: segmented mode control (top-left) + timeframe + overlays + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Chart mode" style={{ display: 'flex', gap: 2 }}>
          {MODES.map((m) => {
            const disabled = m.disabledReason != null || (m.id === 'replay' && !replayActive)
            const reason = m.id === 'replay' && !replayActive
              ? 'Replay mode engages automatically when a backtest replay starts (docs/02 §2.3.2 item 2)'
              : m.disabledReason
            const active = effectiveMode === m.id
            return (
              <button
                key={m.id}
                role="tab"
                aria-selected={active}
                disabled={disabled}
                title={reason ?? m.label}
                onClick={() => !disabled && setPref('mode', m.id)}
                style={{
                  padding: '3px 10px', fontSize: 'var(--font-size-xs)', borderRadius: 4,
                  border: '1px solid var(--color-border-subtle)', cursor: disabled ? 'not-allowed' : 'pointer',
                  background: active ? '#333' : 'transparent',
                  color: active ? 'var(--color-text-primary)' : disabled ? '#555' : 'var(--color-text-secondary)',
                  opacity: disabled ? 0.6 : 1
                }}
              >
                {m.label}
              </button>
            )
          })}
        </div>

        <select
          aria-label="Timeframe"
          value={prefs.timeframe}
          onChange={(e) => {
            const tf = e.target.value as TimeframeId
            if (tf === 'custom') setShowCustomTf(true)
            else setPref('timeframe', tf)
          }}
          style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, fontSize: 'var(--font-size-xs)', padding: '3px 6px' }}
        >
          {TIMEFRAMES.map((t) => <option key={t} value={t}>{t === 'custom' ? `custom (${fmtDur(prefs.customMs)})` : t}</option>)}
        </select>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowOverlays((v) => !v)}
            style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, fontSize: 'var(--font-size-xs)', padding: '3px 10px', cursor: 'pointer' }}
          >
            Overlays
          </button>
          {showOverlays && (
            <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 20, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, padding: 8, minWidth: 260 }}>
              {visibleOverlays.map((o) => (
                <label key={o.id} title={o.disabledReason ?? o.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 'var(--font-size-xs)', color: o.disabledReason ? '#555' : 'var(--color-text-primary)', cursor: o.disabledReason ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="checkbox"
                    disabled={o.disabledReason != null}
                    checked={Boolean(prefs.overlays[o.id]) && o.disabledReason == null}
                    onChange={() => toggleOverlay(o.id)}
                  />
                  {o.label}
                </label>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  MA period <input type="number" min={2} max={500} value={prefs.maPeriod} onChange={(e) => setPref('maPeriod', clampInt(e.target.value, 2, 500, 20))} style={numInput} />
                </label>
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  EMA period <input type="number" min={2} max={500} value={prefs.emaPeriod} onChange={(e) => setPref('emaPeriod', clampInt(e.target.value, 2, 500, 12))} style={numInput} />
                </label>
              </div>
            </div>
          )}
        </div>

        {showCustomTf && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            <input value={customDur} onChange={(e) => setCustomDur(e.target.value)} style={{ ...numInput, width: 56 }} aria-label="Custom duration" />
            <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as 's' | 'm' | 'h')} style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 4 }}>
              <option value="s">sec</option>
              <option value="m">min</option>
              <option value="h">hours</option>
            </select>
            <button onClick={() => {
              const n = Math.max(1, Math.floor(Number(customDur) || 0))
              const ms = n * (customUnit === 's' ? 1000 : customUnit === 'm' ? 60_000 : 3_600_000)
              setPref('customMs', ms)
              setPref('timeframe', 'custom')
              setShowCustomTf(false)
            }} style={toolBtn}>Apply</button>
          </span>
        )}

        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          {usingFixture && (
            <span title="Fixture candles for development — connect the market feed for live data" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)', border: '1px solid currentColor', borderRadius: 4, padding: '2px 8px' }}>
              FIXTURE
            </span>
          )}
          {effectiveMode === 'tick' && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>finest available resolution</span>
          )}
          <button onClick={fitToData} title="Fit chart to data (F)" style={toolBtn}>Fit</button>
          <button onClick={resetView} title="Reset zoom and crosshair lock (keeps overlay settings)" style={toolBtn}>Reset</button>
          <button onClick={toggleFullscreen} title="Fullscreen toggle" style={toolBtn}>{isFullscreen ? 'Exit full' : 'Full'}</button>
          <button onClick={takeScreenshot} title="Screenshot current chart canvas to PNG" style={toolBtn}>PNG</button>
        </span>
      </div>

      {/* Chart + overlay canvas */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        <PriceChartOverlay
          chart={chartRef.current}
          series={mainSeriesRef.current}
          quotes={EMPTY_MARKS.quotes}
          orders={EMPTY_MARKS.orders}
          fills={EMPTY_MARKS.fills}
        />
        {hover && <HoverTooltip hover={hover} />}
      </div>

      {/* Context menu */}
      {menu && (
        <div style={{ position: 'absolute', left: menu.x, top: menu.y, zIndex: 30, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, padding: 8, minWidth: 240, fontSize: 'var(--font-size-xs)' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              placeholder="Jump to timestamp (ns / ISO)"
              style={{ flex: 1, background: 'var(--color-bg-panel)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, padding: '3px 6px' }}
              onKeyDown={(e) => { if (e.key === 'Enter') jumpToInput() }}
            />
            <button onClick={jumpToInput} style={toolBtn}>Go</button>
          </div>
          <button onClick={jumpToLatest} style={{ ...toolBtn, marginTop: 6, width: '100%' }}>Jump to latest</button>
          <button
            onClick={() => {
              const t = lockRef.current ?? hover?.candle.timeNs
              if (t != null) void navigator.clipboard?.writeText(String(t)).catch(() => undefined)
              setMenu(null)
            }}
            style={{ ...toolBtn, marginTop: 4, width: '100%' }}
          >
            Copy crosshair timestamp (ns)
          </button>
          <button onClick={() => { takeScreenshot(); setMenu(null) }} style={{ ...toolBtn, marginTop: 4, width: '100%' }}>Screenshot PNG</button>
        </div>
      )}
    </div>
  )
}

const toolBtn: React.CSSProperties = {
  background: 'transparent', color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border-subtle)', borderRadius: 4,
  fontSize: 'var(--font-size-xs)', padding: '3px 10px', cursor: 'pointer'
}

const numInput: React.CSSProperties = {
  width: 64, background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-subtle)', borderRadius: 4, padding: '2px 4px'
}

/** Candle hover tooltip (docs/07 §7.2.3). Volatility = stdev of intra-candle
 *  log returns (docs/09 §9.11 estimator family: realized vol from log returns). */
function HoverTooltip({ hover }: { hover: { x: number; y: number; candle: CandleDatum } }) {
  const { candle } = hover
  const delta = candle.buyVolume - candle.sellVolume
  const rows: [string, string][] = [
    ['O', fmtP(candle.open)],
    ['H', fmtP(candle.high)],
    ['L', fmtP(candle.low)],
    ['C', fmtP(candle.close)],
    ['Volume', candle.volume.toFixed(4)],
    ['Trades', String(candle.tradeCount)],
    ['Buy vol', candle.buyVolume.toFixed(4)],
    ['Sell vol', candle.sellVolume.toFixed(4)],
    ['Delta', `${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`],
    ['Spread (avg)', candle.avgSpread == null ? '—' : candle.avgSpread.toFixed(2)],
    ['Volatility (σ)', `${(candle.intraVolStdev * 10_000).toFixed(2)} bps`]
  ]
  return (
    <div
      className="num"
      style={{
        position: 'absolute',
        left: Math.min(hover.x + 16, 320),
        top: Math.max(hover.y - 40, 8),
        zIndex: 15, pointerEvents: 'none',
        background: 'rgba(13,13,13,0.95)', border: '1px solid var(--color-border-subtle)',
        borderRadius: 4, padding: '6px 10px', fontSize: 'var(--font-size-xs)',
        color: 'var(--color-text-primary)', display: 'grid',
        gridTemplateColumns: 'auto auto', gap: '1px 10px', whiteSpace: 'nowrap'
      }}
    >
      {rows.map(([k, v]) => (
        <span key={k} style={{ display: 'contents' }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>{k}</span>
          <span style={{ textAlign: 'right' }}>{v}</span>
        </span>
      ))}
    </div>
  )
}

function fmtP(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function fmtDur(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`
  if (ms % 60_000 === 0) return `${ms / 60_000}m`
  return `${ms / 1000}s`
}

function clampInt(raw: string, min: number, max: number, fb: number): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return fb
  return Math.min(max, Math.max(min, n))
}
