import { MockBacktestResult } from '../../mock/mockData'
import { Panel, MetricRow } from '../shared/Panel'
import { useMemo } from 'react'

function EquitySpark({ finalReturn }: { finalReturn: number }) {
  const points = useMemo(() => {
    const n = 60
    let v = 0
    const arr: number[] = []
    for (let i = 0; i < n; i++) {
      v += (finalReturn / n) + (Math.random() - 0.5) * (Math.abs(finalReturn) / 6 + 1)
      arr.push(v)
    }
    return arr
  }, [finalReturn])
  const min = Math.min(...points)
  const max = Math.max(...points)
  const w = 100
  const h = 100
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i / (points.length - 1)) * w} ${h - ((p - min) / (max - min || 1)) * h}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 120 }} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={finalReturn >= 0 ? '#3ecf8e' : '#ef5b5b'} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function ResultsPanel({ result }: { result: MockBacktestResult | null }) {
  if (!result) {
    return (
      <Panel title="RESULTS (MOCK)">
        <div className="dim">No backtest result yet. Run a backtest from the Backtest tab.</div>
      </Panel>
    )
  }

  const attribution = [
    ['Gross trading P&L', result.netPnl + result.fees + result.slippage],
    ['Fees', -result.fees],
    ['Slippage', -result.slippage],
    ['Adverse selection', -(result.slippage * 0.6)],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="EQUITY CURVE (MOCK)">
        <EquitySpark finalReturn={result.returnPct} />
      </Panel>
      <Panel title="RESULTS SUMMARY (MOCK)">
        <MetricRow label="Initial capital" value={`$${result.initialCapital.toLocaleString()}`} />
        <MetricRow label="Final capital" value={`$${result.finalCapital.toLocaleString()}`} />
        <MetricRow label="Net P&L" value={`${result.netPnl >= 0 ? '+' : ''}$${result.netPnl}`} valueClass={result.netPnl >= 0 ? 'pos' : 'neg'} />
        <MetricRow label="Return" value={`${result.returnPct >= 0 ? '+' : ''}${result.returnPct}%`} valueClass={result.returnPct >= 0 ? 'pos' : 'neg'} />
        <MetricRow label="Max drawdown" value={`${result.maxDrawdownPct}%`} valueClass="neg" />
        <MetricRow label="Sharpe / Sortino" value={`${result.sharpe} / ${result.sortino}`} />
        <MetricRow label="Trades" value={result.trades.toLocaleString()} />
        <MetricRow label="Fill rate" value={`${result.fillRate}%`} />
        <MetricRow label="Fees / Slippage" value={`$${result.fees} / $${result.slippage}`} />
      </Panel>
      <Panel title="P&L ATTRIBUTION (MOCK)">
        {attribution.map(([k, v]) => (
          <MetricRow key={k as string} label={k as string} value={`${(v as number) >= 0 ? '+' : ''}$${(v as number).toFixed(0)}`} valueClass={(v as number) >= 0 ? 'pos' : 'neg'} />
        ))}
      </Panel>
    </div>
  )
}
