import { useEffect, useRef, useState } from 'react'
import { MockCandle } from '../../mock/mockData'
import { Panel } from '../shared/Panel'

const TIMEFRAMES = ['1s', '5s', '15s', '1m', '5m', '15m', '1h', '4h', '1D']
const OVERLAYS = ['VWAP', 'EMA', 'Volume', 'CVD', 'OB Imbalance', 'Strategy Quotes']

export function PriceChart({ candles, onSelectTimestamp }: { candles: MockCandle[]; onSelectTimestamp: (t: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [tf, setTf] = useState('1m')
  const [active, setActive] = useState<Set<string>>(new Set(['VWAP']))
  const [hover, setHover] = useState<MockCandle | null>(null)

  function toggle(o: string) {
    setActive((prev) => {
      const next = new Set(prev)
      next.has(o) ? next.delete(o) : next.add(o)
      return next
    })
  }

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || candles.length === 0) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    const w = rect.width
    const h = rect.height
    ctx.clearRect(0, 0, w, h)

    const min = Math.min(...candles.map((c) => c.low))
    const max = Math.max(...candles.map((c) => c.high))
    const pad = (max - min) * 0.08
    const yTo = (p: number) => h - ((p - (min - pad)) / (max - min + pad * 2)) * h
    const cw = w / candles.length

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let i = 1; i < 5; i++) {
      const y = (h / 5) * i
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    // vwap overlay
    if (active.has('VWAP')) {
      let cumPV = 0
      let cumV = 0
      ctx.strokeStyle = '#e0a942'
      ctx.lineWidth = 1.3
      ctx.beginPath()
      candles.forEach((c, i) => {
        cumPV += c.close * c.volume
        cumV += c.volume
        const vwap = cumV ? cumPV / cumV : c.close
        const x = i * cw + cw / 2
        const y = yTo(vwap)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    // candles
    candles.forEach((c, i) => {
      const x = i * cw + cw / 2
      const up = c.close >= c.open
      ctx.strokeStyle = up ? '#3ecf8e' : '#ef5b5b'
      ctx.fillStyle = up ? '#3ecf8e' : '#ef5b5b'
      ctx.beginPath()
      ctx.moveTo(x, yTo(c.high))
      ctx.lineTo(x, yTo(c.low))
      ctx.stroke()
      const bodyW = Math.max(1, cw * 0.6)
      const yOpen = yTo(c.open)
      const yClose = yTo(c.close)
      ctx.fillRect(x - bodyW / 2, Math.min(yOpen, yClose), bodyW, Math.max(1, Math.abs(yClose - yOpen)))
    })

    canvas.onmousemove = (e) => {
      const r = canvas.getBoundingClientRect()
      const x = e.clientX - r.left
      const idx = Math.min(candles.length - 1, Math.max(0, Math.floor(x / cw)))
      setHover(candles[idx])
    }
    canvas.onmouseleave = () => setHover(null)
    canvas.onclick = (e) => {
      const r = canvas.getBoundingClientRect()
      const x = e.clientX - r.left
      const idx = Math.min(candles.length - 1, Math.max(0, Math.floor(x / cw)))
      onSelectTimestamp(candles[idx].t)
    }
  }, [candles, active])

  return (
    <Panel
      title="BTC/USDT — MARKET (SIMULATED CANDLES)"
      style={{ flex: '1 1 auto', minHeight: 0 }}
      bodyStyle={{ display: 'flex', flexDirection: 'column', padding: 0 }}
      right={
        <div style={{ display: 'flex', gap: 4 }}>
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              style={{
                fontSize: 10,
                padding: '2px 6px',
                background: t === tf ? 'var(--bg-3)' : 'transparent',
                color: t === tf ? 'var(--text-0)' : 'var(--text-2)',
                border: '1px solid var(--border-1)',
                borderRadius: 3,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      }
    >
      <div style={{ display: 'flex', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--border-1)', flexWrap: 'wrap' }}>
        {OVERLAYS.map((o) => (
          <button
            key={o}
            onClick={() => toggle(o)}
            style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 3,
              border: '1px solid var(--border-1)',
              background: active.has(o) ? 'rgba(111,168,255,0.15)' : 'transparent',
              color: active.has(o) ? 'var(--accent)' : 'var(--text-2)',
            }}
          >
            {o}
          </button>
        ))}
      </div>
      <div style={{ padding: '4px 10px', fontSize: 11 }} className="mono dim">
        {hover ? (
          <span>
            O <span className="text-0">{hover.open.toFixed(1)}</span> &nbsp; H{' '}
            <span className="pos">{hover.high.toFixed(1)}</span> &nbsp; L <span className="neg">{hover.low.toFixed(1)}</span> &nbsp; C{' '}
            {hover.close.toFixed(1)} &nbsp; VOL {hover.volume.toFixed(2)} &nbsp; TRADES {hover.trades} &nbsp; (click to jump both
            monitors here)
          </span>
        ) : (
          <span>Hover a candle for OHLCV · click to sync both monitors to that timestamp</span>
        )}
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0, position: 'relative' }}>
        <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} />
      </div>
    </Panel>
  )
}
