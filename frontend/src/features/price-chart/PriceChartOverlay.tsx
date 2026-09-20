import { useEffect, useRef } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { OverlayMark } from './types'

export interface PriceChartOverlayProps {
  chart: IChartApi | null
  series: ISeriesApi<'Candlestick' | 'Line' | 'Area' | 'Histogram'> | null
  /** Strategy quotes (highlighted ladder rows, docs/07 §7.12). Empty when no strategy. */
  quotes: OverlayMark[]
  /** Working/simulated/live orders. Empty when no strategy. */
  orders: OverlayMark[]
  /** Fills. Empty when no strategy. */
  fills: OverlayMark[]
}

/**
 * Custom overlay layer (docs/07 §7.2): Canvas synced to the chart's visible
 * range via the lightweight-charts API. Draws strategy quotes / orders / fills
 * using the §11.5 lifecycle visual language. Renders nothing when the arrays
 * are empty (no-strategy state) — never placeholder marks.
 */
export function PriceChartOverlay({ chart, series, quotes, orders, fills }: PriceChartOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !chart || !series) return

    const css = (v: string, fb: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb

    const draw = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      const w = parent.clientWidth
      const h = parent.clientHeight
      if (w === 0 || h === 0) return
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const timeScale = chart.timeScale()
      const drawMark = (m: OverlayMark, kind: 'quote' | 'order' | 'fill') => {
        const x = timeScale.timeToCoordinate((m.timeNs / 1_000_000_000) as never)
        const y = series.priceToCoordinate(m.price)
        if (x == null || y == null) return
        const { stroke, fill, dashed } = markStyle(m, kind, css)
        ctx.save()
        if (dashed) ctx.setLineDash([4, 3])
        ctx.strokeStyle = stroke
        ctx.lineWidth = kind === 'quote' ? 2 : 1.5
        ctx.beginPath()
        if (kind === 'fill') {
          // Triangle marker: up = buy fill, down = sell fill.
          const s = 6
          ctx.moveTo(x, m.side === 'buy' ? y - s : y + s)
          ctx.lineTo(x - s, m.side === 'buy' ? y + s : y - s)
          ctx.lineTo(x + s, m.side === 'buy' ? y + s : y - s)
          ctx.closePath()
          ctx.fillStyle = fill
          ctx.fill()
        } else {
          ctx.moveTo(0, y)
          ctx.lineTo(w, y)
          ctx.stroke()
          // Side tick at the mark's time.
          ctx.beginPath()
          ctx.moveTo(x, y - 6)
          ctx.lineTo(x, y + 6)
          ctx.stroke()
        }
        if (m.label) {
          ctx.setLineDash([])
          ctx.fillStyle = stroke
          ctx.font = '10px sans-serif'
          ctx.fillText(m.label, Math.min(x + 6, w - 80), y - 6)
        }
        ctx.restore()
      }

      for (const q of quotes) drawMark(q, 'quote')
      for (const o of orders) drawMark(o, 'order')
      for (const f of fills) drawMark(f, 'fill')
    }

    draw()
    const onRange = () => draw()
    const onCross = () => draw()
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    chart.subscribeCrosshairMove(onCross)
    const ro = new ResizeObserver(draw)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
      chart.unsubscribeCrosshairMove(onCross)
      ro.disconnect()
    }
  }, [chart, series, quotes, orders, fills])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    />
  )
}

function markStyle(
  m: OverlayMark,
  kind: 'quote' | 'order' | 'fill',
  css: (v: string, fb: string) => string
): { stroke: string; fill: string; dashed: boolean } {
  const info = css('--color-info', '#58a6ff')
  const neutral = css('--color-neutral', '#8b949e')
  const pos = css('--color-positive', '#35c26e')
  const neg = css('--color-negative', '#e5534b')
  const side = m.side === 'buy' ? pos : neg

  if (kind === 'quote') return { stroke: info, fill: info, dashed: false }
  switch (m.state) {
    case 'submitted': return { stroke: neutral, fill: neutral, dashed: true }
    case 'working': return { stroke: info, fill: info, dashed: false }
    case 'partial_fill': return { stroke: info, fill: info, dashed: false }
    case 'filled': return { stroke: side, fill: side, dashed: false }
    case 'cancelled': return { stroke: neutral, fill: neutral, dashed: false }
    case 'rejected': return { stroke: neg, fill: neg, dashed: false }
    case 'expired': return { stroke: neutral, fill: neutral, dashed: false }
  }
}
