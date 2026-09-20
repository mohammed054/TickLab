import { Panel } from '../../shared/design-system/Panel'

type VolatilityLabel = 'LOW_VOLATILITY' | 'NORMAL_VOLATILITY' | 'HIGH_VOLATILITY' | 'EXTREME_VOLATILITY'
type LiquidityLabel = 'HIGH_LIQUIDITY' | 'LOW_LIQUIDITY'
type RegimeLabel = 'TREND_LIKE' | 'MEAN_REVERTING' | 'UNSTABLE'

interface MarketRegimePanelProps {
  volatilityLabel: VolatilityLabel
  liquidityLabel: LiquidityLabel
  regimeLabel: RegimeLabel
  confidence: number
}

function labelColor(label: string): string {
  if (label.includes('EXTREME')) return 'var(--color-negative)'
  if (label.includes('HIGH_VOLATILITY') || label.includes('LOW_LIQUIDITY')) return 'var(--color-warning)'
  if (label.includes('NORMAL') || label.includes('HIGH_LIQUIDITY')) return 'var(--color-positive)'
  return 'var(--color-text-primary)'
}

export function MarketRegimePanel({ volatilityLabel, liquidityLabel, regimeLabel, confidence }: MarketRegimePanelProps) {
  return (
    <Panel header="Market Regime">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', padding: '4px 0' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="num" style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: labelColor(volatilityLabel) }}>
            {volatilityLabel.replace(/_/g, ' ')}
          </div>
          <div className="num" style={{ fontSize: 'var(--font-size-sm)', color: labelColor(liquidityLabel) }}>
            {liquidityLabel.replace(/_/g, ' ')}
          </div>
          <div className="num" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
            {regimeLabel.replace(/_/g, ' ')}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Confidence</div>
          <div className="num" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {confidence.toFixed(0)}%
          </div>
        </div>
        <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)', textAlign: 'center', fontStyle: 'italic' }}>
          statistical classification — not a prediction
        </div>
      </div>
    </Panel>
  )
}
