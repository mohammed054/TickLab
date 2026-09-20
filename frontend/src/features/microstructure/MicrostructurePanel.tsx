import { Panel } from '../../shared/design-system/Panel'
import { MetricRow } from '../../shared/design-system/MetricRow'

interface MicrostructurePanelProps {
  currentSpreadTicks: number
  currentSpreadBps: number
  rollingAvgSpreadTicks: number
  spreadPercentile: number
  topOfBookDepth: number
  depth5: number
  depth10: number
  depth25: number
  totalVisibleDepth: number
  realizedVolInstant: number | null
  realizedVol1m: number | null
  realizedVol5m: number | null
  realizedVol15m: number | null
  orderFlowImbalance: number
  delta: number
  tradeIntensity: number
  cancellationIntensity: number
  replenishmentRate: number
}

export function MicrostructurePanel({
  currentSpreadTicks,
  currentSpreadBps,
  rollingAvgSpreadTicks,
  spreadPercentile,
  topOfBookDepth,
  depth5,
  depth10,
  depth25,
  totalVisibleDepth,
  realizedVolInstant,
  realizedVol1m,
  realizedVol5m,
  realizedVol15m,
  orderFlowImbalance,
  delta,
  tradeIntensity,
  cancellationIntensity,
  replenishmentRate,
}: MicrostructurePanelProps) {
  const fmt = (v: number | null) => (v != null ? v.toFixed(4) : '—')

  return (
    <Panel header="Microstructure">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-info)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Spread</span>
        <MetricRow label="Current" value={`${currentSpreadTicks.toFixed(1)}t (${currentSpreadBps.toFixed(2)} bps)`} />
        <MetricRow label="Rolling Avg" value={`${rollingAvgSpreadTicks.toFixed(1)}t`} />
        <MetricRow label="Percentile" value={`${spreadPercentile.toFixed(0)}%`} />

        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-info)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Liquidity</span>
        <MetricRow label="Top of Book" value={topOfBookDepth.toLocaleString()} />
        <MetricRow label="5-level" value={depth5.toLocaleString()} />
        <MetricRow label="10-level" value={depth10.toLocaleString()} />
        <MetricRow label="25-level" value={depth25.toLocaleString()} />
        <MetricRow label="Total Visible" value={totalVisibleDepth.toLocaleString()} />

        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-info)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Volatility</span>
        <MetricRow label="Instant" value={fmt(realizedVolInstant)} />
        <MetricRow label="1m" value={fmt(realizedVol1m)} />
        <MetricRow label="5m" value={fmt(realizedVol5m)} />
        <MetricRow label="15m" value={fmt(realizedVol15m)} />

        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-info)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Order Flow</span>
        <MetricRow label="Imbalance" value={orderFlowImbalance.toFixed(3)} />
        <MetricRow label="Delta" value={delta >= 0 ? `+${delta}` : String(delta)} />
        <MetricRow label="Trade Intensity" value={`${tradeIntensity.toFixed(1)}/s`} />
        <MetricRow label="Cancel Intensity" value={`${cancellationIntensity.toFixed(1)}/s`} />
        <MetricRow label="Replenishment" value={`${(replenishmentRate * 100).toFixed(1)}%`} />
      </div>
    </Panel>
  )
}
