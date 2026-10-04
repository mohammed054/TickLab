import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  formatManifestDate,
  formatManifestTimestamp,
  formatMarketName,
  formatTradeCount,
  getBinanceImportJob,
  listBinanceTradeDatasets,
  submitBinanceTradeImport,
  type BinanceImportJob,
  type BinanceTradeDataset,
} from './binanceDataApi'

const JOB_STORAGE_KEY = 'ticklab.binance-trade-import.job'
const FIRST_SUPPORTED_DATE = '2024-01-01'

function latestSelectableDate(): string {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  return yesterday.toISOString().slice(0, 10)
}

export function DatasetPanel({
  apiAvailable,
  selectedDatasetId,
  onDatasetSelect,
  onSelectedMarketChange,
  onOpenBacktest,
}: {
  apiAvailable: boolean
  selectedDatasetId: string
  onDatasetSelect: (datasetId: string) => void
  onSelectedMarketChange: (market: string) => void
  onOpenBacktest: () => void
}) {
  const latestDate = latestSelectableDate()
  const [startDate, setStartDate] = useState(FIRST_SUPPORTED_DATE)
  const [endDate, setEndDate] = useState(FIRST_SUPPORTED_DATE)
  const [datasets, setDatasets] = useState<BinanceTradeDataset[]>([])
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [datasetError, setDatasetError] = useState('')
  const [job, setJob] = useState<BinanceImportJob | null>(null)
  const [jobError, setJobError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmLargeRange, setConfirmLargeRange] = useState(false)
  const [notice, setNotice] = useState('')

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.dataset_id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  )

  useEffect(() => {
    onSelectedMarketChange(selectedDataset?.market ?? '')
  }, [onSelectedMarketChange, selectedDataset?.market])
  const dateError = !startDate || !endDate
    ? 'Choose both a start and end date.'
    : startDate < FIRST_SUPPORTED_DATE || endDate < FIRST_SUPPORTED_DATE
    ? 'Choose a date on or after 1 January 2024.'
    : endDate > latestDate
      ? `Data Vision archives are selected by complete UTC dates. Choose ${latestDate} or earlier.`
      : startDate > endDate
        ? 'The start date must be on or before the end date.'
        : ''
  const jobRunning = job?.status === 'queued' || job?.status === 'running'
  const selectedDayCount = startDate && endDate
    ? Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1
    : 0

  const refreshDatasets = async (showLoading = false) => {
    if (showLoading) setLoadingDatasets(true)
    try {
      const next = await listBinanceTradeDatasets()
      setDatasets(next.sort((a, b) => Number(b.retrieved_at_ns) - Number(a.retrieved_at_ns)))
      setDatasetError('')
      const savedSelection = next.find((item) => item.dataset_id === selectedDatasetId)
      const latestSpot = next.find((item) => item.market === 'BINANCE_SPOT')
      if (!savedSelection || (savedSelection.market !== 'BINANCE_SPOT' && latestSpot)) {
        onDatasetSelect(latestSpot?.dataset_id ?? next[0]?.dataset_id ?? '')
      }
    } catch (error) {
      setDatasetError(error instanceof Error ? error.message : 'Could not load verified datasets.')
    } finally {
      setLoadingDatasets(false)
    }
  }

  useEffect(() => {
    void refreshDatasets(true)
    let restoredJobId = ''
    try {
      restoredJobId = sessionStorage.getItem(JOB_STORAGE_KEY) ?? ''
    } catch {
      // Job restoration is optional when session storage is unavailable.
    }
    if (restoredJobId) {
      void getBinanceImportJob(restoredJobId).then((restored) => {
        setJob(restored)
        if (restored.status === 'complete' || restored.status === 'failed') {
          try { sessionStorage.removeItem(JOB_STORAGE_KEY) } catch { /* optional persistence */ }
        }
      }).catch((error: unknown) => {
        try { sessionStorage.removeItem(JOB_STORAGE_KEY) } catch { /* optional persistence */ }
        const detail = error instanceof Error ? error.message : 'Import status is unavailable.'
        setJobError(`Could not restore the previous import (${detail}). Verified datasets are still available below; submit a new import to continue.`)
      })
    }
  }, [])

  useEffect(() => {
    if (apiAvailable) void refreshDatasets(true)
  }, [apiAvailable])

  useEffect(() => {
    if (!job?.jobId || !jobRunning) return
    let cancelled = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const next = await getBinanceImportJob(job.jobId)
        if (cancelled) return
        setJob(next)
        setJobError('')
        if (next.status === 'complete') {
          try { sessionStorage.removeItem(JOB_STORAGE_KEY) } catch { /* optional persistence */ }
          setNotice(`Import complete. ${next.datasets.length} verified archive${next.datasets.length === 1 ? '' : 's'} added.`)
          await refreshDatasets()
          const orderedParts = [...next.datasets].sort((a, b) => Number(a.coverage_start_ns ?? 0) - Number(b.coverage_start_ns ?? 0))
          const newestPart = orderedParts[orderedParts.length - 1]
          if (newestPart?.dataset_id) onDatasetSelect(newestPart.dataset_id)
          return
        }
        if (next.status === 'failed') {
          try { sessionStorage.removeItem(JOB_STORAGE_KEY) } catch { /* optional persistence */ }
          return
        }
      } catch (error) {
        if (cancelled) return
        setJobError(error instanceof Error ? error.message : 'Import status check failed; retrying.')
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 1000)
    }
    timer = window.setTimeout(() => void poll(), 1000)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [job?.jobId, jobRunning])

  const launchImport = async () => {
    if (dateError || submitting || jobRunning || !apiAvailable) return
    setSubmitting(true)
    setSubmitError('')
    setJobError('')
    setNotice('')
    try {
      const created = await submitBinanceTradeImport(startDate, endDate)
      setJob(created)
      try { sessionStorage.setItem(JOB_STORAGE_KEY, created.jobId) } catch { /* polling continues in this view */ }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'The import request failed.')
    } finally {
      setSubmitting(false)
      setConfirmLargeRange(false)
    }
  }

  const importTrades = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (dateError || submitting || jobRunning || !apiAvailable) return
    if (selectedDayCount > 31 && !confirmLargeRange) {
      setConfirmLargeRange(true)
      return
    }
    void launchImport()
  }

  return (
    <div className="data-workspace">
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">STEP 01 <span /> VERIFIED SOURCE INGESTION</div>
          <h2>Import market data</h2>
          <p>Download original Binance trade archives, verify their checksums, and preserve a reproducible dataset.</p>
        </div>
        <div className="instrument-chip"><span className="instrument-chip__symbol">BTCUSDT</span><span>{selectedDataset ? formatMarketName(selectedDataset.market) : 'NO DATASET SELECTED'}</span></div>
      </div>

      <div className="data-grid">
        <section className="surface-card import-card" aria-labelledby="import-title">
          <div className="surface-card__header">
            <div><span className="section-kicker">BINANCE USDⓈ-M</span><h3 id="import-title">Aggregate trades</h3></div>
            <span className="fidelity-badge"><span aria-hidden="true">●</span> TRADES ONLY</span>
          </div>
          <div className="source-note">
            <span className="source-note__icon" aria-hidden="true">↗</span>
            <p>Public Binance source · checksum verified after download · original ZIP preserved</p>
            <a href="https://github.com/binance/binance-public-data" target="_blank" rel="noreferrer" aria-label="Open Binance public data documentation in a new tab">SOURCE ↗</a>
          </div>

          <form onSubmit={(event) => void importTrades(event)} noValidate>
            <div className="date-range-heading"><span>UTC DATE RANGE</span><span>INCLUSIVE</span></div>
            <div className="date-range-fields">
              <label>
                <span>Start date</span>
                <input type="date" value={startDate} min={FIRST_SUPPORTED_DATE} max={latestDate} disabled={jobRunning} aria-describedby="date-range-hint" aria-invalid={!!dateError} onChange={(event) => { setStartDate(event.target.value); setConfirmLargeRange(false) }} />
              </label>
              <span className="date-range-arrow" aria-hidden="true">→</span>
              <label>
                <span>End date</span>
                <input type="date" value={endDate} min={FIRST_SUPPORTED_DATE} max={latestDate} disabled={jobRunning} aria-describedby="date-range-hint" aria-invalid={!!dateError} onChange={(event) => { setEndDate(event.target.value); setConfirmLargeRange(false) }} />
              </label>
            </div>
            <p className={`form-hint ${dateError ? 'form-hint--error' : ''}`} id="date-range-hint">
              {dateError || `Select completed UTC dates from ${FIRST_SUPPORTED_DATE} through ${latestDate}. Provider archive availability is checked during import.`}
            </p>
            <button className="primary-action" type="submit" disabled={!apiAvailable || !!dateError || submitting || !!jobRunning || confirmLargeRange}>
              <span aria-hidden="true">↓</span>
              {submitting ? 'SUBMITTING IMPORT…' : jobRunning ? 'IMPORT IN PROGRESS' : 'IMPORT BINANCE TRADES'}
            </button>
            {selectedDayCount > 31 && !jobRunning && (
              <div className="large-range-note" role="note">
                <strong>Multi-month import</strong>
                <span>{formatTradeCount(selectedDayCount)} UTC dates selected. Full months use monthly archives; edge dates use daily archives. Raw ZIP files and normalized data are both retained, so this may use substantial local disk space.</span>
              </div>
            )}
            {confirmLargeRange && (
              <div className="large-range-confirm" role="group" aria-label="Confirm large data import">
                <strong>Confirm archive download</strong>
                <p>Import {startDate} through {endDate} UTC ({formatTradeCount(selectedDayCount)} dates)? Check available space under your configured data root before continuing.</p>
                <div><button type="button" onClick={() => setConfirmLargeRange(false)}>CANCEL</button><button type="button" disabled={!apiAvailable} onClick={() => void launchImport()}>CONFIRM IMPORT</button></div>
              </div>
            )}
            {!apiAvailable && <p className="inline-error" role="alert">Data service is offline. Start the backend data service, then retry.</p>}
            {submitError && <p className="inline-error" role="alert">{submitError}</p>}
            {!job && jobError && <p className="inline-error" role="alert">{jobError}</p>}
          </form>

          {job && (
            <div className={`job-card job-card--${job.status}`} role={job.status === 'failed' ? 'alert' : 'status'} aria-live="polite">
              <div className="job-card__top">
                <strong>{job.status === 'complete' ? 'IMPORT COMPLETE' : job.status === 'failed' ? 'IMPORT FAILED' : job.status === 'queued' ? 'IMPORT QUEUED' : 'IMPORTING ARCHIVES'}</strong>
                <span className="job-card__status">{job.status.toUpperCase()}</span>
              </div>
              {(job.status === 'queued' || job.status === 'running') && (
                <>
                  {job.archivesTotal !== undefined && job.archivesCompleted !== undefined ? (
                    <div className="job-progress">
                      <div className="job-progress__label"><span>{job.currentArchive ?? 'Preparing next archive'}</span><span>{job.archivesCompleted} / {job.archivesTotal}</span></div>
                      <div className="job-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={job.archivesTotal} aria-valuenow={job.archivesCompleted}><i style={{ width: `${job.archivesTotal ? Math.min(100, 100 * job.archivesCompleted / job.archivesTotal) : 0}%` }} /></div>
                    </div>
                  ) : <p className="job-card__message">Waiting for the first archive to finish verification.</p>}
                </>
              )}
              {job.status === 'complete' && <p className="job-card__message">{notice || `${job.datasets.length} archive${job.datasets.length === 1 ? '' : 's'} verified and prepared.`}</p>}
              {job.status === 'failed' && <p className="job-card__message">{job.error || 'The archive could not be imported. Review the details and retry.'}</p>}
              {jobError && <p className="job-card__message job-card__message--error">{jobError}</p>}
            </div>
          )}

          <div className="data-fidelity-note">
            <span className="data-fidelity-note__marker" aria-hidden="true">i</span>
            <p>Trades record executed activity. They do not contain historical quotes, resting liquidity, or order queue position. This dataset cannot support realistic order-fill simulation by itself.</p>
          </div>
        </section>

        <section className="surface-card dataset-card" aria-labelledby="datasets-title">
          <div className="surface-card__header">
            <div><span className="section-kicker">LOCAL RESEARCH STORE</span><h3 id="datasets-title">Verified datasets <span className="count-pill">{loadingDatasets ? '…' : datasets.length}</span></h3></div>
            <button className="quiet-action" type="button" onClick={() => void refreshDatasets(true)} disabled={loadingDatasets} aria-label="Refresh verified datasets">↻ <span>Refresh</span></button>
          </div>

          {datasetError && <div className="inline-error dataset-error" role="alert">{datasetError}<button type="button" onClick={() => void refreshDatasets(true)}>Retry</button></div>}
          {loadingDatasets ? (
            <div className="dataset-empty dataset-empty--loading" role="status"><span className="loading-mark" aria-hidden="true" />Loading dataset manifests…</div>
          ) : datasetError ? null : datasets.length === 0 ? (
            <div className="dataset-empty">
              <span className="dataset-empty__glyph" aria-hidden="true">↧</span>
              <strong>No verified datasets yet</strong>
              <p>Choose a UTC date range and import the first Binance archive. The manifest will appear here after checksum and schema validation.</p>
            </div>
          ) : (
            <>
              <div className="dataset-list" role="list" aria-label="Verified Binance trade datasets">
                {datasets.map((dataset) => (
                  <div key={dataset.dataset_id} role="listitem">
                    <button
                      type="button"
                      className={`dataset-row ${selectedDatasetId === dataset.dataset_id ? 'is-selected' : ''}`}
                      aria-pressed={selectedDatasetId === dataset.dataset_id}
                      onClick={() => onDatasetSelect(dataset.dataset_id)}
                    >
                      <span className="dataset-row__icon" aria-hidden="true">◈</span>
                      <span className="dataset-row__main"><strong>{dataset.archive_filename}</strong><small>{formatMarketName(dataset.market)} <i>·</i> {formatManifestDate(dataset.coverage_start_ns)} <i>→</i> {formatManifestDate(dataset.coverage_end_ns)} UTC{dataset.ordering_regressions ? ` · ${dataset.ordering_regressions} order warning(s)` : ''}</small></span>
                      <span className="dataset-row__count mono">{formatTradeCount(dataset.row_count)}<small>TRADES</small></span>
                      <span className="dataset-row__check" aria-hidden="true">{selectedDatasetId === dataset.dataset_id ? '✓' : '›'}</span>
                    </button>
                  </div>
                ))}
              </div>
              {selectedDataset && <ManifestDetails dataset={selectedDataset} onOpenBacktest={onOpenBacktest} />}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function ManifestDetails({ dataset, onOpenBacktest }: { dataset: BinanceTradeDataset; onOpenBacktest: () => void }) {
  return (
    <div className="manifest-details">
      <div className="manifest-details__heading"><div><span className="section-kicker">SELECTED MANIFEST</span><h4>{dataset.symbol} · {dataset.data_fidelity}</h4></div><button className="text-action" type="button" onClick={onOpenBacktest}>VIEW BACKTEST GATE <span aria-hidden="true">→</span></button></div>
      <div className="manifest-grid">
        <ManifestField label="Market" value={dataset.market} />
        <ManifestField label="Source" value={dataset.source} />
        <ManifestField label="Coverage start" value={formatManifestTimestamp(dataset.coverage_start_ns)} />
        <ManifestField label="Coverage end" value={formatManifestTimestamp(dataset.coverage_end_ns)} />
        <ManifestField label="Retrieved at" value={formatManifestTimestamp(dataset.retrieved_at_ns)} />
        <ManifestField label="Accepted events" value={formatTradeCount(dataset.row_count)} />
        <ManifestField label="Source archive" value={dataset.archive_filename} />
        <ManifestField label="Pipeline version" value={dataset.pipeline_version} />
        <ManifestField label="Normalization" value={dataset.normalization_status ?? (dataset.normalized_path ? 'CANONICAL' : 'NOT DECLARED')} />
        <ManifestField label="Source order" value={dataset.source_order_status ?? 'NOT RECORDED'} />
        <ManifestField label="Capabilities" value={dataset.data_capabilities.join(', ')} />
        <ManifestField label="Book depth" value={dataset.book_depth_available ? 'Available' : 'Not present'} />
        <ManifestField label="Historical best quotes" value={dataset.historical_best_quotes_available ? 'Available' : 'Not present'} />
        <ManifestField label="Dataset ID" value={dataset.dataset_id} mono />
        <ManifestField label="SHA-256" value={dataset.archive_sha256} mono />
        <ManifestField label="Source URI" value={dataset.source_uri} mono />
      </div>
      <div className="manifest-source-line"><span className="verified-check" aria-hidden="true">✓</span> Provider checksum verified <span className="manifest-separator">·</span> Raw archive preserved</div>
      {!!dataset.ordering_regressions && (
        <div className="large-range-note" role="note">
          <strong>Provider order warning</strong>
          <span>{formatTradeCount(dataset.ordering_regressions)} source row(s) regress in aggregate ID or time order{dataset.first_ordering_regression_row ? `; first at row ${formatTradeCount(dataset.first_ordering_regression_row)}` : ''}. TickLab preserved the provider CSV without sorting or repairing it.</span>
        </div>
      )}
    </div>
  )
}

function ManifestField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1400)
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <div className="manifest-field">
      <span>{label}</span>
      <div className="manifest-field__value">
        <strong className={mono ? 'mono' : ''} title={value}>{value}</strong>
        {mono && <button type="button" className="manifest-copy" onClick={() => void copyValue()} aria-label={`Copy ${label}`} title={`Copy ${label}`}>{copyState === 'copied' ? 'COPIED' : 'COPY'}</button>}
      </div>
      {copyState === 'failed' && <small className="manifest-copy-error" role="status">Clipboard access unavailable.</small>}
    </div>
  )
}
