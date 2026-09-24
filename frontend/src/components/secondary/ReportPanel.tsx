import { useState } from 'react'
import { BacktestResult } from '../../contracts'
import { mockRuntime } from '../../mock/runtime/runtime'
import { saveTextFile } from '../../platform/nativeBridge'
import { EmptyState } from '../../shared/design-system/primitives'
import { Panel } from '../shared/Panel'

function buildReportText(result: BacktestResult): string {
  const headline = result.headline
  return `BTC QUANT WORKSTATION — EXPERIMENT REPORT (MOCK DATA)
Generated ${new Date(mockRuntime.clock.nowMs()).toISOString()}

*** ALL FIGURES BELOW ARE SIMULATED. NO REAL BACKTEST WAS RUN. ***

Experiment: ${result.experimentId}
Engine: ${result.engineVersion}
Dataset: BTCUSDT 2024-08-08 -> 2024-08-09 (mock)

Execution assumptions (mock):
  Maker fee: -0.005%   Taker fee: 0.020%
  Latency: 20ms empirical   Queue model: Power(2.0)

Performance (mock):
  Initial capital: $${headline.initialCapital}
  Final capital:   $${headline.finalCapital}
  Net P&L:         $${headline.netPnl}
  Return:          ${headline.returnPct}%
  Max drawdown:    ${headline.maxDrawdownPct}%
  Sharpe / Sortino: ${headline.sharpe} / ${headline.sortino}

Trade statistics (mock):
  Trades: ${headline.trades}
  Fill rate: ${headline.fillRatePct}%
  Fees: $${headline.fees}
  Slippage: $${headline.slippage}

Recorder: ${result.recorderSeriesRef}
Events: ${result.fineGrainedEventsRef}
`
}

export function ReportPanel({ result }: { result: BacktestResult | null }) {
  const [exportStatus, setExportStatus] = useState('')

  async function download(format: 'txt' | 'json' | 'csv') {
    if (!result) return
    const text = format === 'json' ? JSON.stringify(result, null, 2) : format === 'csv' ? buildCsv(result) : buildReportText(result)
    const suggestedName = `${result.experimentId}-mock-report.${format}`
    const nativeResult = await saveTextFile(text, suggestedName, format)
    if (nativeResult === 'saved') {
      setExportStatus(`Saved ${suggestedName} through the native export dialog.`)
      return
    }
    if (nativeResult === 'cancelled') {
      setExportStatus('Export cancelled.')
      return
    }
    downloadInBrowser(text, suggestedName, format)
    setExportStatus(`Downloaded ${suggestedName} through the browser fallback.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="REPORT BUILDER (MOCK)">
        <p className="dim" style={{ fontSize: 10.5, marginTop: 0 }}>Generates a report and export package from the selected experiment result.</p>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}><button type="button" disabled={!result} onClick={() => { void download('txt') }} style={exportStyle}>REPORT .TXT</button><button type="button" disabled={!result} onClick={() => { void download('json') }} style={exportStyle}>RESULT .JSON</button><button type="button" disabled={!result} onClick={() => { void download('csv') }} style={exportStyle}>HEADLINE .CSV</button></div>
        {exportStatus && <div role="status" style={{ marginTop: 6, color: 'var(--color-text-tertiary)', fontSize: 10 }}>{exportStatus}</div>}
      </Panel>
      <Panel title="PREVIEW" bodyStyle={{ padding: 0 }}>
        {result ? <pre className="mono" style={{ margin: 0, padding: 10, fontSize: 10.5, whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)' }}>{buildReportText(result)}</pre> : <EmptyState title="NO EXPERIMENT SELECTED" description="Select a completed experiment before generating a report." />}
      </Panel>
    </div>
  )
}

function downloadInBrowser(text: string, suggestedName: string, format: 'txt' | 'json' | 'csv'): void {
  const mime = format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/plain'
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = suggestedName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function buildCsv(result: BacktestResult): string {
  const headline = result.headline
  return ['metric,value', `initial_capital,${headline.initialCapital}`, `final_capital,${headline.finalCapital}`, `net_pnl,${headline.netPnl}`, `return_pct,${headline.returnPct}`, `max_drawdown_pct,${headline.maxDrawdownPct}`, `sharpe,${headline.sharpe}`, `sortino,${headline.sortino}`, `trades,${headline.trades}`, `fill_rate_pct,${headline.fillRatePct}`, `fees,${headline.fees}`, `slippage,${headline.slippage}`].join('\n')
}

const exportStyle: React.CSSProperties = { padding: '7px 10px', background: 'var(--color-info)', color: 'var(--color-bg-base)', border: 0, borderRadius: 'var(--radius-sm)', fontWeight: 700, fontSize: 10 }
