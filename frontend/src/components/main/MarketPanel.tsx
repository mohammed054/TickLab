import { useMemo } from 'react'
import type { Candle, OrderBookSnapshot, Trade } from '../../contracts'
import { fmtBps, fmtPrice, fmtVolume, signClass } from '../../shared/format'
import { MMPanel, Row } from './mm'

const sum = (levels: { size: number }[], n: number) => levels.slice(0, n).reduce((total, level) => total + level.size, 0)

/** Order book and flow statistics. Everything here is computed from the same book/trades the ladder shows. */
export function MarketPanel({ book, trades, candles }: { book: OrderBookSnapshot; trades: Trade[]; candles: Candle[] }) {
  const stats = useMemo(() => {
    const bestBid = book.bids[0]
    const bestAsk = book.asks[0]
    const micro = (bestBid.size * bestAsk.price + bestAsk.size * bestBid.price) / (bestBid.size + bestAsk.size)
    const bid5 = sum(book.bids, 5)
    const ask5 = sum(book.asks, 5)
    const latest = candles[candles.length - 1]
    const windowStart = latest ? Number(BigInt(latest.timestampNs) / 1_000_000n) + 1_000 - 60_000 : 0
    let delta = 0
    for (const trade of trades) {
      if (Number(BigInt(trade.timestampNs) / 1_000_000n) < windowStart) break // trades are newest-first
      delta += trade.side === 'BUY' ? trade.size : -trade.size
    }
    const closes = candles.slice(-61).map((c) => c.close)
    const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]))
    const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1)
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length || 1)
    return {
      micro,
      imbalance: (bid5 - ask5) / (bid5 + ask5),
      delta,
      volBps: Math.sqrt(variance) * 10_000,
    }
  }, [book, trades, candles])

  const depth = [5, 10, 20].map((n) => ({ n, bid: sum(book.bids, n), ask: sum(book.asks, n) }))

  return (
    <MMPanel title="Market">
      <Row label="Microprice" value={fmtPrice(stats.micro)} title="Size-weighted mid of the best bid and ask" />
      <Row label="Imbalance (5 lvl)" value={`${stats.imbalance >= 0 ? '+' : '\u2212'}${Math.abs(stats.imbalance * 100).toFixed(0)}%`} tone={signClass(stats.imbalance, 2)} title="(bid − ask) / (bid + ask) over the top 5 levels" />
      <Row label="Flow Δ (60s)" value={`${stats.delta >= 0 ? '+' : '\u2212'}${fmtVolume(Math.abs(stats.delta))} BTC`} tone={signClass(stats.delta)} title="Aggressive buy volume minus aggressive sell volume" />
      <Row label="Volatility (1s, 60s)" value={fmtBps(stats.volBps)} title="Standard deviation of 1-second log returns over the last 60 seconds" />
      <div className="mm-sep" />
      <div className="mm-cols" style={{ gridTemplateColumns: '1fr auto auto' }}>
        <span className="h">Depth (BTC)</span>
        <span className="h">Bid</span>
        <span className="h">Ask</span>
        {depth.map((d) => (
          <DepthRow key={d.n} label={`Top ${d.n}`} bid={d.bid} ask={d.ask} />
        ))}
      </div>
    </MMPanel>
  )
}

function DepthRow({ label, bid, ask }: { label: string; bid: number; ask: number }) {
  return (
    <>
      <span className="c name">{label}</span>
      <span className="c num pos">{fmtVolume(bid)}</span>
      <span className="c num neg">{fmtVolume(ask)}</span>
    </>
  )
}
