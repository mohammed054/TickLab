import { OrderBookSnapshot, Trade } from '../../contracts'
import { MetricRow, Panel } from '../shared/Panel'

export function MicrostructurePanel({ book, trades }: { book: OrderBookSnapshot; trades: Trade[] }) {
  const bidDepth = book.bids.reduce((total, level) => total + level.size, 0)
  const askDepth = book.asks.reduce((total, level) => total + level.size, 0)
  const tradeIntensity = trades.length
  return (
    <Panel title="MARKET MICROSTRUCTURE">
      <MetricRow label="Spread (ticks)" value={(book.spread / 0.1).toFixed(1)} />
      <MetricRow label="Spread (bps)" value={((book.spread / book.mid) * 10_000).toFixed(2)} />
      <MetricRow label="5-level depth" value={`${bidDepth.toFixed(2)} / ${askDepth.toFixed(2)} BTC`} />
      <MetricRow label="10-level depth" value={`${book.bids.slice(0, 10).reduce((total, level) => total + level.size, 0).toFixed(2)} BTC`} />
      <MetricRow label="25-level depth" value={`${book.bids.slice(0, 25).reduce((total, level) => total + level.size, 0).toFixed(2)} BTC`} />
      <MetricRow label="Total visible depth" value={`${(bidDepth + askDepth).toFixed(2)} BTC`} />
      <MetricRow label="Trade intensity" value={`${tradeIntensity} events`} />
    </Panel>
  )
}
