import { useRef, useEffect, useCallback } from 'react'

interface DepthProfileProps {
  bidDepths: number[]
  askDepths: number[]
  bidPrices: number[]
  askPrices: number[]
  width: number
  height: number
}

export function DepthProfile({ bidDepths, askDepths, bidPrices, askPrices, width, height }: DepthProfileProps) {
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

    const allDepths = [...bidDepths, ...askDepths]
    const maxDepth = Math.max(...allDepths, 1)
    const midX = width / 2

    const drawSide = (depths: number[], prices: number[], side: 'bid' | 'ask') => {
      const stepX = side === 'bid' ? -midX / depths.length : midX / depths.length

      ctx.beginPath()
      ctx.moveTo(midX, height)
      depths.forEach((d, i) => {
        const x = side === 'bid' ? midX - (i + 1) * Math.abs(stepX) : midX + (i + 1) * Math.abs(stepX)
        const y = height - (d / maxDepth) * (height - 20)
        ctx.lineTo(x, y)
      })
      const endX = side === 'bid' ? midX - depths.length * Math.abs(stepX) : midX + depths.length * Math.abs(stepX)
      ctx.lineTo(endX, height)
      ctx.closePath()

      ctx.fillStyle = side === 'bid' ? 'rgba(53,194,110,0.2)' : 'rgba(229,83,75,0.2)'
      ctx.fill()
      ctx.strokeStyle = side === 'bid' ? '#35c26e' : '#e5534b'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    if (bidDepths.length > 0) drawSide(bidDepths, bidPrices, 'bid')
    if (askDepths.length > 0) drawSide(askDepths, askPrices, 'ask')

    ctx.fillStyle = '#333333'
    ctx.fillRect(midX - 0.5, 0, 1, height)
  }, [bidDepths, askDepths, bidPrices, askPrices, width, height])

  useEffect(() => { draw() }, [draw])

  return <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px`, display: 'block' }} />
}
