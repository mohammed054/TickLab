import { Panel } from '../../shared/design-system/Panel'
import { MetricRow } from '../../shared/design-system/MetricRow'
import { StatusDot } from '../../shared/design-system/StatusDot'
import { EmptyState } from '../../shared/design-system/EmptyState'

type StrategyStatus = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR'

interface StrategyMonitorProps {
  strategyName: string | null
  status: StrategyStatus | null
  inventoryQty: number
  inventoryValue: number
  realizedPnl: number
  unrealizedPnl: number
  fees: number
  netPnl: number
  orderCount: number
  fillCount: number
  cancelledCount: number
  fillRatePct: number
  latencyMs: number | null
}

function pnlColor(v: number): string {
  if (v > 0) return 'var(--color-positive)'
  if (v < 0) return 'var(--color-negative)'
  return 'var(--color-text-primary)'
}

function fmtPnl(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const STATUS_DOT: Record<StrategyStatus, 'positive' | 'warning' | 'negative' | 'neutral'> = {
  RUNNING: 'positive',
  PAUSED: 'warning',
  STOPPED: 'neutral',
  ERROR: 'negative',
}

export function StrategyMonitorPanel({
  strategyName,
  status,
  inventoryQty,
  inventoryValue,
  realizedPnl,
  unrealizedPnl,
  fees,
  netPnl,
  orderCount,
  fillCount,
  cancelledCount,
  fillRatePct,
  latencyMs,
}: StrategyMonitorProps) {
  if (!strategyName || !status) {
    return (
      <Panel header="Strategy Monitor">
        <EmptyState
          message="NO STRATEGY LOADED"
          actions={[
            { label: 'CREATE STRATEGY', onClick: () => {} },
            { label: 'OPEN EXPERIMENT', onClick: () => {} },
          ]}
        />
      </Panel>
    )
  }

  return (
    <Panel header="Strategy Monitor">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {strategyName}
          </span>
          <StatusDot status={STATUS_DOT[status]} />
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{status}</span>
        </div>
        <MetricRow label="Inventory" value={`${inventoryQty} BTC`} />
        <MetricRow label="Inventory Value" value={`$${inventoryValue.toLocaleString()}`} />
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
        <MetricRow label="Realized P&L" value={fmtPnl(realizedPnl)} color={pnlColor(realizedPnl)} />
        <MetricRow label="Unrealized P&L" value={fmtPnl(unrealizedPnl)} color={pnlColor(unrealizedPnl)} />
        <MetricRow label="Fees" value={`-$${Math.abs(fees).toFixed(2)}`} />
        <MetricRow label="NET P&L" value={fmtPnl(netPnl)} color={pnlColor(netPnl)} />
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
        <MetricRow label="Orders" value={orderCount} />
        <MetricRow label="Fills" value={fillCount} />
        <MetricRow label="Cancelled" value={cancelledCount} />
        <MetricRow label="Fill Rate" value={`${fillRatePct.toFixed(1)}%`} />
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
        <MetricRow label="Latency" value={latencyMs != null ? `${latencyMs}ms` : '—'} />
      </div>
    </Panel>
  )
}
