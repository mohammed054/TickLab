import { Candle, OrderBookSnapshot } from '../../contracts'
import { Panel, StatusDot } from '../shared/Panel'

export function MarketRegimePanel({ candles, book }: { candles: Candle[]; book: OrderBookSnapshot }) {
  const returns = candles.slice(1).map((candle, index) => Math.abs(candle.close / candles[index].close - 1))
  const volatility = returns.length > 0 ? returns.reduce((total, value) => total + value, 0) / returns.length : 0
  const volatilityLabel = volatility < 0.0002 ? 'LOW_VOLATILITY' : volatility < 0.0005 ? 'NORMAL_VOLATILITY' : volatility < 0.001 ? 'HIGH_VOLATILITY' : 'EXTREME_VOLATILITY'
  const visibleDepth = book.bids.reduce((total, level) => total + level.size, 0) + book.asks.reduce((total, level) => total + level.size, 0)
  const liquidityLabel = visibleDepth > 30 ? 'HIGH_LIQUIDITY' : 'LOW_LIQUIDITY'
  const signs = candles.slice(-8).map((candle, index, values) => index === 0 ? 0 : Math.sign(candle.close - values[index - 1].close))
  const flips = signs.slice(1).filter((sign, index) => sign !== 0 && signs[index] !== 0 && sign !== signs[index]).length
  const trendLabel = flips >= 4 ? 'UNSTABLE' : volatility > 0.0005 ? 'TREND_LIKE' : 'MEAN_REVERTING'
  const confidence = Math.max(1, Math.min(99, Math.round(100 - volatility * 100_000 - flips * 4)))

  return (
    <Panel title="MARKET REGIME">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><StatusDot state="ok" /><span className="mono">{volatilityLabel} {liquidityLabel}</span></div>
      <div className="mono dim" style={{ fontSize: 10, marginTop: 4 }}>Trend: {trendLabel} · Confidence: {confidence}%</div>
      <div style={{ fontSize: 9, opacity: 0.7, marginTop: 4 }}>statistical classification, not a prediction</div>
    </Panel>
  )
}
