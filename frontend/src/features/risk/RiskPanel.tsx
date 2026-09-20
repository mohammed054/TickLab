import { Panel } from '../../shared/design-system/Panel'
import { MetricRow } from '../../shared/design-system/MetricRow'

interface RiskPanelProps {
  currentExposure: number
  maxExposure: number
  dailyPnl: number
  drawdownCurrent: number
  drawdownMax: number
  dailyLoss: number
  maxPosition: number
  openOrdersCount: number
  potentialExecutionRisk: number
  marginUsage: number | null
  liquidationDistance: number | null
}

function pnlColor(v: number): string {
  if (v > 0) return 'var(--color-positive)'
  if (v < 0) return 'var(--color-negative)'
  return 'var(--color-text-primary)'
}

function warnColor(current: number, limit: number): string | undefined {
  if (limit <= 0) return undefined
  const ratio = Math.abs(current) / limit
  if (ratio >= 1) return 'var(--color-negative)'
  if (ratio >= 0.8) return 'var(--color-warning)'
  return undefined
}

export function RiskPanel({
  currentExposure,
  maxExposure,
  dailyPnl,
  drawdownCurrent,
  drawdownMax,
  dailyLoss,
  maxPosition,
  openOrdersCount,
  potentialExecutionRisk,
  marginUsage,
  liquidationDistance,
}: RiskPanelProps) {
  return (
    <Panel header="Risk">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <MetricRow label="Exposure" value={`$${currentExposure.toLocaleString()}`} color={warnColor(currentExposure, maxExposure)} />
        <MetricRow label="Max Exposure" value={`$${maxExposure.toLocaleString()}`} />
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
        <MetricRow label="Daily P&L" value={`$${dailyPnl.toFixed(2)}`} color={pnlColor(dailyPnl)} />
        <MetricRow label="Drawdown" value={`$${drawdownCurrent.toFixed(2)}`} color={drawdownCurrent > 0 ? 'var(--color-negative)' : undefined} />
        <MetricRow label="Max Drawdown" value={`$${drawdownMax.toFixed(2)}`} />
        <MetricRow label="Daily Loss" value={`$${dailyLoss.toFixed(2)}`} color={warnColor(dailyLoss, maxExposure * 0.1)} />
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
        <MetricRow label="Max Position" value={`${maxPosition}`} />
        <MetricRow label="Open Orders" value={openOrdersCount} />
        <MetricRow label="Exec Risk" value={`$${potentialExecutionRisk.toLocaleString()}`} />
        {marginUsage != null && (
          <MetricRow label="Margin" value={`${(marginUsage * 100).toFixed(1)}%`} color={warnColor(marginUsage, 1)} />
        )}
        {liquidationDistance != null && (
          <MetricRow label="Liquidation" value={`${liquidationDistance.toFixed(2)}%`} />
        )}
      </div>
    </Panel>
  )
}
