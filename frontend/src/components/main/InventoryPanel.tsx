import { StrategyState } from '../../contracts'
import { MetricRow, Panel } from '../shared/Panel'

export function InventoryPanel({ strategy }: { strategy: StrategyState }) {
  const inventoryPnl = strategy.unrealizedPnl
  return (
    <Panel title="INVENTORY">
      <MetricRow label="Current" value={`${strategy.inventory >= 0 ? '+' : ''}${strategy.inventory.toFixed(3)} BTC`} valueClass={strategy.inventory >= 0 ? 'pos' : 'neg'} />
      <MetricRow label="Target" value="0.000 BTC" />
      <MetricRow label="Limit" value="2.000 BTC" />
      <MetricRow label="Value" value={`$${strategy.inventoryValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
      <MetricRow label="Inventory P&L" value={`${inventoryPnl >= 0 ? '+' : ''}$${inventoryPnl.toFixed(2)}`} valueClass={inventoryPnl >= 0 ? 'pos' : 'neg'} />
      <div className="mono dim" style={{ fontSize: 9, marginTop: 4 }}>one-sided fill activity is highlighted in replay</div>
    </Panel>
  )
}
