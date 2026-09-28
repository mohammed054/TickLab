import { StrategyState } from '../../contracts'
import { MetricRow, Panel } from '../shared/Panel'

export function InventoryPanel({ strategy }: { strategy: StrategyState }) {
  const inventoryPnl = strategy.unrealizedPnl
  const limit = 2.0
  const inventoryRatio = Math.min(100, (Math.abs(strategy.inventory) / limit) * 100)

  return (
    <Panel title="INVENTORY & SKEW" style={{ height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Inventory Utilization Gauge */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px' }} className="mono">
            <span style={{ color: 'var(--color-text-muted)' }}>INVENTORY LIMIT USAGE</span>
            <span style={{ color: inventoryRatio > 80 ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
              {inventoryRatio.toFixed(0)}% / {limit} BTC
            </span>
          </div>
          <div
            style={{
              height: 4,
              background: 'var(--color-bg-base)',
              borderRadius: '2px',
              overflow: 'hidden',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div
              style={{
                width: `${inventoryRatio}%`,
                height: '100%',
                background:
                  inventoryRatio > 80 ? 'var(--color-warning)' : 'linear-gradient(90deg, var(--color-info), var(--color-positive))',
              }}
            />
          </div>
        </div>

        <MetricRow
          label="Net Position"
          value={`${strategy.inventory >= 0 ? '+' : ''}${strategy.inventory.toFixed(3)} BTC`}
          valueClass={strategy.inventory >= 0 ? 'pos' : 'neg'}
        />
        <MetricRow label="Target Pos" value="0.000 BTC" />
        <MetricRow
          label="Notional Value"
          value={`$${strategy.inventoryValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        />
        <MetricRow
          label="Unrealized P&L"
          value={`${inventoryPnl >= 0 ? '+' : ''}$${inventoryPnl.toFixed(2)}`}
          valueClass={inventoryPnl >= 0 ? 'pos' : 'neg'}
        />
      </div>
    </Panel>
  )
}
