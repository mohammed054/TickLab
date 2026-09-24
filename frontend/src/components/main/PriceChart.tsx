import { useEffect, useMemo, useRef, useState } from 'react'
import { Candle, timestampNsToMs } from '../../contracts'
import { Panel, SegmentedControl } from '../shared/Panel'

const TIMEFRAMES = ['tick', '1s', '5s', '15s', '1m', '5m', '15m', '1h', '4h', '1D'] as const
type Timeframe = (typeof TIMEFRAMES)[number]
const MODES = ['candles', 'line', 'area', 'tick', 'trades', 'footprint', 'depth', 'orderflow', 'replay'] as const
type ChartMode = (typeof MODES)[number]
const OVERLAYS = ['VWAP', 'EMA', 'Volume', 'CVD', 'OB Imbalance', 'Strategy Quotes'] as const
const TIMEFRAME_MS: Record<Exclude<Timeframe, 'tick'>, number> = { '1s': 1_000, '5s': 5_000, '15s': 15_000, '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1D': 86_400_000 }
const CANVAS_FALLBACKS: Record<string, string> = { '--color-positive': '#3ecf8e', '--color-negative': '#ef5b5b', '--color-warning': '#d9a441', '--color-info': '#4d9de0', '--color-text-muted': '#8b95a5' }

function canvasColor(variable: string): string {
  if (typeof document === 'undefined') return CANVAS_FALLBACKS[variable] ?? '#8b95a5'
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || CANVAS_FALLBACKS[variable] || '#8b95a5'
}

