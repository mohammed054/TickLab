import { useEffect, useMemo, useRef, useState } from 'react'
import { Candle, timestampNsToMs } from '../../contracts'
import { Panel } from '../shared/Panel'

const TIMEFRAMES = ['1s', '5s', '15s', '1m', '5m', '15m', '1h', '4h', '1D'] as const
type Timeframe = (typeof TIMEFRAMES)[number]
const MODES = ['candles', 'line', 'area', 'footprint', 'depth', 'orderflow'] as const
type ChartMode = (typeof MODES)[number]
const OVERLAYS = ['VWAP', 'EMA 9', 'Volume', 'CVD', 'OB Imbalance', 'Strategy Quotes'] as const
const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1s': 1_000,
  '5s': 5_000,
  '15s': 15_000,
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1D': 86_400_000,
}

const CANVAS_FALLBACKS: Record<string, string> = {
  '--color-positive': '#10b981',
  '--color-negative': '#f43f5e',
  '--color-warning': '#f59e0b',
  '--color-info': '#38bdf8',
  '--color-text-muted': '#64748b',
  '--color-border-subtle': '#1c2430',
  '--color-focus': '#38bdf8',
  '--color-bg-base': '#080a0d',
}

type CrosshairState = { x: number; y: number; price: number; time: string }

function canvasColor(variable: string): string {
  if (typeof document === 'undefined') return CANVAS_FALLBACKS[variable] ?? '#64748b'
  return (
    getComputedStyle(document.documentElement).getPropertyValue(variable).trim() ||
    CANVAS_FALLBACKS[variable] ||
    '#64748b'
  )
}

const Y_AXIS_WIDTH = 75
const X_AXIS_HEIGHT = 24
const CROSSHAIR_LABEL_PADDING = 6

