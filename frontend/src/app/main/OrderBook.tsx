import { MockBookSnapshot } from '../../mock/mockData'
import { Panel } from '../shared/Panel'

export function OrderBook({ book }: { book: MockBookSnapshot }) {
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
    <Panel title="ORDER BOOK — LADDER (SIMULATED)" style={{ width: 250, flex: '0 0 auto' }} bodyStyle={{ padding: 0 }}>
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
    </Panel>
  )
}