export function PriceChart({ candles, onSelectTimestamp, onPreviewTimestamp }: { candles: Candle[]; onSelectTimestamp: (timestampNs: string) => void; onPreviewTimestamp?: (timestampNs: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const lastPreviewRef = useRef(0)
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const [mode, setMode] = useState<ChartMode>('candles')
  const [active, setActive] = useState<Set<string>>(new Set(['VWAP']))
  const [hover, setHover] = useState<Candle | null>(null)
  const [zoom, setZoom] = useState(1)
  const visibleCandles = useMemo(() => aggregateCandles(candles, timeframe), [candles, timeframe])
  const displayCandles = useMemo(() => {
    const count = Math.max(30, Math.round(90 / zoom))
    return visibleCandles.slice(Math.max(0, visibleCandles.length - count))
  }, [visibleCandles, zoom])

  const toggleOverlay = (overlay: string) => setActive((current) => { const next = new Set(current); if (next.has(overlay)) next.delete(overlay); else next.add(overlay); return next })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || displayCandles.length === 0) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(dpr, dpr)
    const width = rect.width
    const height = rect.height
    context.clearRect(0, 0, width, height)
    const lows = displayCandles.map((candle) => candle.low)
    const highs = displayCandles.map((candle) => candle.high)
    const min = Math.min(...lows)
    const max = Math.max(...highs)
    const padding = Math.max((max - min) * 0.08, 0.1)
    const yFor = (price: number) => height - ((price - (min - padding)) / (max - min + padding * 2)) * height
    const columnWidth = width / displayCandles.length
    context.strokeStyle = 'rgba(255,255,255,0.06)'
    context.lineWidth = 1
    for (let index = 1; index < 6; index += 1) { const y = (height / 6) * index; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke() }
    drawCandles(context, displayCandles, columnWidth, yFor, mode, height)
    if (active.has('VWAP')) drawLine(context, displayCandles.map((_, index) => vwapAt(displayCandles, index)), columnWidth, yFor, canvasColor('--color-warning'))
    if (active.has('EMA')) drawLine(context, displayCandles.map((_, index) => emaAt(displayCandles, index, 9)), columnWidth, yFor, canvasColor('--color-info'))
    if (active.has('CVD')) drawLine(context, cvdAt(displayCandles), columnWidth, yFor, canvasColor('--color-positive'))
    if (active.has('OB Imbalance')) drawLine(context, displayCandles.map((candle) => candle.close + (candle.buyVolume - candle.sellVolume) * 0.8), columnWidth, yFor, canvasColor('--color-info'))
    if (active.has('Strategy Quotes')) drawStrategyQuotes(context, displayCandles, width, yFor)
    if (active.has('Volume')) drawVolume(context, displayCandles, columnWidth, height)
    if (mode === 'depth') drawDepth(context, displayCandles, width, height)
    if (mode === 'orderflow') drawOrderFlow(context, displayCandles, columnWidth, height)
    if (mode === 'footprint') drawFootprint(context, displayCandles, columnWidth, height)
  }, [active, displayCandles, mode])

  const handleMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || displayCandles.length === 0) return
    const rect = canvas.getBoundingClientRect()
    const index = Math.min(displayCandles.length - 1, Math.max(0, Math.floor((event.clientX - rect.left) / (rect.width / displayCandles.length))))
    const candle = displayCandles[index]
    setHover(candle)
    const now = performance.now()
    if (onPreviewTimestamp && now - lastPreviewRef.current > 50) { lastPreviewRef.current = now; onPreviewTimestamp(candle.timestampNs) }
  }

  const fit = () => { setZoom(1); setHover(null) }
  const reset = () => { setZoom(1); setMode('candles'); setTimeframe('1m'); setActive(new Set(['VWAP'])) }
  const screenshot = () => { const canvas = canvasRef.current; if (!canvas) return; const anchor = document.createElement('a'); anchor.href = canvas.toDataURL('image/png'); anchor.download = 'ticklab-chart.png'; anchor.click() }
  const fullscreen = () => { if (shellRef.current?.requestFullscreen) void shellRef.current.requestFullscreen() }

  useEffect(() => {
    const onFit = () => { setZoom(1); setHover(null) }
    window.addEventListener('ticklab:chart-fit', onFit)
    return () => window.removeEventListener('ticklab:chart-fit', onFit)
  }, [])

  return (
    <div ref={shellRef} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Panel title="PRICE / MARKET CHART (SIMULATED)" style={{ flex: '1 1 auto', minHeight: 0 }} bodyStyle={{ display: 'flex', flexDirection: 'column', padding: 0 }} right={<div style={{ display: 'flex', gap: 3 }}><button type="button" onClick={fit} style={toolButtonStyle}>FIT</button><button type="button" onClick={reset} style={toolButtonStyle}>RESET</button><button type="button" onClick={screenshot} style={toolButtonStyle}>PNG</button><button type="button" onClick={fullscreen} style={toolButtonStyle}>FULL</button></div>}>
        <div style={{ display: 'flex', gap: 5, padding: '4px 8px', borderBottom: '1px solid var(--color-border-subtle)', overflowX: 'auto' }}><SegmentedControl value={mode} options={MODES.map((value) => ({ value, label: value === 'candles' ? 'CANDLES' : value.toUpperCase() }))} onChange={setMode} ariaLabel="Chart mode" /></div>
        <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid var(--color-border-subtle)', overflowX: 'auto' }}>{TIMEFRAMES.map((value) => <button key={value} type="button" aria-pressed={timeframe === value} onClick={() => setTimeframe(value)} style={{ ...toolButtonStyle, background: timeframe === value ? 'var(--color-bg-control)' : 'transparent', color: timeframe === value ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{value}</button>)}</div>
        <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap' }}>{OVERLAYS.map((overlay) => <button key={overlay} type="button" aria-pressed={active.has(overlay)} onClick={() => toggleOverlay(overlay)} style={{ ...toolButtonStyle, background: active.has(overlay) ? 'var(--color-info)' : 'transparent', color: active.has(overlay) ? 'var(--color-bg-base)' : 'var(--color-text-muted)' }}>{overlay}</button>)}</div>
        <div style={{ padding: '4px 10px', fontSize: 11 }} className="mono dim">{hover ? <span>O <span className="text-0">{hover.open.toFixed(1)}</span> · H <span className="pos">{hover.high.toFixed(1)}</span> · L <span className="neg">{hover.low.toFixed(1)}</span> · C <span>{hover.close.toFixed(1)}</span> · VOL {hover.volume.toFixed(2)} · TRADES {hover.trades}</span> : <span>Hover a candle for OHLCV · click to sync both monitors · wheel to zoom</span>}</div>
        <div style={{ flex: '1 1 auto', minHeight: 0, position: 'relative' }}><canvas ref={canvasRef} onMouseMove={handleMove} onMouseLeave={() => setHover(null)} onClick={(event) => { const canvas = canvasRef.current; if (!canvas || displayCandles.length === 0) return; const rect = canvas.getBoundingClientRect(); const index = Math.min(displayCandles.length - 1, Math.max(0, Math.floor((event.clientX - rect.left) / (rect.width / displayCandles.length)))); onSelectTimestamp(displayCandles[index].timestampNs) }} onWheel={(event) => { event.preventDefault(); setZoom((current) => Math.min(3, Math.max(0.5, current + (event.deltaY > 0 ? 0.1 : -0.1)))) }} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} /></div>
      </Panel>
    </div>
  )
}

function aggregateCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (timeframe === 'tick' || candles.length === 0) return candles
  const interval = TIMEFRAME_MS[timeframe]
  const grouped = new Map<number, Candle>()
  candles.forEach((candle) => { const bucket = Math.floor(timestampNsToMs(candle.timestampNs) / interval) * interval; const current = grouped.get(bucket); if (!current) grouped.set(bucket, { ...candle, timestampNs: candle.timestampNs }); else grouped.set(bucket, { ...current, high: Math.max(current.high, candle.high), low: Math.min(current.low, candle.low), close: candle.close, volume: current.volume + candle.volume, buyVolume: current.buyVolume + candle.buyVolume, sellVolume: current.sellVolume + candle.sellVolume, trades: current.trades + candle.trades }) })
  return Array.from(grouped.values())
}

function drawCandles(context: CanvasRenderingContext2D, candles: Candle[], columnWidth: number, yFor: (value: number) => number, mode: ChartMode, height: number) {
  const colorFor = (up: boolean) => up ? canvasColor('--color-positive') : canvasColor('--color-negative')
  if (mode === 'line' || mode === 'area' || mode === 'replay') context.beginPath()
  candles.forEach((candle, index) => { const x = index * columnWidth + columnWidth / 2; const up = candle.close >= candle.open; context.strokeStyle = colorFor(up); context.fillStyle = colorFor(up); if (mode === 'line' || mode === 'area' || mode === 'replay') { if (index === 0) context.moveTo(x, yFor(candle.close)); else context.lineTo(x, yFor(candle.close)); return } context.beginPath(); context.moveTo(x, yFor(candle.high)); context.lineTo(x, yFor(candle.low)); context.stroke(); const bodyWidth = Math.max(1, columnWidth * 0.6); context.fillRect(x - bodyWidth / 2, Math.min(yFor(candle.open), yFor(candle.close)), bodyWidth, Math.max(1, Math.abs(yFor(candle.open) - yFor(candle.close)))) })
  if (mode === 'line' || mode === 'area' || mode === 'replay') { context.strokeStyle = canvasColor('--color-info'); context.lineWidth = 1.2; context.stroke() }
  if (mode === 'tick' || mode === 'trades') { context.fillStyle = canvasColor('--color-info'); candles.forEach((candle, index) => { if (index % 3 === 0) context.fillRect(index * columnWidth + columnWidth / 2, yFor(candle.close) - 2, 2, 2) }) }
  if (mode === 'area') { context.lineTo((candles.length - 1) * columnWidth + columnWidth / 2, height); context.lineTo(columnWidth / 2, height); context.closePath(); context.fillStyle = 'rgba(77,157,224,0.12)'; context.fill() }
}