export function PriceChart({
  candles,
  onSelectTimestamp,
  onPreviewTimestamp,
}: {
  candles: Candle[]
  onSelectTimestamp: (timestampNs: string) => void
  onPreviewTimestamp?: (timestampNs: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const lastPreviewRef = useRef(0)
  const [timeframe, setTimeframe] = useState<Timeframe>('1s')
  const [mode, setMode] = useState<ChartMode>('candles')
  const [active, setActive] = useState<Set<string>>(new Set(['VWAP', 'Volume']))
  const [hover, setHover] = useState<Candle | null>(null)
  const [zoom, setZoom] = useState(1)
  const [crosshair, setCrosshair] = useState<CrosshairState | null>(null)
  const [panning, setPanning] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [followMode, setFollowMode] = useState(true)

  const visibleCandles = useMemo(() => aggregateCandles(candles, timeframe), [candles, timeframe])
  const displayCandles = useMemo(() => {
    const count = Math.max(30, Math.round(90 / zoom))
    const maxStart = Math.max(0, visibleCandles.length - count)
    // Column width in pixels for each candle
    const columnWidth = 90 / count || 1
    // Pan bounds: max pan offset = total content width beyond visible area
    const maxPan = Math.max(0, (visibleCandles.length - count) * columnWidth)
    // Map panOffset.x to start index
    // panFactor = columnWidth: each columnWidth pixels of pan = 1 candle index shift
    const panFactor = Math.max(1, columnWidth) || 1
    // When panOffset.x = 0, startIndex = maxStart (show latest candles)
    // When panOffset.x = maxPan, startIndex = 0 (show earliest candles)
    const startIndex = Math.max(0, Math.min(maxStart, Math.round((maxPan - panOffset.x) / panFactor)))
    return visibleCandles.slice(startIndex, startIndex + count)
  }, [visibleCandles, zoom, panOffset])

  const toggleOverlay = (overlay: string) =>
    setActive((current) => {
      const next = new Set(current)
      if (next.has(overlay)) next.delete(overlay)
      else next.add(overlay)
      return next
    })

  useEffect(() => {
    if (followMode) {
      setPanOffset((prev) => ({ ...prev, x: 0 }))
    }
  }, [displayCandles, followMode])

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
    const width = rect.width - Y_AXIS_WIDTH
    const height = rect.height - X_AXIS_HEIGHT
    context.clearRect(0, 0, width + Y_AXIS_WIDTH, height + X_AXIS_HEIGHT)

    const lows = displayCandles.map((candle) => candle.low)
    const highs = displayCandles.map((candle) => candle.high)
    const min = Math.min(...lows)
    const max = Math.max(...highs)
    const padding = Math.max((max - min) * 0.08, 0.1)
    const yFor = (price: number) =>
      height - ((price - (min - padding)) / (max - min + padding * 2)) * height
    const columnWidth = width / displayCandles.length

    drawGrid(context, width, height, min, max, padding, displayCandles.length, columnWidth)
    drawYAxis(context, width, height, min, max, padding)
    drawXAxis(context, width, height, displayCandles, columnWidth)
    drawCandles(context, displayCandles, columnWidth, yFor, mode, height, width)

    if (active.has('VWAP'))
      drawLine(
        context,
        displayCandles.map((_, index) => vwapAt(displayCandles, index)),
        columnWidth,
        yFor,
        canvasColor('--color-warning'),
        width
      )
    if (active.has('EMA 9'))
      drawLine(
        context,
        displayCandles.map((_, index) => emaAt(displayCandles, index, 9)),
        columnWidth,
        yFor,
        canvasColor('--color-info'),
        width
      )
    if (active.has('CVD'))
      drawLine(context, cvdAt(displayCandles), columnWidth, yFor, canvasColor('--color-positive'), width)
    if (active.has('OB Imbalance'))
      drawLine(
        context,
        displayCandles.map((candle) => candle.close + (candle.buyVolume - candle.sellVolume) * 0.8),
        columnWidth,
        yFor,
        canvasColor('--color-info'),
        width
      )
    if (active.has('Strategy Quotes')) drawStrategyQuotes(context, displayCandles, width, yFor)
    if (active.has('Volume')) drawVolume(context, displayCandles, columnWidth, height)
    if (mode === 'depth') drawDepth(context, displayCandles, width, height)
    if (mode === 'orderflow') drawOrderFlow(context, displayCandles, columnWidth, height)
    if (mode === 'footprint') drawFootprint(context, displayCandles, columnWidth, height)
    if (crosshair) drawCrosshair(context, crosshair, width, height)
  }, [active, displayCandles, mode, crosshair, zoom])

  const handleMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || displayCandles.length === 0) return
    if (panning) {
      const deltaX = event.clientX - panStart.x
      const deltaY = event.clientY - panStart.y
      setPanOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }))
      setPanStart(prev => ({ x: event.clientX, y: event.clientY }))
      return
    }
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left - panOffset.x
    const y = event.clientY - rect.top - panOffset.y
    const width = rect.width - Y_AXIS_WIDTH
    const height = rect.height - X_AXIS_HEIGHT
    if (x < 0 || x > width || y < 0 || y > height) {
      setCrosshair(null)
      setHover(null)
      return
    }
    const index = Math.min(
      displayCandles.length - 1,
      Math.max(0, Math.floor(x / (width / displayCandles.length)))
    )
    const candle = displayCandles[index]
    const lows = displayCandles.map((c) => c.low)
    const highs = displayCandles.map((c) => c.high)
    const min = Math.min(...lows)
    const max = Math.max(...highs)
    const padding = Math.max((max - min) * 0.08, 0.1)
    const price = min - padding + (1 - y / height) * (max - min + padding * 2)
    const time = new Date(Number(BigInt(candle.timestampNs) / 1_000_000n))
      .toISOString()
      .slice(11, 23)
    setCrosshair({ x, y, price, time })
    setHover(candle)
    const now = performance.now()
    if (onPreviewTimestamp && now - lastPreviewRef.current > 50) {
      lastPreviewRef.current = now
      onPreviewTimestamp(candle.timestampNs)
    }
  }

  const handleLeave = () => {
    setCrosshair(null)
    setHover(null)
    setPanning(false)
  }

  const fit = () => {
    setZoom(1)
    setHover(null)
    setCrosshair(null)
  }
  const reset = () => {
    setZoom(1)
    setMode('candles')
    setTimeframe('1s')
    setActive(new Set(['VWAP', 'Volume']))
    setHover(null)
    setCrosshair(null)
    setFollowMode(true)
    setPanOffset({ x: 0, y: 0 })
  }
  const screenshot = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const anchor = document.createElement('a')
    anchor.href = canvas.toDataURL('image/png')
    anchor.download = 'ticklab-market-chart.png'
    anchor.click()
  }
  const fullscreen = () => {
    if (shellRef.current?.requestFullscreen) void shellRef.current.requestFullscreen()
  }

  useEffect(() => {
    const onFit = () => {
      setZoom(1)
      setHover(null)
      setCrosshair(null)
    }
    window.addEventListener('ticklab:chart-fit', onFit)
    return () => window.removeEventListener('ticklab:chart-fit', onFit)
  }, [])

  useEffect(() => {
    // Clamp panOffset.x to prevent panning beyond chart data bounds
    const count = Math.max(30, Math.round(90 / zoom))
    const maxStart = Math.max(0, visibleCandles.length - count)
    const columnWidth = 90 / count || 1
    const maxPan = Math.max(0, (visibleCandles.length - count) * columnWidth)
    setPanOffset(prev => ({
      x: Math.max(0, Math.min(maxPan, prev.x)),
      y: prev.y,
    }))
  }, [zoom, visibleCandles.length])

  return (
    <div
      ref={shellRef}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', width: '100%' }}
    >
      <Panel
        title="PRICE & MARKET DEPTH CHART"
        style={{ flex: '1 1 auto', minHeight: 0 }}
        bodyStyle={{ display: 'flex', flexDirection: 'column', padding: 0 }}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button type="button" onClick={fit} style={toolButtonStyle} title="Fit to current viewport">
              FIT
            </button>
            <button type="button" onClick={reset} style={toolButtonStyle} title="Reset chart view">
              RESET
            </button>
            <button type="button" onClick={screenshot} style={toolButtonStyle} title="Export chart as PNG image">
              PNG
            </button>
            <button type="button" onClick={fullscreen} style={toolButtonStyle} title="Toggle fullscreen view">
              FULL
            </button>
            <button
              type="button"
              onClick={() => setFollowMode(!followMode)}
              style={{
                ...toolButtonStyle,
                background: followMode ? 'var(--color-bg-control-active)' : 'transparent',
                borderColor: followMode ? 'var(--color-border-accent)' : 'var(--color-border-subtle)',
                color: followMode ? 'var(--color-focus)' : 'var(--color-text-muted)',
                fontWeight: followMode ? 700 : 400,
              }}
            >
              {followMode ? 'â— AUTO-FOLLOW' : 'â—‹ MANUAL'}
            </button>
          </div>
        }
      >
        {/* Trading Toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 8px',
            background: 'var(--color-bg-raised)',
            borderBottom: '1px solid var(--color-border-subtle)',
            gap: 8,
            overflowX: 'auto',
          }}
        >
          {/* Timeframes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-text-muted)', marginRight: 4 }}>
              INTERVAL
            </span>
            {TIMEFRAMES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={timeframe === value}
                onClick={() => setTimeframe(value)}
                style={{
                  ...toolButtonStyle,
                  background: timeframe === value ? 'var(--color-bg-control-active)' : 'transparent',
                  color: timeframe === value ? 'var(--color-focus)' : 'var(--color-text-secondary)',
                  borderColor: timeframe === value ? 'var(--color-border-accent)' : 'transparent',
                  fontWeight: timeframe === value ? 700 : 400,
                }}
              >
                {value}
              </button>
            ))}
          </div>

          {/* Modes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-text-muted)', marginRight: 4 }}>
              MODE
            </span>
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                style={{
                  ...toolButtonStyle,
                  background: mode === m ? 'var(--color-bg-control-active)' : 'transparent',
                  color: mode === m ? 'var(--color-focus)' : 'var(--color-text-secondary)',
                  borderColor: mode === m ? 'var(--color-border-accent)' : 'transparent',
                  fontWeight: mode === m ? 700 : 400,
                }}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Overlays */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-text-muted)', marginRight: 4 }}>
              OVERLAYS
            </span>
            {OVERLAYS.map((overlay) => {
              const isSelected = active.has(overlay)
              return (
                <button
                  key={overlay}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleOverlay(overlay)}
                  style={{
                    ...toolButtonStyle,
                    background: isSelected ? 'var(--color-info-dim)' : 'transparent',
                    color: isSelected ? 'var(--color-info)' : 'var(--color-text-muted)',
                    borderColor: isSelected ? 'rgba(56, 189, 248, 0.4)' : 'transparent',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {overlay}
                </button>
              )
            })}
          </div>
        </div>

        {/* OHLCV Live HUD */}
        <div
          style={{
            padding: '4px 10px',
            fontSize: 'var(--font-size-xs)',
            background: 'rgba(8, 10, 13, 0.6)',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
          className="mono"
        >
          {hover ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span>
                <span style={{ color: 'var(--color-text-muted)' }}>OPEN </span>
                <span style={{ color: 'var(--color-text-primary)' }}>{hover.open.toFixed(1)}</span>
              </span>
              <span>
                <span style={{ color: 'var(--color-text-muted)' }}>HIGH </span>
                <span className="pos">{hover.high.toFixed(1)}</span>
              </span>
              <span>
                <span style={{ color: 'var(--color-text-muted)' }}>LOW </span>
                <span className="neg">{hover.low.toFixed(1)}</span>
              </span>
              <span>
                <span style={{ color: 'var(--color-text-muted)' }}>CLOSE </span>
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{hover.close.toFixed(1)}</span>
              </span>
              <span>
                <span style={{ color: 'var(--color-text-muted)' }}>VOL </span>
                <span style={{ color: 'var(--color-text-primary)' }}>{hover.volume.toFixed(3)} BTC</span>
              </span>
              <span>
                <span style={{ color: 'var(--color-text-muted)' }}>TRADES </span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{hover.trades}</span>
              </span>
            </div>
          ) : (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-2xs)' }}>
              Move cursor over chart for real-time OHLCV inspection Â· Click candle to sync dual monitors Â· Scroll wheel to zoom
            </div>
          )}

          <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-2xs)' }}>
            ZOOM: {zoom.toFixed(1)}x
          </div>
        </div>

        {/* Chart Canvas Area */}
        <div style={{ flex: '1 1 auto', minHeight: 0, position: 'relative', width: '100%', height: '100%' }}>
          <canvas
            ref={canvasRef}
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
            onClick={(event) => {
              const canvas = canvasRef.current
              if (!canvas || displayCandles.length === 0) return
              const rect = canvas.getBoundingClientRect()
              const x = event.clientX - rect.left
              const width = rect.width - Y_AXIS_WIDTH
              const index = Math.min(
                displayCandles.length - 1,
                Math.max(0, Math.floor(x / (width / displayCandles.length)))
              )
              onSelectTimestamp(displayCandles[index].timestampNs)
            }}
            onMouseDown={(event) => {
              if (event.button === 2) {
                setPanning(true)
                setFollowMode(false)
                setPanOffset({
                  x: event.clientX - canvasRef.current!.getBoundingClientRect().left,
                  y: event.clientY - canvasRef.current!.getBoundingClientRect().top,
                })
                setPanStart({
                  x: event.clientX - canvasRef.current!.getBoundingClientRect().left,
                  y: event.clientY - canvasRef.current!.getBoundingClientRect().top,
                })
              }
            }}
