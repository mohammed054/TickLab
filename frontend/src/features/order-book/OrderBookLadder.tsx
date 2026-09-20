import { useRef, useEffect, useCallback } from 'react'
import type { OrderBookRow } from './types'

interface OrderBookLadderProps {
  bids: OrderBookRow[]
  asks: OrderBookRow[]
  midPrice: number
  spreadTicks: number
  rowHeight: number
  width: number
  height: number
}

const BID_BAR_COLOR = 'rgba(53,194,110,0.25)'
const ASK_BAR_COLOR = 'rgba(229,83,75,0.25)'
const BID_TEXT = '#35c26e'
const ASK_TEXT = '#e5534b'
const MID_BG = '#252525'
const STRATEGY_HIGHLIGHT = 'rgba(88,166,255,0.15)'
const GRID_LINE = 'rgba(51,51,51,0.6)'

export function OrderBookLadder({ bids, asks, midPrice, spreadTicks, rowHeight, width, height }: OrderBookLadderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#0d0d0d'
    ctx.fillRect(0, 0, width, height)

    const maxVisibleRows = Math.floor(height / rowHeight)
    const visibleBids = bids.slice(0, Math.floor(maxVisibleRows / 2))
    const visibleAsks = asks.slice(0, Math.ceil(maxVisibleRows / 2))

    const maxSize = Math.max(
      ...visibleBids.map((r) => r.size),
      ...visibleAsks.map((r) => r.size),
      1,
    )

    const colPrice = 10
    const colSize = width * 0.3
    const colDepth = width * 0.55
    const colDist = width * 0.8

    const drawRow = (row: OrderBookRow, y: number, side: 'bid' | 'ask') => {
      const barWidth = (row.size / maxSize) * (width * 0.35)
      const barX = side === 'bid' ? width - barWidth : 0

      if (row.isStrategyQuote) {
        ctx.fillStyle = STRATEGY_HIGHLIGHT
        ctx.fillRect(0, y, width, rowHeight)
      }

      ctx.fillStyle = side === 'bid' ? BID_BAR_COLOR : ASK_BAR_COLOR
      ctx.fillRect(barX, y, barWidth, rowHeight)

      ctx.fillStyle = 'var(--color-border-subtle)'
      ctx.fillRect(0, y + rowHeight - 1, width, 0.5)

      ctx.font = '11px monospace'
      ctx.textBaseline = 'middle'
      const textY = y + rowHeight / 2

      ctx.fillStyle = side === 'bid' ? BID_TEXT : ASK_TEXT
      ctx.fillText(row.priceTick.toFixed(1), colPrice, textY)

      ctx.fillStyle = '#e6e6e6'
      ctx.fillText(row.size.toLocaleString(), colSize, textY)

      ctx.fillStyle = '#888888'
      ctx.fillText(row.cumulativeDepth.toLocaleString(), colDepth, textY)

      ctx.fillStyle = '#888888'
      ctx.fillText(`${row.distanceFromMidTicks >= 0 ? '+' : ''}${row.distanceFromMidTicks}`, colDist, textY)
    }

    const midY = Math.floor(maxVisibleRows / 2) * rowHeight
    visibleBids.forEach((row, i) => {
      drawRow(row, midY - (i + 1) * rowHeight, 'bid')
    })

    ctx.fillStyle = MID_BG
    ctx.fillRect(0, midY, width, rowHeight)
    ctx.fillStyle = '#888888'
    ctx.font = '11px monospace'
    ctx.textBaseline = 'middle'
    ctx.fillText(`MID ${midPrice.toFixed(1)}  SPREAD ${spreadTicks.toFixed(1)}t`, colPrice, midY + rowHeight / 2)

    visibleAsks.forEach((row, i) => {
      drawRow(row, midY + rowHeight + i * rowHeight, 'ask')
    })

    ctx.fillStyle = '#888888'
    ctx.font = '10px monospace'
    ctx.fillText('PRICE', colPrice, 10)
    ctx.fillText('SIZE', colSize, 10)
    ctx.fillText('DEPTH', colDepth, 10)
    ctx.fillText('DIST', colDist, 10)
  }, [bids, asks, midPrice, spreadTicks, rowHeight, width, height])

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px`, display: 'block' }}
    />
  )
}
