import { StrategyState } from '../../contracts'
import { MetricRow, Panel, StatusDot } from '../shared/Panel'

export function StrategyMonitorPanel({ s }: { s: StrategyState }) {
  const net = s.realizedPnl + s.unrealizedPnl + s.fees
  return (
    <Panel
      title="STRATEGY TELEMETRY"
      style={{ flex: '0 0 220px', height: '100%' }}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <StatusDot state="ok" pulse />
          <span className="mono" style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-positive)' }}>
            {s.status.toUpperCase()}
          </span>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <MetricRow label="Strategy" value={s.name} />
        <MetricRow
          label="Inventory"
          value={`${s.inventory >= 0 ? '+' : ''}${s.inventory} BTC`}
          valueClass={s.inventory >= 0 ? 'pos' : 'neg'}
        />
        <MetricRow label="Realized P&L" value={`+$${s.realizedPnl.toFixed(2)}`} valueClass="pos" />
        <MetricRow
          label="Unrealized P&L"
          value={`${s.unrealizedPnl >= 0 ? '+' : ''}$${s.unrealizedPnl.toFixed(2)}`}
          valueClass={s.unrealizedPnl >= 0 ? 'pos' : 'neg'}
        />
        <MetricRow label="Est. Fees" value={`-$${Math.abs(s.fees).toFixed(2)}`} valueClass="neg" />
        <MetricRow
          label="NET TOTAL P&L"
          value={`${net >= 0 ? '+' : ''}$${net.toFixed(2)}`}
          valueClass={net >= 0 ? 'pos' : 'neg'}
        />
        <MetricRow label="Fill Rate" value={`${s.fillRate.toFixed(1)}%`} />
        <MetricRow label="Decision Latency" value={`${s.latencyMs.toFixed(1)}ms`} />
      </div>
    </Panel>
  )
}