onMouseUp={() => setPanning(false)}
            onWheel={(event) => {
              event.preventDefault()
              const canvas = canvasRef.current
              if (!canvas || displayCandles.length === 0) return
              const rect = canvas.getBoundingClientRect()
              const width = rect.width - Y_AXIS_WIDTH
              const height = rect.height - X_AXIS_HEIGHT
              const mouseX = event.clientX - rect.left
              const mouseY = event.clientY - rect.top
              const beforeZoom = zoom
              setZoom((current) => Math.min(3, Math.max(0.5, current + (event.deltaY > 0 ? 0.1 : -0.1))))
              const afterZoom = zoom
              const dx = (mouseX / width) * (afterZoom - beforeZoom)
              const dy = (mouseY / height) * (afterZoom - beforeZoom)
              setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
            }}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              cursor: panning ? 'grabbing' : 'crosshair',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            }}
          />
        </div>
      </Panel>
    </div>
  )
}

function aggregateCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (candles.length === 0) return candles
  const interval = TIMEFRAME_MS[timeframe]
  const grouped = new Map<number, Candle>()
  candles.forEach((candle) => {
    const bucket = Math.floor(timestampNsToMs(candle.timestampNs) / interval) * interval
    const current = grouped.get(bucket)
    if (!current) grouped.set(bucket, { ...candle, timestampNs: candle.timestampNs })
    else
      grouped.set(bucket, {
        ...current,
        high: Math.max(current.high, candle.high),
        low: Math.min(current.low, candle.low),
        close: candle.close,
        volume: current.volume + candle.volume,
        buyVolume: current.buyVolume + candle.buyVolume,
        sellVolume: current.sellVolume + candle.sellVolume,
        trades: current.trades + candle.trades,
      })
  })
  return Array.from(grouped.values())
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  min: number,
  max: number,
  padding: number,
  candleCount: number,
  columnWidth: number
) {
  const gridColor = canvasColor('--color-border-subtle')
  context.strokeStyle = gridColor
  context.lineWidth = 1
  context.setLineDash([3, 4])

  const priceRange = max - min + padding * 2
  const yStep = priceRange / 6
  for (let i = 1; i < 6; i++) {
    const y = height * (i / 6)
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }

  for (let i = 1; i < 8; i++) {
    const x = (i * width) / 8
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
  }
  context.setLineDash([])
}

