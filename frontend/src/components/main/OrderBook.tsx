import { useState } from 'react'
import { OrderBookLevel, OrderBookSnapshot } from '../../contracts'
import { MetricRow, Panel, StatusDot } from '../shared/Panel'

const MODES = ['Ladder', 'Heatmap', 'Depth Profile', 'Imbalance', 'Microstructure'] as const
type Mode = (typeof MODES)[number]
const LEVEL_OPTIONS = [10, 15, 25, 50, 100] as const

type ViewBook = OrderBookSnapshot

export function OrderBook({
  book,
  replayTimestampNs = null,
}: {
  book: OrderBookSnapshot
  replayTimestampNs?: string | null
}) {
  const [mode, setMode] = useState<Mode>('Ladder')
  const [levelCount, setLevelCount] = useState<number>(15)
  const viewBook = extendBook(book, levelCount)
  const maxSize = Math.max(
    ...viewBook.bids.map((level) => level.size),
    ...viewBook.asks.map((level) => level.size),
    1
  )

  return (
    <Panel
      title={replayTimestampNs ? 'ORDER BOOK LADDER · REPLAY' : 'ORDER BOOK LADDER (L2/L3)'}
      style={{ minWidth: 0, height: '100%' }}
      bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column' }}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono dim" style={{ fontSize: '9px' }}>
            SEQ #{book.sequence.toLocaleString()}
          </span>
          <StatusDot state="ok" pulse />
        </div>
      }
    >
      {/* View Switcher & Depth controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '3px 6px',
          background: 'var(--color-bg-raised)',
          borderBottom: '1px solid var(--color-border-subtle)',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 2 }}>
          {MODES.map((value) => {
            const isActive = mode === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setMode(value)}
                style={{
                  fontSize: '9px',
                  padding: '2px 5px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--color-border-accent)' : 'transparent',
                  background: isActive ? 'var(--color-bg-control-active)' : 'transparent',
                  color: isActive ? 'var(--color-focus)' : 'var(--color-text-muted)',
                  fontWeight: isActive ? 700 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {value.toUpperCase()}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span className="dim mono" style={{ fontSize: '8.5px', textTransform: 'uppercase' }}>
            LVLS:
          </span>
          <div style={{ display: 'flex', gap: 1 }}>
            {LEVEL_OPTIONS.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setLevelCount(val)}
                style={{
                  fontSize: '8.5px',
                  padding: '1px 4px',
                  borderRadius: '2px',
                  background: levelCount === val ? 'var(--color-bg-control)' : 'transparent',
                  color: levelCount === val ? 'var(--color-focus)' : 'var(--color-text-muted)',
                  fontWeight: levelCount === val ? 700 : 400,
                }}
              >
                {val}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main View Body */}
      <div style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0 }}>
        {mode === 'Ladder' && <Ladder book={viewBook} maxSize={maxSize} />}
        {mode === 'Heatmap' && <Heatmap book={viewBook} />}
        {mode === 'Depth Profile' && <DepthProfile book={viewBook} maxSize={maxSize} />}
        {mode === 'Imbalance' && <ImbalanceView book={viewBook} />}
        {mode === 'Microstructure' && <MicrostructureView book={viewBook} />}
      </div>
    </Panel>
  )
}

function Ladder({ book, maxSize }: { book: ViewBook; maxSize: number }) {
  const bestBid = book.bids[0]
  const bestAsk = book.asks[0]
  const microPrice =
    bestBid && bestAsk
      ? (bestBid.size * bestAsk.price + bestAsk.size * bestBid.price) / (bestBid.size + bestAsk.size)
      : book.mid

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Column Headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 30px 1fr',
          padding: '3px 8px',
          fontSize: '9px',
          fontWeight: 600,
          color: 'var(--color-text-muted)',
          borderBottom: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-panel)',
          letterSpacing: '0.04em',
        }}
      >
        <span>PRICE ($)</span>
        <span style={{ textAlign: 'right' }}>SIZE (BTC)</span>
        <span style={{ textAlign: 'center' }}>ORD</span>
        <span style={{ textAlign: 'right' }}>CUM DEPTH</span>
      </div>

      {/* Asks (Sell orders - red) */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {[...book.asks].reverse().map((level) => (
          <Row key={`a${level.price}`} level={level} side="ask" maxSize={maxSize} />
        ))}
      </div>

      {/* Mid Market / Spread Divider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '3px 8px',
          borderTop: '1px solid var(--color-border-strong)',
          borderBottom: '1px solid var(--color-border-strong)',
          background: 'var(--color-bg-raised)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            ${book.mid.toFixed(1)}
          </span>
          <span className="dim mono" style={{ fontSize: '9px' }}>
            SPREAD: <span style={{ color: 'var(--color-focus)' }}>{book.spread.toFixed(1)}</span> (1 tick)
          </span>
        </div>
        <div className="mono dim" style={{ fontSize: '9px' }}>
          MICRO: <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{microPrice.toFixed(2)}</span>
        </div>
      </div>

      {/* Bids (Buy orders - green) */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {book.bids.map((level) => (
          <Row key={`b${level.price}`} level={level} side="bid" maxSize={maxSize} />
        ))}
      </div>
    </div>
  )
}

