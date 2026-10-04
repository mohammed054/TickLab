import { useEffect, useState } from 'react'
import {
  formatManifestDate,
  formatTradeCount,
  listBinanceTradeDatasets,
  type BinanceTradeDataset,
} from './binanceDataApi'

export function BacktestPanel({ apiAvailable, selectedDatasetId, onOpenData }: { apiAvailable: boolean; selectedDatasetId: string; onOpenData: () => void }) {
  const [dataset, setDataset] = useState<BinanceTradeDataset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!apiAvailable) {
      setLoading(false)
      setError('Data service is offline. Start the backend data service, then retry.')
      setDataset(null)
      return () => { active = false }
    }
    setLoading(true)
    void listBinanceTradeDatasets().then((datasets) => {
      if (!active) return
      setDataset(datasets.find((item) => item.dataset_id === selectedDatasetId) ?? null)
      setError('')
    }).catch((reason: unknown) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : 'Could not verify the selected dataset.')
      setDataset(null)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [apiAvailable, selectedDatasetId])

  return (
    <div className="backtest-workspace">
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">STEP 02 <span /> ENGINE COMPATIBILITY GATE</div>
          <h2>Backtest readiness</h2>
          <p>Runs become available only when the source data supports the engine’s execution model.</p>
        </div>
        <span className="blocked-badge"><span aria-hidden="true">■</span> CURRENTLY UNAVAILABLE</span>
      </div>

      {loading ? (
        <div className="surface-card backtest-loading" role="status"><span className="loading-mark" aria-hidden="true" />Verifying selected dataset manifest…</div>
      ) : error ? (
        <div className="surface-card backtest-error" role="alert"><strong>Dataset verification failed</strong><p>{error}</p><button className="secondary-action" type="button" onClick={onOpenData}>RETURN TO DATASETS</button></div>
      ) : !dataset ? (
        <div className="surface-card backtest-empty">
          <div className="empty-icon" aria-hidden="true">↗</div>
          <span className="section-kicker">NO DATASET SELECTED</span>
          <h3>Import verified trades to review the gate</h3>
          <p>The selected dataset’s coverage and execution-data requirements will appear here. Trade-only data will not enable an order-fill run.</p>
          <button className="secondary-action" type="button" onClick={onOpenData}>OPEN DATASETS <span aria-hidden="true">→</span></button>
        </div>
      ) : (
        <>
          <section className="surface-card selected-dataset-summary" aria-labelledby="selected-dataset-title">
            <div className="surface-card__header"><div><span className="section-kicker">SELECTED REAL DATASET</span><h3 id="selected-dataset-title">{dataset.symbol} <span className="summary-market">USDⓈ-M PERPETUAL</span></h3></div><span className="fidelity-badge"><span aria-hidden="true">●</span> {dataset.data_fidelity}</span></div>
            <div className="summary-metrics">
              <div><span>UTC coverage</span><strong>{formatManifestDate(dataset.coverage_start_ns)} <i>→</i> {formatManifestDate(dataset.coverage_end_ns)}</strong></div>
              <div><span>Trade events</span><strong className="mono">{formatTradeCount(dataset.row_count)}</strong></div>
              <div><span>Historical book</span><strong>{dataset.book_depth_available ? 'Available' : 'Not included'}</strong></div>
              <div><span>Source checksum</span><strong className="mono">{dataset.archive_sha256.slice(0, 16)}…</strong></div>
            </div>
          </section>

          <section className="surface-card execution-gate" aria-labelledby="execution-gate-title">
            <div className="execution-gate__heading">
              <span className="gate-symbol" aria-hidden="true">!</span>
              <div><span className="section-kicker">HONEST EXECUTION FIDELITY</span><h3 id="execution-gate-title">Trade data cannot model order fills</h3></div>
            </div>
            <p className="execution-gate__intro">This archive records executed trades only. It contains no historical bid/ask book, resting liquidity, or queue position. hftbacktest’s exchange and queue fill models consume market depth, so enabling a run here would require inventing execution state.</p>

            <div className="gate-requirements">
              <div className="gate-requirement">
                <span className="gate-requirement__state" aria-label="Not satisfied">01</span>
                <div><strong>Obtain compatible historical L2 depth</strong><p>Binance historical depth products are access-controlled. Tick-by-tick `T_DEPTH` or another compatible source is required. Public `bookDepth` percentage summaries do not qualify.</p><a href="https://github.com/binance/binance-public-data/tree/master/Futures_Order_Book_Download" target="_blank" rel="noreferrer">Read Binance’s historical depth guide <span aria-hidden="true">↗</span></a></div>
              </div>
              <div className="gate-requirement">
                <span className="gate-requirement__state" aria-label="Not satisfied">02</span>
                <div><strong>Validate the depth adapter against hftbacktest</strong><p>The source must reconstruct a valid book and pass the vendored engine’s fixture and fill-behavior checks before any strategy can run.</p></div>
              </div>
            </div>

            <div className="engine-state-row"><span className="engine-state-row__dot" aria-hidden="true" /><span>Engine run status</span><strong>BLOCKED — REAL DEPTH ADAPTER NOT AVAILABLE</strong></div>
            <button className="blocked-action" type="button" disabled aria-disabled="true">RUN BACKTEST <span aria-hidden="true">↗</span></button>
            <p className="blocked-action-hint">Run controls are disabled until both requirements above are verified.</p>
          </section>
        </>
      )}
    </div>
  )
}