function drawYAxis(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  min: number,
  max: number,
  padding: number
) {
  context.fillStyle = canvasColor('--color-text-muted')
  context.font = '10px "JetBrains Mono", monospace'
  context.textAlign = 'right'
  context.textBaseline = 'middle'

  const priceRange = max - min + padding * 2
  const yStep = priceRange / 6
  for (let i = 0; i <= 6; i++) {
    const price = max + padding - i * yStep
    const y = height * (i / 6)
    context.fillText(price.toFixed(1), width + Y_AXIS_WIDTH - CROSSHAIR_LABEL_PADDING, y)
  }

  context.beginPath()
  context.moveTo(width, 0)
  context.lineTo(width, height)
  context.strokeStyle = canvasColor('--color-border-strong')
  context.lineWidth = 1
  context.stroke()
}

function drawXAxis(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  candles: Candle[],
  columnWidth: number
) {
  context.fillStyle = canvasColor('--color-text-muted')
  context.font = '10px "JetBrains Mono", monospace'
  context.textAlign = 'center'
  context.textBaseline = 'top'

  const timeStep = Math.max(1, Math.floor(candles.length / 8))
  for (let i = 0; i < 8; i++) {
    const idx = Math.min(candles.length - 1, i * timeStep)
    const candle = candles[idx]
    const x = idx * columnWidth + columnWidth / 2
    const time = new Date(Number(BigInt(candle.timestampNs) / 1_000_000n)).toISOString().slice(11, 19)
    context.fillText(time, x, height + 5)
  }

  context.beginPath()
  context.moveTo(0, height)
  context.lineTo(width, height)
  context.strokeStyle = canvasColor('--color-border-strong')
  context.lineWidth = 1
  context.stroke()
}

