import { Trade } from '../../contracts'
import { MetricRow, Panel } from '../shared/Panel'

export function OrderFlowPanel({ trades }: { trades: Trade[] }) {
  const buyVol = trades.filter((t) => t.side === 'BUY').reduce((s, t) => s + t.size, 0)
  const sellVol = trades.filter((t) => t.side === 'SELL').reduce((s, t) => s + t.size, 0)
  const delta = buyVol - sellVol
  const avgSize = trades.length ? (buyVol + sellVol) / trades.length : 0

  return (
    <Panel title="ORDER FLOW (SIMULATED)" style={{ flex: '0 0 220px' }}>
      <MetricRow label="Buy pressure" value={buyVol.toFixed(2)} valueClass="pos" />
      <MetricRow label="Sell pressure" value={sellVol.toFixed(2)} valueClass="neg" />
      <MetricRow label="Delta" value={(delta >= 0 ? '+' : '') + delta.toFixed(2)} valueClass={delta >= 0 ? 'pos' : 'neg'} />
      <MetricRow label="Trades/sec" value={(trades.length / 6).toFixed(1)} />
      <MetricRow label="Avg trade size" value={avgSize.toFixed(3)} />
      <MetricRow label="Aggressive buy ratio" value={`${((buyVol / (buyVol + sellVol || 1)) * 100).toFixed(0)}%`} />
    </Panel>
  )
}