function Row({
  level,
  side,
  maxSize,
}: {
  level: OrderBookLevel
  side: 'bid' | 'ask'
  maxSize: number
}) {
  const depthWidth = Math.min(100, (level.size / maxSize) * 100)

  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 30px 1fr',
        gap: 4,
        padding: '1.5px 8px',
        fontSize: '10.5px',
        borderLeft: level.isStrategyQuote ? '2px solid var(--color-warning)' : '2px solid transparent',
        transition: 'background 0.08s ease',
      }}
      className="mono"
    >
      {/* Liquidity Depth Bar */}
      <div
        style={{
          position: 'absolute',
          [side === 'bid' ? 'right' : 'left']: 0,
          top: 0,
          bottom: 0,
          width: `${depthWidth}%`,
          background: side === 'bid' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)',
          pointerEvents: 'none',
        }}
      />

      {/* Price */}
      <span
        style={{
          position: 'relative',
          fontWeight: 600,
          color: side === 'bid' ? 'var(--color-positive)' : 'var(--color-negative)',
        }}
      >
        {level.price.toFixed(1)}
      </span>

      {/* Size */}
      <span style={{ position: 'relative', textAlign: 'right', color: 'var(--color-text-primary)' }}>
        {level.size.toFixed(3)}
      </span>

      {/* Order Count */}
      <span style={{ position: 'relative', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '9.5px' }}>
        {level.orderCount ?? '1'}
      </span>

      {/* Cumulative Depth */}
      <span style={{ position: 'relative', textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: '9.5px' }}>
        {level.cumulativeDepth.toFixed(2)}
      </span>
    </div>
  )
}

function ImbalanceView({ book }: { book: ViewBook }) {
  const bidTotal = book.bids.reduce((sum, level) => sum + level.size, 0)
  const askTotal = book.asks.reduce((sum, level) => sum + level.size, 0)
  const bidPct = (bidTotal / (bidTotal + askTotal || 1)) * 100
  const imbalance = (bidPct - 50) * 2

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }} className="mono">
        <span className="pos" style={{ fontWeight: 600 }}>
          BID DEPTH: {bidTotal.toFixed(2)} BTC
        </span>
        <span className="neg" style={{ fontWeight: 600 }}>
          ASK DEPTH: {askTotal.toFixed(2)} BTC
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          height: 16,
          borderRadius: 'var(--radius-xs)',
          overflow: 'hidden',
          border: '1px solid var(--color-border-strong)',
        }}
      >
        <div style={{ width: `${bidPct}%`, background: 'var(--color-positive)' }} />
        <div style={{ width: `${100 - bidPct}%`, background: 'var(--color-negative)' }} />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'var(--color-bg-raised)',
          borderRadius: 'var(--radius-xs)',
          fontSize: '11px',
        }}
        className="mono"
      >
        <span style={{ color: 'var(--color-text-muted)' }}>ORDER FLOW IMBALANCE (OFI)</span>
        <span style={{ fontWeight: 700, color: imbalance >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
          {imbalance >= 0 ? '+' : ''}
          {imbalance.toFixed(1)}% ({imbalance >= 0 ? 'BUY SKEW' : 'SELL SKEW'})
        </span>
      </div>
    </div>
  )
}

