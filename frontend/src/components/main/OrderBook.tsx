import { useState } from 'react'
import { OrderBookLevel, OrderBookSnapshot } from '../../contracts'
import { MetricRow, Panel, SegmentedControl, StatusDot } from '../shared/Panel'

const MODES = ['Ladder', 'Heatmap', 'Depth Profile', 'Imbalance', 'Microstructure', 'Replay'] as const
type Mode = (typeof MODES)[number]
const LEVEL_OPTIONS = [5, 10, 12, 25, 50, 100] as const

type ViewBook = OrderBookSnapshot

export function OrderBook({ book, replayTimestampNs = null }: { book: OrderBookSnapshot; replayTimestampNs?: string | null }) {
  const [mode, setMode] = useState<Mode>('Ladder')
  const [levelCount, setLevelCount] = useState<number>(12)
  const viewBook = extendBook(book, levelCount)
  const maxSize = Math.max(...viewBook.bids.map((level) => level.size), ...viewBook.asks.map((level) => level.size), 1)

  return (
    <Panel title={replayTimestampNs ? 'ORDER BOOK (REPLAY PROJECTION)' : 'ORDER BOOK (SIMULATED)'} style={{ minWidth: 0, height: '100%' }} bodyStyle={{ padding: 0 }} right={<span className="mono dim" style={{ fontSize: 9 }}>{book.symbol} · {book.sequence.toLocaleString()}</span>}>
      <div style={{ display: 'flex', gap: 3, padding: '4px 6px', borderBottom: '1px solid var(--color-border-subtle)', overflowX: 'auto' }}>
        {MODES.map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} style={{ fontSize: 9, padding: '3px 5px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: mode === value ? 'var(--color-bg-control)' : 'transparent', color: mode === value ? 'var(--color-text-primary)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{value}</button>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', borderBottom: '1px solid var(--color-border-subtle)' }}><span className="dim" style={{ fontSize: 9 }}>DEPTH</span><SegmentedControl value={String(levelCount)} options={LEVEL_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))} onChange={(value) => setLevelCount(Number(value))} ariaLabel="Order book depth" /></div>
      {mode === 'Ladder' && <Ladder book={viewBook} maxSize={maxSize} />}
      {mode === 'Heatmap' && <Heatmap book={viewBook} />}
      {mode === 'Depth Profile' && <DepthProfile book={viewBook} maxSize={maxSize} />}
      {mode === 'Imbalance' && <ImbalanceView book={viewBook} />}
      {mode === 'Microstructure' && <MicrostructureView book={viewBook} />}
      {mode === 'Replay' && <ReplayView book={viewBook} />}
    </Panel>
  )
}

function Ladder({ book, maxSize }: { book: ViewBook; maxSize: number }) {
  return <><div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 8px', fontSize: 9, color: 'var(--text-3)' }}><span>PRICE</span><span>SIZE</span><span>#</span><span>CUM</span></div><div>{[...book.asks].reverse().map((level) => <Row key={`a${level.price}`} level={level} side="ask" maxSize={maxSize} />)}</div><div style={{ textAlign: 'center', padding: '4px 0', borderTop: '1px solid var(--color-border-strong)', borderBottom: '1px solid var(--color-border-strong)', background: 'var(--color-bg-raised)' }}><span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{book.mid.toFixed(1)}</span><span className="dim mono" style={{ fontSize: 9.5, marginLeft: 6 }}>spread {book.spread.toFixed(1)}</span></div><div>{book.bids.map((level) => <Row key={`b${level.price}`} level={level} side="bid" maxSize={maxSize} />)}</div></>
}

function Row({ level, side, maxSize }: { level: OrderBookLevel; side: 'bid' | 'ask'; maxSize: number }) {
  return <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr 34px 1fr', gap: 4, padding: '1.5px 8px', fontSize: 10.5, borderLeft: level.isStrategyQuote ? `2px solid var(--color-info)` : '2px solid transparent' }}><div style={{ position: 'absolute', [side === 'bid' ? 'right' : 'left']: 0, top: 0, bottom: 0, width: `${(level.size / maxSize) * 100}%`, background: side === 'bid' ? 'rgba(62,207,142,0.12)' : 'rgba(239,91,91,0.12)', pointerEvents: 'none' }} /><span className={`mono ${side === 'bid' ? 'pos' : 'neg'}`} style={{ position: 'relative' }}>{level.price.toFixed(1)}</span><span className="mono" style={{ position: 'relative' }}>{level.size.toFixed(3)}</span><span className="mono dim" style={{ position: 'relative' }}>{level.orderCount ?? '—'}</span><span className="mono dim" style={{ position: 'relative', textAlign: 'right' }}>{level.cumulativeDepth.toFixed(2)}</span></div>
}

function ImbalanceView({ book }: { book: ViewBook }) {
  const bidTotal = book.bids.reduce((sum, level) => sum + level.size, 0)
  const askTotal = book.asks.reduce((sum, level) => sum + level.size, 0)
  const bidPct = (bidTotal / (bidTotal + askTotal || 1)) * 100
  return <div style={{ padding: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }} className="mono"><span className="pos">BID {bidTotal.toFixed(2)}</span><span className="neg">ASK {askTotal.toFixed(2)}</span></div><div style={{ display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}><div style={{ width: `${bidPct}%`, background: 'var(--color-positive-dim)' }} /><div style={{ width: `${100 - bidPct}%`, background: 'var(--color-negative-dim)' }} /></div><div className="dim mono" style={{ textAlign: 'center', marginTop: 6, fontSize: 11 }}>imbalance {(bidPct - 50).toFixed(1)}% toward {bidPct >= 50 ? 'bid' : 'ask'}</div><p className="dim" style={{ fontSize: 10.5, marginTop: 10 }}>Statistical association only — simulated, not a prediction of future price movement.</p></div>
}

function DepthProfile({ book, maxSize }: { book: ViewBook; maxSize: number }) {
  return <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>{[...book.asks].reverse().map((level) => <div key={`da${level.price}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="mono neg" style={{ width: 60, fontSize: 10.5 }}>{level.price.toFixed(1)}</span><div style={{ flex: 1, background: 'var(--color-bg-raised)', height: 8, borderRadius: 2, overflow: 'hidden' }}><div style={{ width: `${(level.size / maxSize) * 100}%`, height: '100%', background: 'var(--color-negative)' }} /></div></div>)}<div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '3px 0' }} />{book.bids.map((level) => <div key={`db${level.price}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="mono pos" style={{ width: 60, fontSize: 10.5 }}>{level.price.toFixed(1)}</span><div style={{ flex: 1, background: 'var(--color-bg-raised)', height: 8, borderRadius: 2, overflow: 'hidden' }}><div style={{ width: `${(level.size / maxSize) * 100}%`, height: '100%', background: 'var(--color-positive)' }} /></div></div>)}</div>
}

function Heatmap({ book }: { book: ViewBook }) {
  const rows = 10
  const columns = 24
  return <div style={{ padding: 8 }}><div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 2, height: 150, alignContent: 'center' }}>{Array.from({ length: rows * columns }, (_, index) => { const row = Math.floor(index / columns); const intensity = Math.abs(Math.sin((row + 1) * 0.8 + index * 0.31 + book.mid)); const bid = row < rows / 2; return <div key={index} title={`${bid ? 'Bid' : 'Ask'} ${book.mid.toFixed(1)} · ${(intensity * 4).toFixed(2)} BTC`} style={{ background: bid ? `rgba(62,207,142,${0.12 + intensity * 0.5})` : `rgba(239,91,91,${0.12 + intensity * 0.5})`, minHeight: 5 }} /> })}</div><div className="dim" style={{ fontSize: 9, marginTop: 6 }}>Historical liquidity-through-time placeholder · mock event artifact</div></div>
}

function MicrostructureView({ book }: { book: ViewBook }) {
  return <div style={{ padding: 8 }}><MetricRow label="Last sequence" value={book.sequence.toLocaleString()} /><MetricRow label="Mid" value={book.mid.toFixed(1)} /><MetricRow label="Spread" value={`${book.spread.toFixed(1)} ticks`} />{book.bids.slice(0, 5).map((level) => <div key={level.price} className="mono" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-subtle)', padding: '3px 0', fontSize: 10 }}><span className="pos">MODIFY BID {level.price.toFixed(1)}</span><span>{level.size.toFixed(3)}</span></div>)}</div>
}

function ReplayView({ book }: { book: ViewBook }) {
  return <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><StatusDot state="ok" /><span className="mono" style={{ fontSize: 11 }}>REPLAY BOOK FRAME</span></div><MetricRow label="Timestamp" value={book.timestampNs} /><MetricRow label="Sequence" value={book.sequence.toLocaleString()} /><div className="dim" style={{ fontSize: 10 }}>This frame is driven by the shared replay cursor. Use the Secondary Monitor transport to advance it.</div></div>
}

function extendBook(book: OrderBookSnapshot, count: number): ViewBook {
  if (count <= book.bids.length) return { ...book, bids: book.bids.slice(0, count), asks: book.asks.slice(0, count) }
  const extend = (levels: OrderBookLevel[], side: 'bid' | 'ask') => Array.from({ length: count }, (_, index) => {
    if (index < levels.length) return levels[index]
    const distance = index + 1
    const previous = levels[levels.length - 1]
    return { price: Number((book.mid + (side === 'bid' ? -1 : 1) * book.spread * distance).toFixed(1)), size: Number((0.35 + Math.abs(Math.sin(index * 0.7)) * 2).toFixed(3)), orderCount: null, cumulativeDepth: Number(((previous?.cumulativeDepth ?? 0) + (index - levels.length + 1) * 0.5).toFixed(2)), distanceFromMidTicks: distance, distanceFromMidBps: Number((distance * 0.01).toFixed(4)), isStrategyQuote: false }
  })
  const bids = extend(book.bids, 'bid')
  const asks = extend(book.asks, 'ask')
  return { ...book, bids: bids.slice(0, count), asks: asks.slice(0, count) }
}
