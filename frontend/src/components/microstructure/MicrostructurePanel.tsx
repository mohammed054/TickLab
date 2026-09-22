import { Panel, MetricRow } from '../shared/Panel'

export function MicrostructurePanel() {
  return (
    <Panel title="MARKET MICROSTRUCTURE">
      <MetricRow label="Spread (ticks)" value="0.5" />
      <MetricRow label="Spread (bps)" value="1.2" />
      <MetricRow label="5-level depth" value="12.3 BTC" />
      <MetricRow label="10-level depth" value="24.7 BTC" />
      <MetricRow label="25-level depth" value="38.1 BTC" />
      <MetricRow label="Total visible depth" value="75.0 BTC" />
    </Panel>
  )
}