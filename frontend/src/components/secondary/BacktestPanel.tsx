import { useEffect, useState } from 'react'
import { BacktestJob, BacktestRequest, timestampNsToMs } from '../../contracts'
import { createDefaultBacktestRequest, mockWorkbench } from '../../mock/workbench'
import {
  canRunBacktest,
  formatBytes,
  formatCount,
  getBacktestBlockers,
  mockDatasetStore,
  useMockDatasetStore,
} from '../../mock/datasets/datasetCatalog'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'
import { useStrategyParameters } from '../../state/parameterStore'
import { MetricRow, NumericField, Panel, SelectField } from '../shared/Panel'
import { ErrorState, LoadingState } from '../../shared/design-system/primitives'

const LATENCY_MODELS = [
  { value: 'zero-latency', label: 'Zero Latency (Theoretical Ideal)' },
  { value: 'fixed-5ms', label: 'Fixed 5ms (Colocated Fiber)' },
  { value: 'empirical-20ms', label: 'Empirical 20ms Jitter (Binance Tokyo)' },
  { value: 'lognormal-hft', label: 'Lognormal HFT Distribution (Sub-ms)' },
]

const QUEUE_MODELS = [
  { value: 'power-2.0', label: 'Power-Law Priority (HFT Standard α=2.0)' },
  { value: 'fifo', label: 'Strict FIFO Queue (Time Priority)' },
  { value: 'pro-rata', label: 'Pro-Rata Size Priority' },
  { value: 'conservative', label: 'Pessimistic Last-in-Queue' },
]