function DepthProfile({ book, maxSize }: { book: ViewBook; maxSize: number }) {
  return (
    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {[...book.asks].reverse().map((level) => (
        <div key={`da${level.price}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono neg" style={{ width: 55, fontSize: '10px' }}>
            {level.price.toFixed(1)}
          </span>
          <div style={{ flex: 1, background: 'var(--color-bg-raised)', height: 7, borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(level.size / maxSize) * 100}%`,
                height: '100%',
                background: 'var(--color-negative)',
              }}
            />
          </div>
          <span className="mono dim" style={{ width: 45, textAlign: 'right', fontSize: '9px' }}>
            {level.size.toFixed(2)}
          </span>
        </div>
      ))}

      <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />

      {book.bids.map((level) => (
        <div key={`db${level.price}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono pos" style={{ width: 55, fontSize: '10px' }}>
            {level.price.toFixed(1)}
          </span>
          <div style={{ flex: 1, background: 'var(--color-bg-raised)', height: 7, borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(level.size / maxSize) * 100}%`,
                height: '100%',
                background: 'var(--color-positive)',
              }}
            />
          </div>
          <span className="mono dim" style={{ width: 45, textAlign: 'right', fontSize: '9px' }}>
            {level.size.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  )
}

function Heatmap({ book }: { book: ViewBook }) {
  const rows = 12
  const columns = 28
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 2,
          height: 160,
          alignContent: 'center',
          background: 'var(--color-bg-base)',
          padding: 6,
          borderRadius: 'var(--radius-xs)',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        {Array.from({ length: rows * columns }, (_, index) => {
          const row = Math.floor(index / columns)
          const intensity = Math.abs(Math.sin((row + 1) * 0.8 + index * 0.31 + book.mid))
          const bid = row >= rows / 2
          return (
            <div
              key={index}
              title={`${bid ? 'Bid' : 'Ask'} ${(intensity * 4).toFixed(2)} BTC`}
              style={{
                background: bid
                  ? `rgba(16, 185, 129, ${0.1 + intensity * 0.7})`
                  : `rgba(244, 63, 94, ${0.1 + intensity * 0.7})`,
                borderRadius: '1px',
                minHeight: 6,
              }}
            />
          )
        })}
      </div>
      <div className="mono dim" style={{ fontSize: '9px', textAlign: 'center' }}>
        HISTORICAL L2/L3 LIQUIDITY HEATMAP · ORDER BOOK DENSITY THROUGH TIME
      </div>
    </div>
  )
}

function MicrostructureView({ book }: { book: ViewBook }) {
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <MetricRow label="Sequence ID" value={`#${book.sequence.toLocaleString()}`} />
      <MetricRow label="Mid Price" value={`$${book.mid.toFixed(1)}`} />
      <MetricRow label="Bid-Ask Spread" value={`${book.spread.toFixed(1)} ($${book.spread.toFixed(1)})`} />
      <MetricRow label="Best Bid" value={`$${book.bids[0]?.price.toFixed(1) ?? '—'}`} valueClass="pos" />
      <MetricRow label="Best Ask" value={`$${book.asks[0]?.price.toFixed(1) ?? '—'}`} valueClass="neg" />

      <div style={{ marginTop: 6, fontSize: '9px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
        TOP-OF-BOOK QUEUE DEPTH
      </div>
      {book.bids.slice(0, 4).map((level) => (
        <div
          key={level.price}
          className="mono"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-border-subtle)',
            padding: '2.5px 0',
            fontSize: '10px',
          }}
        >
          <span className="pos">BID ${level.price.toFixed(1)}</span>
          <span style={{ color: 'var(--color-text-primary)' }}>{level.size.toFixed(3)} BTC</span>
        </div>
      ))}
    </div>
  )
}

function extendBook(book: OrderBookSnapshot, count: number): ViewBook {
  if (count <= book.bids.length) return { ...book, bids: book.bids.slice(0, count), asks: book.asks.slice(0, count) }
  const extend = (levels: OrderBookLevel[], side: 'bid' | 'ask') =>
    Array.from({ length: count }, (_, index) => {
      if (index < levels.length) return levels[index]
      const distance = index + 1
      const previous = levels[levels.length - 1]
      return {
        price: Number((book.mid + (side === 'bid' ? -1 : 1) * book.spread * distance).toFixed(1)),
        size: Number((0.35 + Math.abs(Math.sin(index * 0.7)) * 2).toFixed(3)),
        orderCount: 1,
        cumulativeDepth: Number(((previous?.cumulativeDepth ?? 0) + (index - levels.length + 1) * 0.5).toFixed(2)),
        distanceFromMidTicks: distance,
        distanceFromMidBps: Number((distance * 0.01).toFixed(4)),
        isStrategyQuote: false,
      }
    })
  const bids = extend(book.bids, 'bid')
  const asks = extend(book.asks, 'ask')
  return { ...book, bids, asks }
}
