import { Panel } from '../shared/Panel'
import { MockBacktestResult } from '../../mock/mockData'

function buildReportText(result: MockBacktestResult | null): string {
  const r =
    result ??
    ({
      id: 'mock-bt-none',
      strategy: 'MM_V18',
      initialCapital: 10000,
      finalCapital: 10000,
      netPnl: 0,
      returnPct: 0,
      maxDrawdownPct: 0,
      sharpe: 0,
      sortino: 0,
      trades: 0,
      fillRate: 0,
      fees: 0,
      slippage: 0,
    } as MockBacktestResult)

  return `BTC QUANT WORKSTATION — EXPERIMENT REPORT (MOCK DATA)
Generated ${new Date().toISOString()}

*** ALL FIGURES BELOW ARE SIMULATED. NO REAL BACKTEST WAS RUN. ***

Strategy: ${r.strategy}
Dataset: BTCUSDT 2024-08-08 -> 2024-08-09 (mock)

Execution assumptions (mock):
  Maker fee: -0.005%   Taker fee: 0.020%
  Latency: 20ms empirical   Queue model: Power(2.0)

Performance (mock):
  Initial capital: $${r.initialCapital}
  Final capital:   $${r.finalCapital}
  Net P&L:         $${r.netPnl}
  Return:          ${r.returnPct}%
  Max drawdown:    ${r.maxDrawdownPct}%
  Sharpe / Sortino: ${r.sharpe} / ${r.sortino}

Trade statistics (mock):
  Trades: ${r.trades}
  Fill rate: ${r.fillRate}%
  Fees: $${r.fees}
  Slippage: $${r.slippage}

Notes:
  (add research notes here)
`
}

export function ReportPanel({ result }: { result: MockBacktestResult | null }) {
  function download() {
    const text = buildReportText(result)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mock-experiment-report.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="REPORT BUILDER (MOCK)">
        <p className="dim" style={{ fontSize: 10.5, marginTop: 0 }}>
          Generates a plain-text report from currently-loaded (mock) results — strategy, dataset, execution
          assumptions, performance, trade stats. This is a client-side text export only.
        </p>
        <button
          onClick={download}
          style={{ padding: '9px 14px', background: 'var(--accent)', color: '#0d0f12', border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 11.5 }}
        >
          DOWNLOAD MOCK REPORT (.txt)
        </button>
      </Panel>
      <Panel title="PREVIEW" bodyStyle={{ padding: 0 }}>
        <pre className="mono" style={{ margin: 0, padding: 10, fontSize: 10.5, whiteSpace: 'pre-wrap', color: 'var(--text-1)' }}>
          {buildReportText(result)}
        </pre>
      </Panel>
    </div>
  )
}
