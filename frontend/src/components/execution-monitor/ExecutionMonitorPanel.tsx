import { StrategyState } from '../../contracts'
import { MetricRow, Panel } from '../shared/Panel'

export function ExecutionMonitorPanel({ strategy, tick }: { strategy: StrategyState; tick: number }) {
  const feed = strategy.latencyMs
  const decision = strategy.latencyMs * 0.42
  const order = strategy.latencyMs * 0.68
  const exchange = strategy.latencyMs * 1.15
  const roundTrip = feed + decision + order + exchange
  return (
    <Panel title="EXECUTION MONITOR">
      <MetricRow label="Feed latency" value={`${feed.toFixed(1)}ms`} />
      <MetricRow label="Decision latency" value={`${decision.toFixed(1)}ms`} />
      <MetricRow label="Order latency" value={`${order.toFixed(1)}ms`} />
      <MetricRow label="Exchange response" value={`${exchange.toFixed(1)}ms`} />
      <MetricRow label="Round-trip" value={`${roundTrip.toFixed(1)}ms`} />
      <MetricRow label="Rejected orders" value="0" />
      <MetricRow label="Cancelled orders" value={strategy.cancelled.toLocaleString()} />
      <MetricRow label="Dropped events" value="0" />
      <MetricRow label="Sequence gaps" value="0" />
      <MetricRow label="Reconnects (24h)" value="2" />
      <MetricRow label="Last runtime tick" value={tick.toLocaleString()} />
    </Panel>
  )
}
