import { Panel } from '../../shared/design-system/Panel'
import { MetricRow } from '../../shared/design-system/MetricRow'

interface OrderFlowPanelProps {
  buyPressure: number
  sellPressure: number
  delta: number
  cumulativeDelta: number
  tradesPerSecond: number
  volumePerSecond: number
  avgTradeSize: number
  medianTradeSize: number
  aggressiveBuyRatio: number
  aggressiveSellRatio: number
  windowSeconds: number
  onWindowChange: (s: number) => void
}

function fmtSigned(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toLocaleString()}`
}

function deltaColor(v: number): string {
  if (v > 0) return 'var(--color-positive)'
  if (v < 0) return 'var(--color-negative)'
  return 'var(--color-text-primary)'
}

const WINDOWS = [10, 30, 60, 300] as const

export function OrderFlowPanel({
  buyPressure,
  sellPressure,
  delta,
  cumulativeDelta,
  tradesPerSecond,
  volumePerSecond,
  avgTradeSize,
  medianTradeSize,
  aggressiveBuyRatio,
  aggressiveSellRatio,
  windowSeconds,
  onWindowChange,
}: OrderFlowPanelProps) {
  const total = buyPressure + sellPressure
  const bidPct = total > 0 ? (buyPressure / total) * 100 : 50
  const askPct = total > 0 ? (sellPressure / total) * 100 : 50

  return (
    <Panel header="Order Flow">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '2px' }}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              style={{
                flex: 1,
                padding: '2px',
                background: w === windowSeconds ? 'var(--color-info)' : 'var(--color-bg-base)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '2px',
                color: w === windowSeconds ? '#fff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              {w}s
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', height: '16px', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${bidPct}%`, background: 'rgba(53,194,110,0.4)' }} />
          <div style={{ width: `${askPct}%`, background: 'rgba(229,83,75,0.4)' }} />
        </div>

        <MetricRow label="Buy Pressure" value={buyPressure.toLocaleString()} color="var(--color-positive)" />
        <MetricRow label="Sell Pressure" value={sellPressure.toLocaleString()} color="var(--color-negative)" />
        <MetricRow label="Delta" value={fmtSigned(delta)} color={deltaColor(delta)} />
        <MetricRow label="Cumulative Delta" value={fmtSigned(cumulativeDelta)} color={deltaColor(cumulativeDelta)} />
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '2px 0' }} />
        <MetricRow label="Trades/sec" value={tradesPerSecond.toFixed(1)} />
        <MetricRow label="Volume/sec" value={volumePerSecond.toLocaleString()} />
        <MetricRow label="Avg Trade Size" value={avgTradeSize.toFixed(2)} />
        <MetricRow label="Median Trade Size" value={medianTradeSize.toFixed(2)} />
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '2px 0' }} />
        <MetricRow label="Aggressive Buy" value={`${(aggressiveBuyRatio * 100).toFixed(1)}%`} color="var(--color-positive)" />
        <MetricRow label="Aggressive Sell" value={`${(aggressiveSellRatio * 100).toFixed(1)}%`} color="var(--color-negative)" />
      </div>
    </Panel>
  )
}
