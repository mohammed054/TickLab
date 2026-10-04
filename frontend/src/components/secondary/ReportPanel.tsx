import { useState } from 'react'
import { BacktestResult } from '../../contracts'
import { mockRuntime } from '../../mock/runtime/runtime'
import { saveTextFile } from '../../platform/nativeBridge'
import { EmptyState } from '../../shared/design-system/primitives'
import { Panel } from '../shared/Panel'

function buildReportText(result: BacktestResult): string {
  const headline = result.headline
  return `================================================================================
BTC QUANT WORKSTATION — QUANTITATIVE STRATEGY PERFORMANCE REPORT
Generated: ${new Date(mockRuntime.clock.nowMs()).toISOString()}
================================================================================

EXPERIMENT CONTEXT:
  Experiment ID:      ${result.experimentId}
  HFT Engine Core:    ${result.engineVersion}
  Asset & Market:     BTCUSDT (Perpetual Futures)
  Simulation Period:  2024-08-08T00:00:00.000Z -> 2024-08-09T00:00:00.000Z

EXECUTION & MICROSTRUCTURE ASSUMPTIONS:
  Maker Fee:          -0.0050% (5 bps rebate)
  Taker Fee:           0.0200% (20 bps fee)
  Hardware Latency:   200μs (Empirical high-frequency distribution)
  Queue Dynamics:     Power Law (Alpha=2.0)
  Partial Fills:      Enabled

PERFORMANCE SCORECARD:
  Initial Capital:    $${headline.initialCapital.toLocaleString()}
  Final Capital:      $${headline.finalCapital.toLocaleString()}
  Net Realized P&L:   $${headline.netPnl.toLocaleString()}
  Return on Capital:  ${headline.returnPct >= 0 ? '+' : ''}${headline.returnPct.toFixed(2)}%
  Maximum Drawdown:   ${headline.maxDrawdownPct.toFixed(2)}%
  Sharpe Ratio:       ${headline.sharpe.toFixed(2)}
  Sortino Ratio:      ${headline.sortino.toFixed(2)}

TRADE EXECUTION STATISTICS:
  Total Executions:   ${headline.trades.toLocaleString()}
  Passive Fill Rate:  ${headline.fillRatePct.toFixed(1)}%
  Cumulative Fees:    $${headline.fees.toLocaleString()}
  Modeled Slippage:   $${headline.slippage.toLocaleString()}

DATA REPOSITORY REFERENCES:
  Telemetry Series:   ${result.recorderSeriesRef}
  L3 Event Stream:    ${result.fineGrainedEventsRef}
================================================================================
`
}

export function ReportPanel({ result }: { result: BacktestResult | null }) {
  const [exportStatus, setExportStatus] = useState('')

  async function download(format: 'txt' | 'json' | 'csv') {
    if (!result) return
    const text = format === 'json' ? JSON.stringify(result, null, 2) : format === 'csv' ? buildCsv(result) : buildReportText(result)
    const suggestedName = `${result.experimentId}-performance-report.${format}`
    try {
      const nativeResult = await saveTextFile(text, suggestedName, format)
      setExportStatus(nativeResult === 'saved' ? `Saved ${suggestedName}.` : 'Export cancelled.')
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Could not save the report.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="EXECUTIVE REPORT GENERATOR">
        <p className="dim" style={{ fontSize: 'var(--font-size-xs)', marginTop: 0 }}>
          Export comprehensive institutional performance reports, structured JSON metadata, or CSV metrics.
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          <button type="button" disabled={!result} onClick={() => { void download('txt') }} style={exportStyle}>
            EXPORT REPORT (.TXT)
          </button>
          <button type="button" disabled={!result} onClick={() => { void download('json') }} style={exportStyle}>
            EXPORT TEAR-SHEET (.JSON)
          </button>
          <button type="button" disabled={!result} onClick={() => { void download('csv') }} style={exportStyle}>
            EXPORT HEADLINE METRICS (.CSV)
          </button>
        </div>
        {exportStatus && (
          <div role="status" style={{ marginTop: 6, color: 'var(--color-focus)', fontSize: 'var(--font-size-2xs)' }} className="mono">
            {exportStatus}
          </div>
        )}
      </Panel>

      <Panel title="REPORT PREVIEW" bodyStyle={{ padding: 0 }} style={{ flex: '1 1 auto', minHeight: 0 }}>
        {result ? (
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: 12,
              fontSize: '11px',
              whiteSpace: 'pre-wrap',
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg-base)',
              height: '100%',
              overflow: 'auto',
            }}
          >
            {buildReportText(result)}
          </pre>
        ) : (
          <EmptyState
            icon="📄"
            title="NO EXPERIMENT SELECTED"
            description="Select a completed experiment to generate an executive quant report."
          />
        )}
      </Panel>
    </div>
  )
}

function buildCsv(result: BacktestResult): string {
  const headline = result.headline
  return [
    'metric,value',
    `initial_capital,${headline.initialCapital}`,
    `final_capital,${headline.finalCapital}`,
    `net_pnl,${headline.netPnl}`,
    `return_pct,${headline.returnPct}`,
    `max_drawdown_pct,${headline.maxDrawdownPct}`,
    `sharpe,${headline.sharpe}`,
    `sortino,${headline.sortino}`,
    `trades,${headline.trades}`,
    `fill_rate_pct,${headline.fillRatePct}`,
    `fees,${headline.fees}`,
    `slippage,${headline.slippage}`,
  ].join('\n')
}

const exportStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--color-info)',
  color: 'var(--color-bg-base)',
  border: 0,
  borderRadius: 'var(--radius-xs)',
  fontWeight: 700,
  fontSize: 'var(--font-size-2xs)',
  cursor: 'pointer',
  letterSpacing: '0.04em',
}
