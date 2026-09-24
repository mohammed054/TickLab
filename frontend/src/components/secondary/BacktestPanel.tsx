import { useEffect, useState } from 'react'
import { BacktestJob, BacktestRequest, timestampNsToMs } from '../../contracts'
import { createDefaultBacktestRequest, mockWorkbench } from '../../mock/workbench'
import { canRunBacktest, getBacktestBlockers, getSelectedRecord, useMockDatasetStore } from '../../mock/datasets/datasetCatalog'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'
import { useStrategyParameters } from '../../state/parameterStore'
import { MetricRow, NumericField, Panel } from '../shared/Panel'
import { ErrorState, LoadingState } from '../../shared/design-system/primitives'

export function BacktestPanel() {
  const { jobs } = useWorkbench()
  const [workspace, updateWorkspace] = useWorkspace()
  const datasetStore = useMockDatasetStore()
  const [parameters] = useStrategyParameters()
  const activeDataset = getSelectedRecord(datasetStore)
  const canRun = activeDataset ? canRunBacktest(activeDataset) : false
  const blockers = activeDataset ? getBacktestBlockers(activeDataset) : ['No dataset is selected.']
  const [request, setRequest] = useState<BacktestRequest>(() => createDefaultBacktestRequest())
  const [confirming, setConfirming] = useState(false)
  const latestJob = jobs[jobs.length - 1]

  useEffect(() => {
    if (!workspace.dataset) return
    setRequest((current) => ({ ...current, datasetId: workspace.dataset?.id ?? current.datasetId, dateRange: { start: workspace.dataset?.startNs ?? current.dateRange.start, end: workspace.dataset?.endNs ?? current.dateRange.end } }))
  }, [workspace.dataset?.endNs, workspace.dataset?.id, workspace.dataset?.startNs])

  useEffect(() => {
    setRequest((current) => ({
      ...current,
      parameters: { ...current.parameters, spreadTicks: parameters.spreadTicks, orderSize: parameters.orderSize, requoteMs: parameters.requoteMs, inventoryLimit: parameters.inventoryLimit, inventorySkew: parameters.inventorySkew },
      executionModel: { ...current.executionModel, makerFee: parameters.makerFee, takerFee: parameters.takerFee, latencyModel: parameters.latencyModel, queueModel: parameters.queueModel, allowPartialFills: parameters.allowPartialFills },
    }))
  }, [parameters])

  useEffect(() => {
    if (latestJob?.progress.status === 'complete') {
      updateWorkspace({ experiment: { id: latestJob.experimentId }, activeTab: { secondaryMonitor: 'results' } })
    }
  }, [latestJob?.experimentId, latestJob?.progress.status, updateWorkspace])

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
    const nextJob = nextJobId ? mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === nextJobId) : undefined
    if (nextJob) updateWorkspace({ experiment: { id: nextJob.experimentId }, activeTab: { secondaryMonitor: 'backtest' } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="BACKTEST CONFIGURATION (MOCK)">
        <NumericField label="Initial capital" value={request.initialCapital} min={100} max={10_000_000} step={100} unit="USD" onChange={(value) => updateRequest({ initialCapital: value })} />
        <NumericField label="Random seed" value={request.randomSeed ?? 0} min={0} max={2_147_483_647} step={1} onChange={(value) => updateRequest({ randomSeed: value })} />
        <NumericField label="Iterations" value={request.iterations} min={1} max={100} step={1} onChange={(value) => updateRequest({ iterations: value })} />
        <MetricRow label="Dataset" value={`${request.datasetId} · ${timestampNsToMs(request.dateRange.start)}–${timestampNsToMs(request.dateRange.end)}`} />
        <MetricRow label="Maker / Taker fee" value={`${request.executionModel.makerFee}% / ${request.executionModel.takerFee}%`} />
        <MetricRow label="Latency model" value={request.executionModel.latencyModel} />
        <MetricRow label="Queue model" value={request.executionModel.queueModel} />
        <MetricRow label="Events" value={latestJob?.progress.totalEvents.toLocaleString() ?? '48,291,204'} />
      </Panel>

      {!confirming ? (
        <>
          <button type="button" disabled={!canRun} onClick={() => setConfirming(true)} style={{ padding: '12px 0', fontSize: 14, fontWeight: 700, borderRadius: 5, border: '1px solid var(--color-info)', background: canRun ? 'var(--color-info)' : 'var(--color-bg-control)', color: canRun ? 'var(--color-bg-base)' : 'var(--color-text-disabled)' }}>
            {canRun ? '▶ RUN BACKTEST (SIMULATED)' : 'BACKTEST BLOCKED'}
          </button>
          {!canRun && blockers.map((blocker) => <div key={blocker} role="alert" className="dim" style={{ color: 'var(--color-negative)', fontSize: 'var(--font-size-xs)' }}>{blocker}</div>)}
        </>
      ) : (
        <Panel title="CONFIRM BACKTEST">
          <MetricRow label="Symbol" value={workspace.symbol} />
          <MetricRow label="Dataset" value={request.datasetId} />
          <MetricRow label="Capital" value={`$${request.initialCapital.toLocaleString()}`} />
          <MetricRow label="Events" value={activeDataset?.totalEvents.toLocaleString() ?? '—'} />
          <MetricRow label="Execution" value={`${request.executionModel.latencyModel} · ${request.executionModel.queueModel}`} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button type="button" onClick={submit} style={{ flex: 1, padding: '8px', background: 'var(--color-info)', color: 'var(--color-bg-base)', border: 0, borderRadius: 4, fontWeight: 700 }}>CONFIRM RUN</button>
            <button type="button" onClick={() => setConfirming(false)} style={{ flex: 1, padding: '8px', background: 'var(--color-bg-control)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 4 }}>CANCEL</button>
          </div>
        </Panel>
      )}

      {latestJob && <JobProgress job={latestJob} onRetry={() => retry(latestJob.id)} />}
    </div>
  )
}

function JobProgress({ job, onRetry }: { job: BacktestJob; onRetry: () => void }) {
  const progress = job.progress
  const percent = progress.totalEvents === 0 ? 0 : (progress.eventsProcessed / progress.totalEvents) * 100
  if (progress.status === 'failed') {
    return <ErrorState title="BACKTEST FAILED" message={job.errorMessage ?? 'The mock job failed.'} onRetry={onRetry} />
  }
  if (progress.status === 'cancelled') {
    return <Panel title="BACKTEST CANCELLED"><span className="dim">This mock job was cancelled.</span><button type="button" onClick={onRetry} style={{ display: 'block', marginTop: 8, padding: '6px 10px', background: 'var(--color-bg-control)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 4 }}>RETRY JOB</button></Panel>
  }
  if (progress.status === 'complete') {
    return <Panel title="BACKTEST COMPLETE"><MetricRow label="Experiment" value={job.experimentId} /><MetricRow label="Result" value="Available in Results" /></Panel>
  }
  return (
    <Panel title="BACKTEST PROGRESS (MOCK)">
      <LoadingState label={`${progress.status.toUpperCase()} · ${progress.eventsProcessed.toLocaleString()} / ${progress.totalEvents.toLocaleString()} events`} progress={percent} />
      <MetricRow label="Progress" value={`${percent.toFixed(1)}%`} />
      <MetricRow label="Events/sec" value={progress.eventsPerSec.toLocaleString()} />
      <MetricRow label="Orders" value={progress.ordersSubmitted.toLocaleString()} />
      <MetricRow label="Fills" value={progress.fills.toLocaleString()} />
      <button type="button" onClick={() => mockWorkbench.cancelJob(job.id)} style={{ marginTop: 8, padding: '6px 10px', background: 'var(--color-bg-control)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 4 }}>CANCEL JOB</button>
    </Panel>
  )
}
