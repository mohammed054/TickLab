import { BacktestResult } from '../../contracts'
import { buildAttribution } from '../../analytics/deriveAnalytics'
import { Panel, MetricRow } from '../shared/Panel'

function EquitySpark({ netPnl }: { netPnl: number }) {
  const points = Array.from({ length: 60 }, (_, index) => {
    const progress = index / 59
    return netPnl * progress + Math.sin(index / 4) * Math.max(1, Math.abs(netPnl) * 0.03)
  })
  const min = Math.min(...points)
  const max = Math.max(...points)
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${(index / (points.length - 1)) * 100} ${100 - ((point - min) / (max - min || 1)) * 100}`).join(' ')
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Mock equity curve" style={{ width: '100%', height: 120 }} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={netPnl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function ResultsPanel({ result }: { result: BacktestResult | null }) {
  if (!result) {
    return (
      <Panel title="RESULTS (MOCK)">
        <div className="dim">No backtest result selected. Run a backtest or open an experiment.</div>
      </Panel>
    )
  }

  const headline = result.headline
  const attribution = buildAttribution(result)
  const residual = attribution.find((item) => item.id === 'other')?.value ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="EQUITY CURVE (MOCK)">
        <EquitySpark netPnl={headline.netPnl} />
      </Panel>
      <Panel title="RESULTS SUMMARY (MOCK)">
        <MetricRow label="Initial capital" value={`$${headline.initialCapital.toLocaleString()}`} />
        <MetricRow label="Final capital" value={`$${headline.finalCapital.toLocaleString()}`} />
        <MetricRow label="Net P&L" value={`${headline.netPnl >= 0 ? '+' : ''}$${headline.netPnl.toFixed(2)}`} valueClass={headline.netPnl >= 0 ? 'pos' : 'neg'} />
        <MetricRow label="Return" value={`${headline.returnPct >= 0 ? '+' : ''}${headline.returnPct}%`} valueClass={headline.returnPct >= 0 ? 'pos' : 'neg'} />
        <MetricRow label="Max drawdown" value={`${headline.maxDrawdownPct}%`} valueClass="neg" />
        <MetricRow label="Sharpe / Sortino" value={`${headline.sharpe} / ${headline.sortino}`} />
        <MetricRow label="Trades" value={headline.trades.toLocaleString()} />
        <MetricRow label="Fill rate" value={`${headline.fillRatePct}%`} />
        <MetricRow label="Fees / Slippage" value={`$${headline.fees} / $${headline.slippage}`} />
      </Panel>
      <Panel title="P&L ATTRIBUTION (MOCK)">
        {attribution.filter((item) => item.id !== 'other').map((item) => <MetricRow key={item.id} label={item.label} value={`${item.value >= 0 ? '+' : ''}$${item.value.toFixed(0)}`} valueClass={item.value >= 0 ? 'pos' : 'neg'} />)}
        <MetricRow label="Other / residual" value={`${residual >= 0 ? '+' : ''}$${residual.toFixed(0)}`} valueClass={Math.abs(residual) > 1 ? 'warn' : residual >= 0 ? 'pos' : 'neg'} />
      </Panel>
    </div>
  )
}