function drawCrosshair(
  context: CanvasRenderingContext2D,
  crosshair: CrosshairState,
  width: number,
  height: number
): void {
  const lineX = Math.round(Math.min(Math.max(crosshair.x, 0), width)) + 0.5
  const lineY = Math.round(Math.min(Math.max(crosshair.y, 0), height)) + 0.5
  const accent = canvasColor('--color-focus')
  const ink = canvasColor('--color-bg-base')

  context.save()
  context.strokeStyle = 'rgba(56, 189, 248, 0.6)'
  context.lineWidth = 1
  context.setLineDash([3, 3])
  context.beginPath()
  context.moveTo(lineX, 0)
  context.lineTo(lineX, height)
  context.moveTo(0, lineY)
  context.lineTo(width, lineY)
  context.stroke()
  context.setLineDash([])

  context.font = '10px "JetBrains Mono", monospace'
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  const priceText = crosshair.price.toFixed(1)
  const priceWidth = Math.min(Y_AXIS_WIDTH - 4, context.measureText(priceText).width + 10)
  const priceY = Math.min(Math.max(crosshair.y, 8), height - 8)
  context.fillStyle = accent
  context.fillRect(width + 1, priceY - 8, priceWidth, 16)
  context.fillStyle = ink
  context.fillText(priceText, width + 1 + priceWidth / 2, priceY)

  const timeText = crosshair.time
  const timeWidth = Math.min(Y_AXIS_WIDTH - 4, context.measureText(timeText).width + 10)
  const timeX = Math.min(Math.max(lineX, timeWidth / 2), width - timeWidth / 2)
  context.fillStyle = accent
  context.fillRect(timeX - timeWidth / 2, height + 1, timeWidth, 15)
  context.fillStyle = ink
  context.fillText(timeText, timeX, height + 9)

  context.restore()
}