export function BacktestPanel() {
  const { jobs } = useWorkbench()
  const [workspace, updateWorkspace] = useWorkspace()
  const datasetStore = useMockDatasetStore()
  const [parameters] = useStrategyParameters()

  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(() => workspace.dataset?.id ?? datasetStore.records[0]?.id ?? 'mock-dataset-btcusdt-2024-08-08')
  const activeDataset = datasetStore.records.find((r) => r.id === selectedDatasetId) ?? datasetStore.records[0]

  const canRun = activeDataset ? canRunBacktest(activeDataset) : false
  const blockers = activeDataset ? getBacktestBlockers(activeDataset) : ['No dataset is selected.']
  
  const [request, setRequest] = useState<BacktestRequest>(() => createDefaultBacktestRequest())
  const [confirming, setConfirming] = useState(false)
  const latestJob = jobs[jobs.length - 1]

  useEffect(() => {
    if (activeDataset) {
      setRequest((current) => ({
        ...current,
        datasetId: activeDataset.id,
        dateRange: {
          start: activeDataset.dateRange.start,
          end: activeDataset.dateRange.end,
        },
      }))
    }
  }, [activeDataset])

  useEffect(() => {
    setRequest((current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        spreadTicks: parameters.spreadTicks,
        orderSize: parameters.orderSize,
        requoteMs: parameters.requoteMs,
        inventoryLimit: parameters.inventoryLimit,
        inventorySkew: parameters.inventorySkew,
      },
      executionModel: {
        ...current.executionModel,
        makerFee: parameters.makerFee,
        takerFee: parameters.takerFee,
        latencyModel: parameters.latencyModel,
        queueModel: parameters.queueModel,
        allowPartialFills: parameters.allowPartialFills,
      },
    }))
  }, [parameters])

  

  const updateRequest = (patch: Partial<BacktestRequest>) => setRequest((current) => ({ ...current, ...patch }))

  const submit = () => {
    if (!canRun) return
    const jobId = mockWorkbench.startBacktest(request)
    const job = mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === jobId)
    if (job) updateWorkspace({ experiment: { id: job.experimentId }, activeTab: { secondaryMonitor: 'backtest' } })
    setConfirming(false)
  }

  const retry = (jobId: string) => {
    const nextJobId = mockWorkbench.retryJob(jobId)
    const nextJob = nextJobId
      ? mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === nextJobId)
      : undefined
    if (nextJob) updateWorkspace({ experiment: { id: nextJob.experimentId }, activeTab: { secondaryMonitor: 'backtest' } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', overflow: 'auto' }}>
      {/* Configuration Card */}
      <Panel title="HFT SIMULATION ENGINE CONFIGURATION">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginBottom: 4 }}>
              TARGET DATASET FOR SIMULATION
            </label>
            <select
              value={selectedDatasetId}
              onChange={(e) => {
                setSelectedDatasetId(e.target.value)
                const rec = datasetStore.records.find((r) => r.id === e.target.value)
                if (rec) {
                  mockDatasetStore.selectSelection(rec.selection)
                }
              }}
              style={{
                width: '100%',
                background: 'var(--bg-0)',
                color: 'var(--text-0)',
                border: '1px solid var(--border-1)',
                borderRadius: 4,
                padding: '6px 8px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {datasetStore.records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || r.id} ({formatCount(r.totalEvents)} evts, {formatBytes(r.quality.fileSizeBytes)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 10.5, color: 'var(--text-2)', marginBottom: 4 }}>
              STRATEGY ALGORITHM
            </label>
            <div style={{ background: 'var(--bg-0)', border: '1px solid var(--border-1)', borderRadius: 4, padding: '6px 8px', fontSize: 11, color: 'var(--color-brand-primary)', fontWeight: 600 }}>
              {workspace.strategy?.id || 'MM_V18 (Avellaneda-Stoikov)'}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <NumericField
            label="Initial Capital"
            value={request.initialCapital}
            min={100}
            max={10_000_000}
            step={100}
            unit="USD"
            onChange={(value) => updateRequest({ initialCapital: value })}
          />
          <NumericField
            label="Deterministic Seed"
            value={request.randomSeed ?? 0}
            min={0}
            max={2_147_483_647}
            step={1}
            onChange={(value) => updateRequest({ randomSeed: value })}
          />
          <NumericField
            label="Monte Carlo Iterations"
            value={request.iterations}
            min={1}
            max={100}
            step={1}
            onChange={(value) => updateRequest({ iterations: value })}
          />
        </div>

        {/* Execution Model Sub-section */}
        <div style={{ background: 'var(--bg-1)', padding: 10, borderRadius: 6, border: '1px solid var(--border-1)', marginTop: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
            PLUGGABLE EXECUTION & QUEUE SIMULATION MODELS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <SelectField
              label="Latency Profile"
              value={request.executionModel.latencyModel}
              options={LATENCY_MODELS}
              onChange={(value) =>
                updateRequest({
                  executionModel: { ...request.executionModel, latencyModel: value },
                })
              }
            />
            <SelectField
              label="Queue Fill Dynamics"
              value={request.executionModel.queueModel}
              options={QUEUE_MODELS}
              onChange={(value) =>
                updateRequest({
                  executionModel: { ...request.executionModel, queueModel: value },
                })
              }
            />
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <MetricRow
            label="Target Time Window"
            value={`${new Date(timestampNsToMs(request.dateRange.start)).toISOString()} → ${new Date(timestampNsToMs(request.dateRange.end)).toISOString()}`}
          />
          <MetricRow
            label="Exchange Fee Schedule"
            value={`Maker: ${request.executionModel.makerFee}% · Taker: ${request.executionModel.takerFee}%`}
          />
          <MetricRow label="Reconstructed L2 Depth Events" value={activeDataset ? formatCount(activeDataset.totalEvents) : '—'} />
        </div>
      </Panel>

      {/* Execution Action Button */}
      {!confirming ? (
        <>
          <button
            type="button"
            disabled={!canRun}
            onClick={() => setConfirming(true)}
            style={{
              padding: '11px 0',
              fontSize: 12,
              fontWeight: 800,
              borderRadius: 4,
              border: 'none',
              background: canRun ? 'var(--color-brand-primary)' : 'var(--bg-2)',
              color: canRun ? '#080a0d' : 'var(--text-2)',
              cursor: canRun ? 'pointer' : 'not-allowed',
              letterSpacing: '0.05em',
              transition: 'all 0.15s ease',
            }}
          >
            {canRun ? '▶ LAUNCH HIGH-FREQUENCY BACKTEST' : 'BACKTEST BLOCKED BY DATA GATE'}
          </button>
          {!canRun &&
            blockers.map((blocker) => (
              <div
                key={blocker}
                role="alert"
                className="dim"
                style={{ color: 'var(--color-negative)', fontSize: 11 }}
              >
                {blocker}
              </div>
            ))}
        </>
      ) : (
        <Panel title="CONFIRM BACKTEST LAUNCH">
          <MetricRow label="Asset Symbol" value={workspace.symbol} />
          <MetricRow label="Active Dataset" value={request.datasetId} />
          <MetricRow label="Allocated Initial Equity" value={`$${request.initialCapital.toLocaleString()}`} />
          <MetricRow label="Events to Reconstruct" value={activeDataset ? formatCount(activeDataset.totalEvents) : '—'} />
          <MetricRow
            label="Simulated Execution Stack"
            value={`${request.executionModel.latencyModel} · ${request.executionModel.queueModel}`}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={submit}
              style={{
                flex: 1,
                padding: '9px 0',
                background: 'var(--color-brand-primary)',
                color: '#080a0d',
                border: 0,
                borderRadius: 4,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              CONFIRM & EXECUTE
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              style={{
                flex: 1,
                padding: '9px 0',
                background: 'var(--bg-2)',
                color: 'var(--text-0)',
                border: '1px solid var(--border-1)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
          </div>
        </Panel>
      )}

      {/* Realtime Live Job Progress */}
      {latestJob && <JobProgress job={latestJob} onRetry={() => retry(latestJob.id)} />}
    </div>
  )
}

function JobProgress({ job, onRetry }: { job: BacktestJob; onRetry: () => void }) {
  const progress = job.progress
  const percent = progress.totalEvents === 0 ? 0 : (progress.eventsProcessed / progress.totalEvents) * 100
  const [, updateWorkspace] = useWorkspace()

  if (progress.status === 'failed') {
    return <ErrorState title="SIMULATION FAILED" message={job.errorMessage ?? 'Backtest job encountered an unrecoverable engine error.'} onRetry={onRetry} />
  }
  if (progress.status === 'cancelled') {
    return (
      <Panel title="BACKTEST CANCELLED">
        <span className="dim" style={{ fontSize: 11 }}>The simulation run was terminated by user.</span>
        <button
          type="button"
          onClick={onRetry}
          style={{
            display: 'block',
            marginTop: 8,
            padding: '5px 12px',
            background: 'var(--bg-2)',
            color: 'var(--text-0)',
            border: '1px solid var(--border-1)',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          RESTART SIMULATION
        </button>
      </Panel>
    )
  }
  if (progress.status === 'complete') {
    return (
      <Panel
        title="SIMULATION RUN COMPLETED SUCCESSFULLY"
        right={
          <button
            type="button"
            onClick={() => updateWorkspace({ activeTab: { secondaryMonitor: 'results' } })}
            style={{
              background: 'var(--color-brand-primary)',
              color: '#080a0d',
              border: 'none',
              borderRadius: 3,
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            VIEW RESULTS TEARSHEET →
          </button>
        }
      >
        <MetricRow label="Experiment Reference" value={job.experimentId} />
        <MetricRow label="Total Events Processed" value={progress.totalEvents.toLocaleString()} />
        <MetricRow label="Fills Simulated" value={progress.fills.toLocaleString()} />
        <MetricRow label="Status" value="Analysis Ready across all 14 Tear-Sheets" valueClass="pos" />
      </Panel>
    )
  }
  return (
    <Panel title="REALTIME SIMULATION TELEMETRY">
      <LoadingState
        label={`${progress.status.toUpperCase()} · ${progress.eventsProcessed.toLocaleString()} / ${progress.totalEvents.toLocaleString()} events`}
        progress={percent}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
        <MetricRow label="Completion" value={`${percent.toFixed(1)}%`} />
        <MetricRow label="Throughput" value={`${progress.eventsPerSec.toLocaleString()} events/sec`} />
        <MetricRow label="Orders Evaluated" value={progress.ordersSubmitted.toLocaleString()} />
        <MetricRow label="Fills Simulated" value={progress.fills.toLocaleString()} />
      </div>
      <button
        type="button"
        onClick={() => mockWorkbench.cancelJob(job.id)}
        style={{
          marginTop: 10,
          width: '100%',
          padding: '6px 0',
          background: 'rgba(244, 63, 94, 0.1)',
          color: 'var(--color-negative)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: 4,
          fontWeight: 600,
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        CANCEL SIMULATION RUN
      </button>
    </Panel>
  )
}
