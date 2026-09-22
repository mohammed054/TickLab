import { useState } from 'react'
import { MockBookSnapshot } from '../../mock/mockData'
import { Panel } from '../shared/Panel'

const MODES = ['Ladder', 'Imbalance', 'Depth Profile'] as const
type Mode = (typeof MODES)[number]

function ImbalanceView({ book }: { book: MockBookSnapshot }) {
  const bidTotal = book.bids.reduce((s, b) => s + b.size, 0)
  const askTotal = book.asks.reduce((s, a) => s + a.size, 0)
  const total = bidTotal + askTotal || 1
  const bidPct = (bidTotal / total) * 100
  return (
    <div style={{ padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }} className="mono">
        <span className="pos">BID {bidTotal.toFixed(2)}</span>
        <span className="neg">ASK {askTotal.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border-1)' }}>
        <div style={{ width: `${bidPct}%`, background: 'var(--pos-dim)' }} />
        <div style={{ width: `${100 - bidPct}%`, background: 'var(--neg-dim)' }} />
      </div>
      <div className="dim mono" style={{ textAlign: 'center', marginTop: 6, fontSize: 11 }}>
        imbalance {bidPct >= 50 ? '+' : ''}
        {(bidPct - 50).toFixed(1)}% toward {bidPct >= 50 ? 'bid' : 'ask'}
      </div>
      <p className="dim" style={{ fontSize: 10.5, marginTop: 10 }}>
        Statistical association only — simulated, not a prediction of future price movement.
      </p>
    </div>
  )
}

function DepthProfile({ book }: { book: MockBookSnapshot }) {
  const maxSize = Math.max(...book.bids.map((b) => b.size), ...book.asks.map((a) => a.size))
  return (
    <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {[...book.asks].reverse().map((a) => (
        <div key={`da${a.price}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono neg" style={{ width: 60, fontSize: 10.5 }}>
            {a.price.toFixed(1)}
          </span>
          <div style={{ flex: 1, background: 'var(--bg-2)', height: 8, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${(a.size / maxSize) * 100}%`, height: '100%', background: 'var(--neg)' }} />
          </div>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--border-1)', margin: '3px 0' }} />
      {book.bids.map((b) => (
        <div key={`db${b.price}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono pos" style={{ width: 60, fontSize: 10.5 }}>
            {b.price.toFixed(1)}
          </span>
          <div style={{ flex: 1, background: 'var(--bg-2)', height: 8, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${(b.size / maxSize) * 100}%`, height: '100%', background: 'var(--pos)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function OrderBook({ book }: { book: MockBookSnapshot }) {
  const [mode, setMode] = useState<Mode>('Ladder')
  const maxSize = Math.max(...book.bids.map((b) => b.size), ...book.asks.map((a) => a.size))

  const Row = ({ price, size, orders, side }: { price: number; size: number; orders: number; side: 'bid' | 'ask' }) => (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '1.5px 6px', fontSize: 11 }}>
      <div
        style={{
          position: 'absolute',
          [side === 'bid' ? 'right' : 'left']: 0,
          top: 0,
          bottom: 0,
          width: `${(size / maxSize) * 100}%`,
          background: side === 'bid' ? 'rgba(62,207,142,0.12)' : 'rgba(239,91,91,0.12)',
        }}
      />
      <span className={`mono ${side === 'bid' ? 'pos' : 'neg'}`} style={{ position: 'relative' }}>
        {price.toFixed(1)}
      </span>
      <span className="mono dim" style={{ position: 'relative' }}>
        {size.toFixed(3)}
      </span>
      <span className="mono dim" style={{ position: 'relative', fontSize: 9.5, opacity: 0.7 }}>
        {orders}
      </span>
    </div>
  )

  return (
    <Panel
      title="ORDER BOOK (SIMULATED)"
      style={{ width: 250, flex: '0 0 auto' }}
      bodyStyle={{ padding: 0 }}
      right={
        <div style={{ display: 'flex', gap: 3 }}>
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                fontSize: 9,
                padding: '2px 5px',
                borderRadius: 3,
                border: '1px solid var(--border-1)',
                background: m === mode ? 'var(--bg-3)' : 'transparent',
                color: m === mode ? 'var(--text-0)' : 'var(--text-2)',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      }
    >
      {mode === 'Ladder' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', fontSize: 9, color: 'var(--text-3)' }}>
            <span>PRICE</span>
            <span>SIZE</span>
            <span>#</span>
          </div>
          <div>
            {[...book.asks].reverse().map((a) => (
              <Row key={`a${a.price}`} price={a.price} size={a.size} orders={a.orders} side="ask" />
            ))}
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: '4px 0',
              borderTop: '1px solid var(--border-1)',
              borderBottom: '1px solid var(--border-1)',
              background: 'var(--bg-2)',
            }}
          >
            <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
              {book.mid.toFixed(1)}
            </span>
            <span className="dim mono" style={{ fontSize: 9.5, marginLeft: 6 }}>
              spread {book.spread.toFixed(1)}
            </span>
          </div>
          <div>
            {book.bids.map((b) => (
              <Row key={`b${b.price}`} price={b.price} size={b.size} orders={b.orders} side="bid" />
            ))}
          </div>
        </>
      )}
      {mode === 'Imbalance' && <ImbalanceView book={book} />}
      {mode === 'Depth Profile' && <DepthProfile book={book} />}
    </Panel>
  )
}
