import { Panel, MetricRow, StatusDot } from '../shared/Panel'

export function RiskPanel() {
  return (
    <Panel title="RISK CONTROLS">
      <MetricRow label="Current exposure" value="1.50 BTC" />
      <MetricRow label="Max exposure" value="2.00 BTC" />
      <MetricRow label="Max daily loss" value="$800" />
      <MetricRow label="Current daily P&L" value="+$120" valueClass="pos" />
      <MetricRow label="Max drawdown" value="5%" />
      <MetricRow label="Open orders" value="3" />
      <MetricRow label="Notional value" value="$45,000" />
      <MetricRow label="Margin usage" value="30%" />
      <MetricRow label="Liquidation distance" value="15%" />
    </Panel>
  )
}