function drawCandles(
  context: CanvasRenderingContext2D,
  candles: Candle[],
  columnWidth: number,
  yFor: (value: number) => number,
  mode: ChartMode,
  height: number,
  width: number
) {
  const posColor = canvasColor('--color-positive')
  const negColor = canvasColor('--color-negative')
  const bodyWidth = Math.max(1, columnWidth * 0.75)

  if (mode === 'line' || mode === 'area') {
    context.beginPath()
    candles.forEach((candle, index) => {
      const x = index * columnWidth + columnWidth / 2
      if (index === 0) context.moveTo(x, yFor(candle.close))
      else context.lineTo(x, yFor(candle.close))
    })
    context.strokeStyle = canvasColor('--color-info')
    context.lineWidth = 1.5
    context.stroke()
    if (mode === 'area') {
      context.lineTo(width, height)
      context.lineTo(0, height)
      context.closePath()
      context.fillStyle = 'rgba(56, 189, 248, 0.12)'
      context.fill()
    }
    return
  }

  candles.forEach((candle, index) => {
    const x = index * columnWidth + columnWidth / 2
    const up = candle.close >= candle.open
    const candleColor = up ? posColor : negColor
    context.strokeStyle = candleColor
    context.fillStyle = candleColor
    context.lineWidth = 1.2

    context.beginPath()
    context.moveTo(x, yFor(candle.high))
    context.lineTo(x, yFor(candle.low))
    context.stroke()

    const bodyTop = Math.min(yFor(candle.open), yFor(candle.close))
    const bodyHeight = Math.max(1, Math.abs(yFor(candle.open) - yFor(candle.close)))
    context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight)
  })
}

function drawStrategyQuotes(
  context: CanvasRenderingContext2D,
  candles: Candle[],
  width: number,
  yFor: (value: number) => number
): void {
  const latest = candles[candles.length - 1]?.close
  if (latest === undefined) return
  context.save()
  context.setLineDash([4, 4])
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
  context.font = '10px "JetBrains Mono", monospace'
  context.fillText('ACTIVE QUOTING BAND (Â±0.8)', 8, Math.max(12, yFor(latest + 0.8) - 4))
  context.restore()
}

