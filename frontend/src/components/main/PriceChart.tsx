import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { timestampMsToNs, timestampNsToMs } from '../../contracts'
import type { Candle, StrategyFill } from '../../contracts'
import { fmtBtc, fmtClock, fmtPrice, fmtSize, fmtVolume } from '../../shared/format'
import { Seg } from './mm'

/* ------------------------------------------------------------------ config */

const TIMEFRAMES = [
  { value: 1_000, label: '1s' },
  { value: 5_000, label: '5s' },
  { value: 15_000, label: '15s' },
  { value: 60_000, label: '1m' },
  { value: 300_000, label: '5m' },
] as const
const TYPES = [
  { value: 'candles', label: 'Candles' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
] as const
type ChartType = (typeof TYPES)[number]['value']

const INDICATORS = [
  { id: 'vwap', label: 'VWAP', color: '#d4a72c' },
  { id: 'ema', label: 'EMA 9', color: '#8b9cf7' },
  { id: 'volume', label: 'Volume', color: null },
  { id: 'cvd', label: 'Cumulative delta', color: null },
  { id: 'fills', label: 'My fills', color: null },
] as const
type IndicatorId = (typeof INDICATORS)[number]['id']

const C = {
  up: '#26a69a',
  down: '#ef5350',
  ink: '#e6edf3',
  muted: '#8b97a6',
  faint: '#5b6674',
  grid: 'rgba(255,255,255,0.045)',
  axis: '#252f3c',
  tag: '#2b3645',
  accent: '#3b82f6',
  line: '#9fb3c8',
  fontMono: '10px "JetBrains Mono", ui-monospace, monospace',
}

const AXIS_W = 66
const AXIS_H = 20
const SUB_H = 56
const GAP = 6
const RIGHT_SLOTS = 4 // empty bar slots kept free on the right edge
const MIN_VISIBLE = 20
const MAX_VISIBLE = 500
const DEFAULT_VISIBLE = 120
const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => s * 1000)

/* ------------------------------------------------------------------- data */

interface Bar {
  t: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  buyVolume: number
  sellVolume: number
  trades: number
}

function aggregate(candles: Candle[], interval: number): Bar[] {
  const bars: Bar[] = []
  for (const c of candles) {
    const t = Math.floor(timestampNsToMs(c.timestampNs) / interval) * interval
    const last = bars[bars.length - 1]
    if (last && last.t === t) {
      last.high = Math.max(last.high, c.high)
      last.low = Math.min(last.low, c.low)
      last.close = c.close
      last.volume += c.volume
      last.buyVolume += c.buyVolume
      last.sellVolume += c.sellVolume
      last.trades += c.trades
    } else {
      bars.push({ t, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, buyVolume: c.buyVolume, sellVolume: c.sellVolume, trades: c.trades })
    }
  }
  return bars
}

interface Series {
  vwap: number[]
  ema: number[]
  cvd: number[]
}

/** Indicators are computed over the full history, then sliced for display, so values do not change when you pan or zoom. */
function computeSeries(bars: Bar[]): Series {
  const vwap: number[] = []
  const ema: number[] = []
  const cvd: number[] = []
  const k = 2 / (9 + 1)
  let pv = 0
  let vol = 0
  let e = 0
  let cum = 0
  bars.forEach((b, i) => {
    pv += ((b.high + b.low + b.close) / 3) * b.volume
    vol += b.volume
    vwap.push(vol > 0 ? pv / vol : b.close)
    e = i === 0 ? b.close : b.close * k + e * (1 - k)
    ema.push(e)
    cum += b.buyVolume - b.sellVolume
    cvd.push(cum)
  })
  return { vwap, ema, cvd }
}

function groupFills(fills: StrategyFill[], interval: number): Map<number, StrategyFill[]> {
  const map = new Map<number, StrategyFill[]>()
  for (const fill of fills) {
    const t = Math.floor(timestampNsToMs(fill.timestampNs) / interval) * interval
    const list = map.get(t)
    if (list) list.push(fill)
    else map.set(t, [fill])
  }
  return map
}

