import { Panel, StatusDot } from '../shared/Panel'

export function MarketRegimePanel() {
  const labels = ['LOW_VOLATILITY', 'NORMAL_VOLATILITY', 'HIGH_VOLATILITY', 'EXTREME_VOLATILITY']
  const regimes = ['HIGH_LIQUIDITY', 'LOW_LIQUIDITY', 'TREND_LIKE', 'MEAN_REVERTING', 'UNSTABLE']

  return (
    <Panel title="MARKET REGIME">
      <StatusDot state="ok" />
      <span className="mono">NORMAL_VOLATILITY HIGH_LIQUIDITY</span>
      <div style={{ fontSize: 9, opacity: 0.7, marginTop: 4 }}>
        statistical classification
      </div>
    </Panel>
  )
}