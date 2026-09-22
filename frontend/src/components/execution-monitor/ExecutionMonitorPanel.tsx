import { Panel, MetricRow } from '../shared/Panel'

export function ExecutionMonitorPanel() {
  return (
    <Panel title="EXECUTION MONITOR">
      <MetricRow label="Feed latency" value="12.3ms" />
      <MetricRow label="Decision latency" value="8.7ms" />
      <MetricRow label="Order latency" value="15.2ms" />
      <MetricRow label="Exchange response" value="22.1ms" />
      <MetricRow label="Round-trip" value="58.3ms" />
      <MetricRow label="Rejected orders" value="0" />
      <MetricRow label="Cancelled orders" value="1" />
      <MetricRow label="Dropped events" value="0" />
      <MetricRow label="Sequence gaps" value="0" />
      <MetricRow label="Reconnects (24h)" value="2" />
    </Panel>
  )
}