function niceStep(range: number, target: number): number {
  const raw = range / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / magnitude
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * magnitude
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const timeLabel = (ms: number, withSeconds: boolean) => fmtClock(ms).slice(0, withSeconds ? 8 : 5)

/* -------------------------------------------------------------- component */

interface Hover {
  x: number
  y: number
}

export function PriceChart({
  candles,
  fills,
  onSelectTimestamp,
  onPreviewTimestamp,
}: {
  candles: Candle[]
  fills: StrategyFill[]
  onSelectTimestamp: (timestampNs: string) => void
  onPreviewTimestamp?: (timestampNs: string | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const [interval, setIntervalMs] = useState<number>(1_000)
  const [type, setType] = useState<ChartType>('candles')
  const [enabled, setEnabled] = useState<ReadonlySet<IndicatorId>>(new Set<IndicatorId>(['vwap', 'volume', 'fills']))
  const [menuOpen, setMenuOpen] = useState(false)
  const [visible, setVisible] = useState(DEFAULT_VISIBLE)
  const [offset, setOffset] = useState(0) // bars between the newest bar and the right edge; 0 = following live
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<Hover | null>(null)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; offset: number; moved: boolean } | null>(null)

  const bars = useMemo(() => aggregate(candles, interval), [candles, interval])
  const series = useMemo(() => computeSeries(bars), [bars])
  const fillMap = useMemo(() => groupFills(fills, interval), [fills, interval])

  /* ---- geometry (pure function of state, shared by draw + pointer handlers) */
  const showVol = enabled.has('volume')
  const showCvd = enabled.has('cvd')
  const geo = useMemo(() => {
    const plotW = Math.max(10, size.w - AXIS_W)
    const subs = (showVol ? 1 : 0) + (showCvd ? 1 : 0)
    const bottom = Math.max(60, size.h - AXIS_H)
    const priceH = Math.max(60, bottom - subs * (SUB_H + GAP))
    let cursor = priceH + GAP
    const vol = showVol ? { top: cursor, bottom: (cursor += SUB_H) } : null
    if (showVol) cursor += GAP
    const cvd = showCvd ? { top: cursor, bottom: cursor + SUB_H } : null
    return { plotW, priceH, bottom, vol, cvd, barW: plotW / (visible + RIGHT_SLOTS) }
  }, [size, showVol, showCvd, visible])

  const endIndex = bars.length - offset
  const startIndex = endIndex - visible
  const idxAt = useCallback((x: number) => startIndex + Math.floor(x / geo.barW), [startIndex, geo.barW])
  const xAt = useCallback((i: number) => (i - startIndex + 0.5) * geo.barW, [startIndex, geo.barW])

  const hoverIndex = hover && hover.x >= 0 && hover.x < geo.plotW ? idxAt(hover.x) : null
  const hoverBar = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < bars.length ? bars[hoverIndex] : null
  const maxOffset = Math.max(0, bars.length - MIN_VISIBLE)

  /* ---- keep the viewed window anchored when scrolled back and new bars arrive */
  const prevLen = useRef(bars.length)
  useEffect(() => {
    const added = bars.length - prevLen.current
    prevLen.current = bars.length
    if (added > 0 && offset > 0) setOffset((o) => clamp(o + added, 0, Math.max(0, bars.length - MIN_VISIBLE)))
  }, [bars.length]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- timeframe change: reset the view */
  useEffect(() => {
    setOffset(0)
    setVisible(clamp(Math.floor(candles.length / (interval / 1_000)), 30, DEFAULT_VISIBLE))
  }, [interval]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- publish cursor time to the rest of the workspace */
  const previewKey = hoverBar ? hoverBar.t : null
  useEffect(() => {
    onPreviewTimestamp?.(previewKey === null ? null : timestampMsToNs(previewKey))
  }, [previewKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreviewTimestamp?.(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- resize */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /* ---- close indicator menu on outside click */
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  const fit = useCallback(() => {
    setVisible(DEFAULT_VISIBLE)
    setOffset(0)
    setHover(null)
  }, [])
  useEffect(() => {
    window.addEventListener('ticklab:chart-fit', fit)
    return () => window.removeEventListener('ticklab:chart-fit', fit)
  }, [fit])

  /* ---- wheel zoom around the cursor (native listener: React's is passive) */
  const view = useRef({ visible, offset, len: bars.length, barW: geo.barW, plotW: geo.plotW })
  view.current = { visible, offset, len: bars.length, barW: geo.barW, plotW: geo.plotW }
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const v = view.current
      const rect = el.getBoundingClientRect()
      const x = clamp(event.clientX - rect.left, 0, v.plotW)
      const next = clamp(Math.round(v.visible * (event.deltaY > 0 ? 1.12 : 1 / 1.12)), MIN_VISIBLE, MAX_VISIBLE)
      if (next === v.visible) return
      const anchorIndex = v.len - v.offset - v.visible + x / v.barW
      const newStart = anchorIndex - (x / v.plotW) * (next + RIGHT_SLOTS)
      setVisible(next)
      setOffset(clamp(Math.round(v.len - (newStart + next)), 0, Math.max(0, v.len - MIN_VISIBLE)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* ---- pointer handling */
  const local = (event: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    wrapRef.current?.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, offset, moved: false }
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const p = local(event)
    const d = drag.current
    if (d) {
      const dx = event.clientX - d.x
      if (Math.abs(dx) > 3) {
        d.moved = true
        setDragging(true)
        setHover(null)
      }
      if (d.moved) setOffset(clamp(Math.round(d.offset + dx / geo.barW), 0, maxOffset))
      return
    }
    setHover(p.x < 0 || p.y < 0 || p.y > geo.bottom ? null : p)
  }
  const onPointerUp = (event: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (d && !d.moved) {
      const p = local(event)
      const i = idxAt(p.x)
      if (p.x < geo.plotW && i >= 0 && i < bars.length) onSelectTimestamp(timestampMsToNs(bars[i].t))
    }
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const current = hoverIndex ?? bars.length - 1 - offset
      const next = clamp(current + (event.key === 'ArrowLeft' ? -1 : 1), 0, bars.length - 1)
      let newOffset = offset
      if (next < startIndex) newOffset = clamp(bars.length - next - visible, 0, maxOffset)
      else if (next >= endIndex) newOffset = clamp(bars.length - next - 1, 0, maxOffset)
      setOffset(newOffset)
      setHover({ x: (next - (bars.length - newOffset - visible) + 0.5) * geo.barW, y: hover?.y ?? geo.priceH / 2 })
    } else if (event.key === 'End') {
      setOffset(0)
    } else if (event.key === 'Escape') {
      setHover(null)
    }
  }

  const exportPng = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `chart-${fmtClock(Date.now()).replace(/:/g, '')}.png`
    a.click()
  }

  /* ---- drawing */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0 || size.h === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.w * dpr)
    canvas.height = Math.round(size.h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    if (bars.length === 0) return

    const { plotW, priceH, bottom, vol, cvd, barW } = geo
    const i0 = Math.max(0, startIndex)
    const i1 = Math.min(bars.length, endIndex)
    if (i1 <= i0) return

    // price scale
    let lo = Infinity
    let hi = -Infinity
    for (let i = i0; i < i1; i += 1) {
      lo = Math.min(lo, type === 'candles' ? bars[i].low : bars[i].close)
      hi = Math.max(hi, type === 'candles' ? bars[i].high : bars[i].close)
    }
    const pad = Math.max((hi - lo) * 0.08, 0.5)
    const pMin = lo - pad
    const pMax = hi + pad
    const yP = (p: number) => ((pMax - p) / (pMax - pMin)) * priceH
    const priceAt = (y: number) => pMax - (y / priceH) * (pMax - pMin)

    ctx.font = C.fontMono
    ctx.textBaseline = 'middle'

    // horizontal grid + price labels
    const step = niceStep(pMax - pMin, Math.max(3, Math.floor(priceH / 54)))
    ctx.textAlign = 'right'
    const lastY0 = yP(bars[bars.length - 1].close)
    for (let p = Math.ceil(pMin / step) * step; p <= pMax; p += step) {
      const y = Math.round(yP(p)) + 0.5
      const nearTag = Math.abs(y - lastY0) < 11
      ctx.strokeStyle = C.grid
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(plotW, y)
      ctx.stroke()
      if (nearTag) continue
      ctx.fillStyle = C.faint
      ctx.fillText(fmtPrice(p), size.w - 6, y)
    }

    // vertical grid + time labels
    const minMs = (90 / barW) * interval
    const stepMs = TIME_STEPS.find((s) => s >= minMs && s >= interval) ?? TIME_STEPS[TIME_STEPS.length - 1]
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    let lastLabelX = -Infinity
    for (let i = i0; i < i1; i += 1) {
      if (bars[i].t % stepMs !== 0) continue
      const x = Math.round(xAt(i)) + 0.5
      ctx.strokeStyle = C.grid
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, bottom)
      ctx.stroke()
      if (x - lastLabelX >= 64) {
        ctx.fillStyle = C.faint
        ctx.fillText(timeLabel(bars[i].t, stepMs < 60_000), x, bottom + 5)
        lastLabelX = x
      }
    }

    // axes
    ctx.strokeStyle = C.axis
    ctx.beginPath()
    ctx.moveTo(plotW + 0.5, 0)
    ctx.lineTo(plotW + 0.5, bottom)
    ctx.moveTo(0, bottom + 0.5)
    ctx.lineTo(size.w, bottom + 0.5)
    ctx.stroke()

    // clip series to the plot
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, plotW, priceH)
    ctx.clip()

    if (type === 'candles') {
      const bodyW = Math.max(1, Math.floor(barW * 0.72))
      for (let i = i0; i < i1; i += 1) {
        const b = bars[i]
        const color = b.close >= b.open ? C.up : C.down
        const cx = Math.round(xAt(i)) + 0.5
        ctx.strokeStyle = color
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(cx, Math.round(yP(b.high)))
        ctx.lineTo(cx, Math.round(yP(b.low)))
        ctx.stroke()
        if (barW >= 3) {
          const top = Math.round(Math.min(yP(b.open), yP(b.close)))
          const h = Math.max(1, Math.round(Math.abs(yP(b.open) - yP(b.close))))
          ctx.fillRect(Math.round(cx - bodyW / 2), top, bodyW, h)
        }
      }
    } else {
      ctx.beginPath()
      for (let i = i0; i < i1; i += 1) {
        const x = xAt(i)
        if (i === i0) ctx.moveTo(x, yP(bars[i].close))
        else ctx.lineTo(x, yP(bars[i].close))
      }
      ctx.strokeStyle = C.line
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.lineWidth = 1
      if (type === 'area') {
        ctx.lineTo(xAt(i1 - 1), priceH)
        ctx.lineTo(xAt(i0), priceH)
        ctx.closePath()
        const gradient = ctx.createLinearGradient(0, 0, 0, priceH)
        gradient.addColorStop(0, 'rgba(159,179,200,0.22)')
        gradient.addColorStop(1, 'rgba(159,179,200,0)')
        ctx.fillStyle = gradient
        ctx.fill()
      }
    }

    const overlay = (values: number[], color: string) => {
      ctx.beginPath()
      for (let i = i0; i < i1; i += 1) {
        const x = xAt(i)
        if (i === i0) ctx.moveTo(x, yP(values[i]))
        else ctx.lineTo(x, yP(values[i]))
      }
      ctx.strokeStyle = color
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.lineWidth = 1
    }
    if (enabled.has('vwap')) overlay(series.vwap, INDICATORS[0].color)
    if (enabled.has('ema')) overlay(series.ema, INDICATORS[1].color)

    // fills as arrows: buys below the bar, sells above it
    if (enabled.has('fills')) {
      const w = barW >= 5 ? 4 : 3
      for (let i = i0; i < i1; i += 1) {
        const list = fillMap.get(bars[i].t)
        if (!list) continue
        const cx = xAt(i)
        const lowY = type === 'candles' ? yP(bars[i].low) : yP(bars[i].close)
        const highY = type === 'candles' ? yP(bars[i].high) : yP(bars[i].close)
        if (list.some((f) => f.side === 'BUY')) {
          ctx.fillStyle = C.up
          ctx.beginPath()
          ctx.moveTo(cx, lowY + 3)
          ctx.lineTo(cx - w, lowY + 3 + w * 1.8)
          ctx.lineTo(cx + w, lowY + 3 + w * 1.8)
          ctx.closePath()
          ctx.fill()
        }
        if (list.some((f) => f.side === 'SELL')) {
          ctx.fillStyle = C.down
          ctx.beginPath()
          ctx.moveTo(cx, highY - 3)
          ctx.lineTo(cx - w, highY - 3 - w * 1.8)
          ctx.lineTo(cx + w, highY - 3 - w * 1.8)
          ctx.closePath()
          ctx.fill()
        }
      }
    }
    ctx.restore()

    // last price line + axis tag
    const lastBar = bars[bars.length - 1]
    const lastY = yP(lastBar.close)
    if (lastY >= 0 && lastY <= priceH) {
      const color = lastBar.close >= lastBar.open ? C.up : C.down
      ctx.strokeStyle = color
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(0, Math.round(lastY) + 0.5)
      ctx.lineTo(plotW, Math.round(lastY) + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = color
      ctx.fillRect(plotW + 1, Math.round(lastY) - 8, AXIS_W - 2, 16)
      ctx.fillStyle = '#0b0e12'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(fmtPrice(lastBar.close), size.w - 6, Math.round(lastY))
    }

    // sub panes
    const pane = (box: { top: number; bottom: number }, title: string, max: string, min?: string) => {
      ctx.strokeStyle = C.axis
      ctx.beginPath()
      ctx.moveTo(0, box.top - 0.5)
      ctx.lineTo(size.w, box.top - 0.5)
      ctx.stroke()
      ctx.fillStyle = C.faint
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(title, 6, box.top + 3)
      ctx.textAlign = 'right'
      ctx.fillText(max, size.w - 6, box.top + 2)
      if (min) {
        ctx.textBaseline = 'bottom'
        ctx.fillText(min, size.w - 6, box.bottom - 2)
      }
    }
    if (vol) {
      let maxVol = 0
      for (let i = i0; i < i1; i += 1) maxVol = Math.max(maxVol, bars[i].volume)
      maxVol = maxVol || 1
      const h = vol.bottom - vol.top
      const bw = Math.max(1, Math.floor(barW * 0.72))
      for (let i = i0; i < i1; i += 1) {
        const b = bars[i]
        const bh = Math.max(1, (b.volume / maxVol) * (h - 14))
        ctx.fillStyle = b.close >= b.open ? 'rgba(38,166,154,0.55)' : 'rgba(239,83,80,0.55)'
        ctx.fillRect(Math.round(xAt(i) - bw / 2), vol.bottom - bh, bw, bh)
      }
      pane(vol, 'Volume (BTC)', fmtVolume(maxVol))
    }
    if (cvd) {
      let lowC = Infinity
      let highC = -Infinity
      for (let i = i0; i < i1; i += 1) {
        lowC = Math.min(lowC, series.cvd[i])
        highC = Math.max(highC, series.cvd[i])
      }
      const span = highC - lowC || 1
      const yC = (v: number) => cvd.bottom - 4 - ((v - lowC) / span) * (cvd.bottom - cvd.top - 20)
      if (lowC < 0 && highC > 0) {
        ctx.strokeStyle = C.axis
        ctx.setLineDash([2, 3])
        ctx.beginPath()
        ctx.moveTo(0, Math.round(yC(0)) + 0.5)
        ctx.lineTo(plotW, Math.round(yC(0)) + 0.5)
        ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.beginPath()
      for (let i = i0; i < i1; i += 1) {
        if (i === i0) ctx.moveTo(xAt(i), yC(series.cvd[i]))
        else ctx.lineTo(xAt(i), yC(series.cvd[i]))
      }
      ctx.strokeStyle = C.line
      ctx.stroke()
      const sv = (v: number) => `${v < 0 ? '\u2212' : v > 0 ? '+' : ''}${fmtVolume(v)}`
      pane(cvd, 'Cumulative delta (BTC)', sv(highC), sv(lowC))
    }

    // crosshair
    if (hover && hoverBar && hoverIndex !== null && !dragging) {
      const cx = Math.round(xAt(hoverIndex)) + 0.5
      ctx.fillStyle = 'rgba(255,255,255,0.045)'
      ctx.fillRect(Math.round(xAt(hoverIndex) - barW / 2), 0, Math.max(1, Math.round(barW)), bottom)
      ctx.strokeStyle = 'rgba(139,151,166,0.55)'
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(cx, 0)
      ctx.lineTo(cx, bottom)
      if (hover.y <= priceH) {
        ctx.moveTo(0, Math.round(hover.y) + 0.5)
        ctx.lineTo(plotW, Math.round(hover.y) + 0.5)
      }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.textBaseline = 'middle'
      if (hover.y <= priceH) {
        ctx.fillStyle = C.tag
        ctx.fillRect(plotW + 1, Math.round(hover.y) - 8, AXIS_W - 2, 16)
        ctx.fillStyle = C.ink
        ctx.textAlign = 'right'
        ctx.fillText(fmtPrice(priceAt(hover.y)), size.w - 6, Math.round(hover.y))
      }
      const label = timeLabel(hoverBar.t, true)
      const tw = ctx.measureText(label).width + 12
      const tx = clamp(cx - tw / 2, 0, plotW - tw)
      ctx.fillStyle = C.tag
      ctx.fillRect(tx, bottom + 1, tw, AXIS_H - 2)
      ctx.fillStyle = C.ink
      ctx.textAlign = 'center'
      ctx.fillText(label, tx + tw / 2, bottom + AXIS_H / 2)
    }
  }, [bars, series, fillMap, geo, size, type, enabled, hover, hoverBar, hoverIndex, startIndex, endIndex, interval, dragging, xAt])

  /* ---- legend + tooltip content */
  const legendIndex = hoverBar ? hoverIndex! : bars.length - 1
  const legendBar = bars[legendIndex]
  const prevClose = legendIndex > 0 ? bars[legendIndex - 1].close : legendBar?.open
  const change = legendBar && prevClose !== undefined ? legendBar.close - prevClose : 0
  const changePct = prevClose ? (change / prevClose) * 100 : 0
  const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '\u2212' : ''}${Math.abs(v).toFixed(3)}%`
  const tone = change > 0 ? 'pos' : change < 0 ? 'neg' : ''
  const intervalLabel = TIMEFRAMES.find((t) => t.value === interval)?.label ?? ''
  const barFills = hoverBar ? fillMap.get(hoverBar.t) : undefined

  const TIP_W = 214
  const tipH = 178 + (barFills ? 24 + Math.min(barFills.length, 6) * 17 : 0)
  const tipStyle = hover
    ? {
        left: hover.x + 18 + TIP_W > geo.plotW ? hover.x - 18 - TIP_W : hover.x + 18,
        top: clamp(hover.y + 14 + tipH > size.h ? hover.y - 14 - tipH : hover.y + 14, 4, Math.max(4, size.h - tipH - 4)),
      }
    : undefined

  return (
    <section className="mm-panel" aria-label="Price chart">
      <div className="mm-chart-tools">
        <Seg
          options={TIMEFRAMES.map((t) => ({ value: t.value as number, label: t.label }))}
          value={interval}
          onChange={setIntervalMs}
          label="Timeframe"
          isDisabled={(v) => (candles.length * 1_000) / v < 12}
        />
        <Seg options={TYPES} value={type} onChange={setType} label="Chart type" />
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button type="button" className="mm-btn" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((o) => !o)}>
            Indicators ▾
          </button>
          {menuOpen && (
            <div className="mm-menu" role="menu">
              {INDICATORS.map((ind) => (
                <label key={ind.id}>
                  <input
                    type="checkbox"
                    checked={enabled.has(ind.id)}
                    onChange={() =>
                      setEnabled((current) => {
                        const next = new Set(current)
                        if (next.has(ind.id)) next.delete(ind.id)
                        else next.add(ind.id)
                        return next
                      })
                    }
                  />
                  {ind.color && <span className="mm-swatch" style={{ background: ind.color }} />}
                  {ind.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <span className="grow" />
        {offset > 0 && (
          <button type="button" className="mm-btn" onClick={() => setOffset(0)} title="Jump to the latest bar (End)">
            Latest ▸▸
          </button>
        )}
        <button type="button" className="mm-btn" onClick={fit} title="Reset zoom and follow the latest bar (F)">Fit</button>
        <button type="button" className="mm-btn" onClick={exportPng} title="Export the chart as PNG">PNG</button>
      </div>

      <div
        ref={wrapRef}
        className="mm-chart-wrap"
        tabIndex={0}
        role="application"
        aria-label="Price chart. Arrow keys move the cursor bar by bar, End jumps to the latest bar."
        style={{ cursor: dragging ? 'grabbing' : 'crosshair', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !drag.current && setHover(null)}
        onKeyDown={onKeyDown}
      >
        <canvas ref={canvasRef} />

        {legendBar && (
          <div className="mm-legend num">
            <span className="muted">BTCUSDT · {intervalLabel}</span>
            <span><span className="k">O</span>{fmtPrice(legendBar.open)}</span>
            <span><span className="k">H</span>{fmtPrice(legendBar.high)}</span>
            <span><span className="k">L</span>{fmtPrice(legendBar.low)}</span>
            <span><span className="k">C</span>{fmtPrice(legendBar.close)}</span>
            <span className={tone}>{change >= 0 ? '+' : '\u2212'}{fmtPrice(Math.abs(change))} ({pct(changePct)})</span>
            {enabled.has('vwap') && <span style={{ color: INDICATORS[0].color }}><span className="k" style={{ color: 'inherit' }}>VWAP</span>{fmtPrice(series.vwap[legendIndex])}</span>}
            {enabled.has('ema') && <span style={{ color: INDICATORS[1].color }}><span className="k" style={{ color: 'inherit' }}>EMA 9</span>{fmtPrice(series.ema[legendIndex])}</span>}
          </div>
        )}

        {hover && hoverBar && !dragging && tipStyle && (
          <div className="mm-tip num" style={{ ...tipStyle, width: TIP_W }}>
            <div className="t">
              {timeLabel(hoverBar.t, true)} – {timeLabel(hoverBar.t + interval, true)} UTC
            </div>
            <div className="r"><span>Open</span><span>{fmtPrice(hoverBar.open)}</span></div>
            <div className="r"><span>High</span><span>{fmtPrice(hoverBar.high)}</span></div>
            <div className="r"><span>Low</span><span>{fmtPrice(hoverBar.low)}</span></div>
            <div className="r"><span>Close</span><span className={hoverBar.close >= hoverBar.open ? 'pos' : 'neg'}>{fmtPrice(hoverBar.close)}</span></div>
            <div className="r"><span>Change</span><span className={tone}>{change >= 0 ? '+' : '\u2212'}{fmtPrice(Math.abs(change))} ({pct(changePct)})</span></div>
            <div className="r"><span>Volume</span><span>{fmtSize(hoverBar.volume)} BTC</span></div>
            <div className="r"><span>Buy / Sell</span><span><span className="pos">{fmtSize(hoverBar.buyVolume)}</span> / <span className="neg">{fmtSize(hoverBar.sellVolume)}</span></span></div>
            <div className="r"><span>Trades</span><span>{hoverBar.trades}</span></div>
            {barFills && (
              <div className="sec">
                <div className="r"><span>My fills</span><span>{barFills.length}</span></div>
                {barFills.slice(0, 6).map((f) => (
                  <div className="r" key={f.id}>
                    <span className={f.side === 'BUY' ? 'pos' : 'neg'}>{f.side}</span>
                    <span>{fmtSize(f.size)} @ {fmtPrice(f.price)}</span>
                  </div>
                ))}
                <div className="r"><span>Position after</span><span>{fmtBtc(barFills[barFills.length - 1].positionAfter, true)}</span></div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