function drawStrategyQuotes(context: CanvasRenderingContext2D, candles: Candle[], width: number, yFor: (value: number) => number): void {
  const latest = candles[candles.length - 1]?.close
  if (latest === undefined) return
  context.save()
  context.setLineDash([5, 4])
  context.strokeStyle = canvasColor('--color-warning')
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(0, yFor(latest - 0.8))
  context.lineTo(width, yFor(latest - 0.8))
  context.moveTo(0, yFor(latest + 0.8))
  context.lineTo(width, yFor(latest + 0.8))
  context.stroke()
  context.setLineDash([])
  context.fillStyle = canvasColor('--color-warning')
  context.font = '10px sans-serif'
  context.fillText('MM_V18 quote band', 8, Math.max(12, yFor(latest + 0.8) - 4))
  context.restore()
}

function drawLine(context: CanvasRenderingContext2D, values: number[], columnWidth: number, yFor: (value: number) => number, color: string) { context.beginPath(); values.forEach((value, index) => { const x = index * columnWidth + columnWidth / 2; const y = yFor(value); if (index === 0) context.moveTo(x, y); else context.lineTo(x, y) }); context.strokeStyle = color; context.lineWidth = 1.2; context.stroke() }
function drawVolume(context: CanvasRenderingContext2D, candles: Candle[], columnWidth: number, height: number) { const max = Math.max(...candles.map((candle) => candle.volume), 1); candles.forEach((candle, index) => { const barHeight = (candle.volume / max) * Math.min(50, height * 0.2); context.fillStyle = candle.close >= candle.open ? 'rgba(62,207,142,0.25)' : 'rgba(239,91,91,0.25)'; context.fillRect(index * columnWidth + columnWidth * 0.2, height - barHeight, columnWidth * 0.6, barHeight) }) }
function drawDepth(context: CanvasRenderingContext2D, candles: Candle[], width: number, height: number) { context.fillStyle = 'rgba(77,157,224,0.12)'; context.fillRect(0, height * 0.35, width, height * 0.3); context.fillStyle = canvasColor('--color-text-muted'); context.font = '10px sans-serif'; context.fillText('Depth projection · mock event artifact', 10, height * 0.35 - 6) }
function drawOrderFlow(context: CanvasRenderingContext2D, candles: Candle[], columnWidth: number, height: number) { const max = Math.max(...candles.map((candle) => candle.buyVolume + candle.sellVolume), 1); candles.forEach((candle, index) => { const totalHeight = (candle.volume / max) * Math.min(80, height * 0.3); const buyHeight = candle.volume === 0 ? 0 : (candle.buyVolume / candle.volume) * totalHeight; context.fillStyle = canvasColor('--color-positive'); context.fillRect(index * columnWidth + columnWidth * 0.2, height - buyHeight, columnWidth * 0.25, buyHeight); context.fillStyle = canvasColor('--color-negative'); context.fillRect(index * columnWidth + columnWidth * 0.55, height - (totalHeight - buyHeight), columnWidth * 0.25, totalHeight - buyHeight) }) }
function drawFootprint(context: CanvasRenderingContext2D, candles: Candle[], columnWidth: number, height: number) { context.fillStyle = canvasColor('--color-text-muted'); context.font = '10px sans-serif'; context.fillText(`Footprint · ${candles.length} mock bars`, 10, 18) }
function vwapAt(candles: Candle[], index: number) { let pv = 0; let volume = 0; candles.slice(0, index + 1).forEach((candle) => { pv += candle.close * candle.volume; volume += candle.volume }); return volume ? pv / volume : candles[index]?.close ?? 0 }
function emaAt(candles: Candle[], index: number, period: number) { const start = Math.max(0, index - period + 1); const values = candles.slice(start, index + 1).map((candle) => candle.close); return values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1) }
function cvdAt(candles: Candle[]) { let cumulative = 0; return candles.map((candle) => { cumulative += candle.buyVolume - candle.sellVolume; return cumulative }) }

const toolButtonStyle: React.CSSProperties = { fontSize: 9, padding: '3px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-control)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }
