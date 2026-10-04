import { useMemo, useState } from 'react'
import type { OrderBookLevel, OrderBookSnapshot } from '../../contracts'
import { fmtBps, fmtPrice, fmtSize, fmtVolume } from '../../shared/format'
import { MMPanel, Seg } from './mm'

const DEPTH_OPTIONS = [
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
] as const
const VIEW_OPTIONS = [
  { value: 'ladder', label: 'Ladder' },
  { value: 'depth', label: 'Depth' },
] as const

type View = (typeof VIEW_OPTIONS)[number]['value']

export function OrderBook({ book }: { book: OrderBookSnapshot }) {
  const [view, setView] = useState<View>('ladder')
  const [levels, setLevels] = useState<number>(10)
  const bids = useMemo(() => book.bids.slice(0, levels), [book, levels])
  const asks = useMemo(() => book.asks.slice(0, levels), [book, levels])

  return (
    <MMPanel
      title="Order book"
      flush
      right={
        <>
          <Seg options={VIEW_OPTIONS} value={view} onChange={setView} label="Book view" />
          <Seg options={DEPTH_OPTIONS} value={levels} onChange={setLevels} label="Levels per side" />
        </>
      }
    >
      {view === 'ladder' ? <Ladder book={book} bids={bids} asks={asks} /> : <DepthChart bids={bids} asks={asks} />}
    </MMPanel>
  )
}

function Ladder({ book, bids, asks }: { book: OrderBookSnapshot; bids: OrderBookLevel[]; asks: OrderBookLevel[] }) {
  const maxSize = Math.max(...bids.map((l) => l.size), ...asks.map((l) => l.size), 0.001)
  const bidTotal = bids.reduce((t, l) => t + l.size, 0)
  const askTotal = asks.reduce((t, l) => t + l.size, 0)
  const bidShare = (bidTotal / (bidTotal + askTotal)) * 100
  const spreadBps = (book.spread / book.mid) * 10_000

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="mm-grid3 mm-thead">
        <span>Price</span>
        <span>Size (BTC)</span>
        <span>Total</span>
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
        {[...asks].reverse().map((level) => (
          <Level key={`a${level.price}`} level={level} side="ask" maxSize={maxSize} />
        ))}
        <div className="mm-mid">
          <span className="muted">Spread</span>
          <span className="num">
            {fmtPrice(book.spread)} <span className="muted">· {fmtBps(spreadBps)}</span>
          </span>
        </div>
        {bids.map((level) => (
          <Level key={`b${level.price}`} level={level} side="bid" maxSize={maxSize} />
        ))}
      </div>
      <div className="mm-imb" title={`Share of visible size on each side (${bids.length} levels)`}>
        <div className="num" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="pos">Bid {bidShare.toFixed(0)}%</span>
          <span className="neg">{(100 - bidShare).toFixed(0)}% Ask</span>
        </div>
        <div className="track">
          <div style={{ width: `${bidShare}%`, background: 'var(--mm-up)' }} />
          <div style={{ flex: 1, background: 'var(--mm-down)' }} />
        </div>
      </div>
    </div>
  )
}

function Level({ level, side, maxSize }: { level: OrderBookLevel; side: 'bid' | 'ask'; maxSize: number }) {
  return (
    <div
      className={`mm-grid3 mm-level num ${side}${level.isStrategyQuote ? ' own' : ''}`}
      title={level.isStrategyQuote ? 'Your resting order is at this price' : undefined}
    >
      <span className="fill" style={{ width: `${(level.size / maxSize) * 100}%` }} />
      <span className={side === 'bid' ? 'pos' : 'neg'}>{fmtPrice(level.price)}</span>
      <span>{fmtSize(level.size)}</span>
      <span className="muted">{fmtVolume(level.cumulativeDepth)}</span>
    </div>
  )
}

/** Cumulative depth curve built from the same levels as the ladder. */
function DepthChart({ bids, asks }: { bids: OrderBookLevel[]; asks: OrderBookLevel[] }) {
  const W = 280
  const H = 220
  const PAD = { l: 6, r: 6, t: 8, b: 20 }
  const lo = bids[bids.length - 1].price
  const hi = asks[asks.length - 1].price
  const maxDepth = Math.max(bids[bids.length - 1].cumulativeDepth, asks[asks.length - 1].cumulativeDepth)
  const x = (price: number) => PAD.l + ((price - lo) / (hi - lo)) * (W - PAD.l - PAD.r)
  const y = (depth: number) => PAD.t + (1 - depth / maxDepth) * (H - PAD.t - PAD.b)
  const base = H - PAD.b

  const step = (levels: OrderBookLevel[]) => {
    let d = `M ${x(levels[0].price)} ${base} L ${x(levels[0].price)} ${y(levels[0].cumulativeDepth)}`
    for (let i = 1; i < levels.length; i += 1) {
      d += ` L ${x(levels[i].price)} ${y(levels[i - 1].cumulativeDepth)} L ${x(levels[i].price)} ${y(levels[i].cumulativeDepth)}`
    }
    return `${d} L ${x(levels[levels.length - 1].price)} ${base} Z`
  }

  return (
    <div style={{ padding: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cumulative order book depth">
        <path d={step(bids)} fill="rgba(38,166,154,0.22)" stroke="#26a69a" strokeWidth="1" />
        <path d={step(asks)} fill="rgba(239,83,80,0.22)" stroke="#ef5350" strokeWidth="1" />
        <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} stroke="#252f3c" />
        <g fill="#5b6674" fontSize="9" fontFamily="var(--font-mono)">
          <text x={PAD.l} y={H - 6}>{fmtPrice(lo)}</text>
          <text x={W - PAD.r} y={H - 6} textAnchor="end">{fmtPrice(hi)}</text>
          <text x={W / 2} y={H - 6} textAnchor="middle">{fmtPrice((bids[0].price + asks[0].price) / 2)}</text>
          <text x={W / 2} y={PAD.t + 8} textAnchor="middle">{fmtVolume(maxDepth)} BTC max</text>
        </g>
      </svg>
    </div>
  )
}