function drawLine(
  context: CanvasRenderingContext2D,
  values: number[],
  columnWidth: number,
  yFor: (value: number) => number,
  color: string,
  width: number
) {
  context.beginPath()
  values.forEach((value, index) => {
    const x = index * columnWidth + columnWidth / 2
    const y = yFor(value)
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.strokeStyle = color
  context.lineWidth = 1.4
  context.stroke()
}

function drawVolume(
  context: CanvasRenderingContext2D,
  candles: Candle[],
  columnWidth: number,
  height: number
) {
  const max = Math.max(...candles.map((candle) => candle.volume), 1)
  const volumeHeight = Math.min(70, height * 0.22)
  candles.forEach((candle, index) => {
    const barHeight = (candle.volume / max) * volumeHeight
    const x = index * columnWidth + columnWidth * 0.15
    const w = columnWidth * 0.7
    context.fillStyle =
      candle.close >= candle.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'
    context.fillRect(x, height - barHeight, w, barHeight)
  })
}

function drawDepth(
  context: CanvasRenderingContext2D,
  candles: Candle[],
  width: number,
  height: number
) {
  context.fillStyle = 'rgba(56, 189, 248, 0.12)'
  context.fillRect(0, height * 0.35, width, height * 0.3)
  context.fillStyle = canvasColor('--color-focus')
  context.font = '10px "JetBrains Mono", monospace'
  context.fillText('L2/L3 DEPTH DISTRIBUTION OVERLAY', 10, height * 0.35 - 6)
}

function drawOrderFlow(
  context: CanvasRenderingContext2D,
  candles: Candle[],
  columnWidth: number,
  height: number
) {
  const max = Math.max(...candles.map((candle) => candle.buyVolume + candle.sellVolume), 1)
  const ofHeight = Math.min(80, height * 0.3)
  candles.forEach((candle, index) => {
    const totalHeight = (candle.volume / max) * ofHeight
    const buyHeight = candle.volume === 0 ? 0 : (candle.buyVolume / candle.volume) * totalHeight
    context.fillStyle = canvasColor('--color-positive')
    context.fillRect(index * columnWidth + columnWidth * 0.15, height - buyHeight, columnWidth * 0.3, buyHeight)
    context.fillStyle = canvasColor('--color-negative')
    context.fillRect(
      index * columnWidth + columnWidth * 0.55,
      height - (totalHeight - buyHeight),
      columnWidth * 0.3,
      totalHeight - buyHeight
    )
  })
}

function drawFootprint(
  context: CanvasRenderingContext2D,
  candles: Candle[],
  columnWidth: number,
  height: number
) {
  context.fillStyle = canvasColor('--color-text-secondary')
  context.font = '10px "JetBrains Mono", monospace'
  context.fillText(`FOOTPRINT DELTA CLUSTERS Â· ${candles.length} BARS`, 10, 18)
}

function vwapAt(candles: Candle[], index: number) {
  let pv = 0
  let volume = 0
  candles.slice(0, index + 1).forEach((candle) => {
    pv += candle.close * candle.volume
    volume += candle.volume
  })
  return volume ? pv / volume : candles[index]?.close ?? 0
}

function emaAt(candles: Candle[], index: number, period: number) {
  const start = Math.max(0, index - period + 1)
  const values = candles.slice(start, index + 1).map((candle) => candle.close)
  return values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1)
}

function cvdAt(candles: Candle[]) {
  let cumulative = 0
  return candles.map((candle) => {
    cumulative += candle.buyVolume - candle.sellVolume
    return cumulative
  })
}

const toolButtonStyle: React.CSSProperties = {
  fontSize: '9.5px',
  padding: '2px 7px',
  borderRadius: 'var(--radius-xs)',
  border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-bg-control)',
  color: 'var(--color-text-secondary)',
  whiteSpace: 'nowrap',
}
