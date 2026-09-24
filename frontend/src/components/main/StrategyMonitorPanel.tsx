import { StrategyState } from '../../contracts'
import { MetricRow, Panel, StatusDot } from '../shared/Panel'

export function StrategyMonitorPanel({ s }: { s: StrategyState }) {
  const net = s.realizedPnl + s.unrealizedPnl + s.fees
  return (
    <Panel
      title="STRATEGY MONITOR (SIMULATED)"
      style={{ flex: '0 0 220px' }}
      right={
        <span className="mono" style={{ fontSize: 10 }}>
          <StatusDot state="ok" /> {s.name} {s.status}
        </span>
      }
    >
      <MetricRow label="Inventory" value={`${s.inventory >= 0 ? '+' : ''}${s.inventory} BTC`} />
      <MetricRow label="Inventory value" value={`$${s.inventoryValue.toLocaleString()}`} />
      <MetricRow label="Realized P&L" value={`+$${s.realizedPnl}`} valueClass="pos" />
      <MetricRow label="Unrealized P&L" value={`+$${s.unrealizedPnl}`} valueClass="pos" />
      <MetricRow label="Fees" value={`-$${Math.abs(s.fees)}`} valueClass="neg" />
      <div style={{ borderTop: '1px solid var(--border-1)', margin: '4px 0' }} />
      <MetricRow label="NET P&L" value={`${net >= 0 ? '+' : ''}$${net.toFixed(2)}`} valueClass={net >= 0 ? 'pos' : 'neg'} />
      <MetricRow label="Orders / Fills / Cancelled" value={`${s.orders} / ${s.fills} / ${s.cancelled}`} />
      <MetricRow label="Fill rate" value={`${s.fillRate}%`} />
      <MetricRow label="Latency" value={`${s.latencyMs}ms`} />
    </Panel>
  )
}
