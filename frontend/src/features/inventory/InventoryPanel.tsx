import { Panel } from '../../shared/design-system/Panel'
import { MetricRow } from '../../shared/design-system/MetricRow'

interface InventoryPanelProps {
  currentQty: number
  targetQty: number | null
  limitQty: number | null
  inventoryValue: number
  inventoryPnl: number
  inventoryVolatility: number | null
}

function pnlColor(v: number): string {
  if (v > 0) return 'var(--color-positive)'
  if (v < 0) return 'var(--color-negative)'
  return 'var(--color-text-primary)'
}

export function InventoryPanel({
  currentQty,
  targetQty,
  limitQty,
  inventoryValue,
  inventoryPnl,
  inventoryVolatility,
}: InventoryPanelProps) {
  return (
    <Panel header="Inventory">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <MetricRow label="Position" value={`${currentQty} BTC`} />
        {targetQty != null && <MetricRow label="Target" value={`${targetQty} BTC`} />}
        {limitQty != null && <MetricRow label="Limit" value={`${limitQty} BTC`} />}
        <MetricRow label="Value" value={`$${inventoryValue.toLocaleString()}`} />
        <MetricRow label="Inventory P&L" value={`$${inventoryPnl.toFixed(2)}`} color={pnlColor(inventoryPnl)} />
        {inventoryVolatility != null && (
          <MetricRow label="Volatility" value={`${inventoryVolatility.toFixed(2)}%`} />
        )}
      </div>
    </Panel>
  )
}
