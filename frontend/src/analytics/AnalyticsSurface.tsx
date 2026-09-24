import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorkspacePatch } from '../state/syncBus'
import { useMarketRuntime } from '../state/appStore'
import { useWorkbench } from '../state/workbenchStore'
import { useWorkspace } from '../state/useWorkspace'
import { EmptyState, LoadingState, Panel, SelectField, StatusDot, Tabs } from '../components/shared/Panel'
import type { AnalyticsViewId } from './analyticsTypes'
import { buildAnalyticsData } from './deriveAnalytics'
import { compactButton } from './AnalyticsCharts'
import { renderAnalyticsView, type AnalyticsSelection, type AnalyticsViewProps } from './AnalyticsViews'

const VIEW_ITEMS = [
  { id: 'equity', label: 'Equity Curve' },
  { id: 'drawdown', label: 'Drawdown' },
  { id: 'attribution', label: 'P&L Attribution' },
  { id: 'trades', label: 'Trade Analysis' },
  { id: 'fills', label: 'Fill Analysis' },
  { id: 'adverse', label: 'Adverse Selection' },
  { id: 'slippage', label: 'Slippage' },
  { id: 'queue', label: 'Queue Analysis' },
  { id: 'latency', label: 'Latency Analysis' },
  { id: 'imbalance', label: 'Order-Book Imbalance' },
  { id: 'volatility', label: 'Volatility' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'time', label: 'Time Analysis' },
  { id: 'comparison', label: 'Strategy Comparison' },
] as const satisfies ReadonlyArray<{ id: AnalyticsViewId; label: string }>

export function AnalyticsSurface() {
  const [workspace, updateWorkspace] = useWorkspace()
  const { experiments, jobs } = useWorkbench()
  const runtime = useMarketRuntime()
  const [activeView, setActiveView] = useState<AnalyticsViewId>('equity')
  useEffect(() => {
    const onViewRequest = (event: Event) => {
      const view = (event as CustomEvent<string>).detail
      if (VIEW_ITEMS.some((item) => item.id === view)) setActiveView(view as AnalyticsViewId)
    }
    window.addEventListener('ticklab:analytics-view', onViewRequest)
    return () => window.removeEventListener('ticklab:analytics-view', onViewRequest)
  }, [])
  const completedExperiments = experiments.filter((experiment) => experiment.status === 'complete' && experiment.results)
  const selectedExperiment = workspace.experiment ? experiments.find((experiment) => experiment.id === workspace.experiment?.id) ?? null : null
  const result = selectedExperiment?.results ?? null
  const selectedJob = selectedExperiment ? jobs.find((job) => job.experimentId === selectedExperiment.id) : undefined
  const comparison = useMemo(() => experiments.filter((experiment) => experiment.status === 'complete' && experiment.results).map((experiment) => ({ experiment, result: experiment.results as NonNullable<typeof experiment.results> })), [experiments])
  const data = useMemo(() => result ? buildAnalyticsData({ result, experiment: selectedExperiment, runtime, comparison }) : null, [comparison, result, runtime, selectedExperiment])

  const onExperimentSelect = useCallback((experimentId: string) => {
    updateWorkspace({ experiment: { id: experimentId }, selectedExperimentId: experimentId })
  }, [updateWorkspace])

  const onSelect = useCallback((selection: AnalyticsSelection) => {
    const patch: WorkspacePatch = { timestamp: selection.timestampNs }
    if (selection.fillId !== undefined) patch.selectedFillId = selection.fillId
    if (selection.orderId !== undefined) patch.selectedOrderId = selection.orderId
    if (selection.tradeId !== undefined) patch.selectedTradeId = selection.tradeId
    if (selection.rangeStartNs !== undefined && selection.rangeEndNs !== undefined) {
      patch.replay = {
        isPlaying: false,
        speed: workspace.replay?.speed ?? 1,
        rangeStart: selection.rangeStartNs,
        rangeEnd: selection.rangeEndNs,
        currentEventId: selection.fillId ?? workspace.selectedFillId,
        currentTimestampNs: selection.timestampNs,
      }
    }
    updateWorkspace(patch)
  }, [updateWorkspace, workspace.replay?.speed, workspace.selectedFillId])

  const selectedOption = selectedExperiment && !completedExperiments.some((experiment) => experiment.id === selectedExperiment.id) ? [{ value: selectedExperiment.id, label: `${selectedExperiment.strategyRef.id} · ${selectedExperiment.id} · ${selectedExperiment.status.toUpperCase()}` }] : []
  const selectOptions = [...selectedOption, ...completedExperiments.map((experiment) => ({ value: experiment.id, label: `${experiment.strategyRef.id} · ${experiment.id}` }))]
  const viewProps: AnalyticsViewProps | null = data ? {
    data,
    selectedTimestampNs: workspace.timestamp,
    selectedFillId: workspace.selectedFillId,
    selectedTradeId: workspace.selectedTradeId,
    onSelect,
    onViewChange: setActiveView,
    onExperimentSelect,
  } : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', minHeight: 0 }}>
      <Panel title="ANALYTICS CONTEXT (SIMULATED)" bodyStyle={{ padding: 'var(--space-3)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <SelectField label="Experiment / result" value={selectedExperiment?.id ?? ''} options={selectOptions.length > 0 ? selectOptions : [{ value: '', label: 'No completed experiments' }]} onChange={(value) => { if (value) onExperimentSelect(value) }} description="The selected experiment remains the shared result context for every analytics section." />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
            <StatusDot state={result ? 'ok' : selectedExperiment?.status === 'running' || selectedExperiment?.status === 'queued' ? 'warn' : 'off'} label={result ? 'simulated result available' : 'no simulated result'} />
            <span className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>{result ? `${result.engineVersion} · ${result.headline.trades.toLocaleString()} trades` : 'Select a completed result'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <span className="mock-tag">SIMULATED ONLY</span>
          <span className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>No network, live feed, or order path is connected.</span>
        </div>
      </Panel>

      {!selectedExperiment && <Panel title="ANALYTICS (SIMULATED)"><EmptyState icon="—" title="NO EXPERIMENT SELECTED" description="Choose a completed mock experiment to inspect its deterministic analytics surface." action={selectOptions[0] ? <button type="button" style={{ ...compactButton, background: 'var(--color-bg-control)' }} onClick={() => onExperimentSelect(selectOptions[0].value)}>OPEN LATEST RESULT</button> : undefined} /></Panel>}

      {selectedExperiment && !result && (selectedExperiment.status === 'running' || selectedExperiment.status === 'queued') && <Panel title="ANALYTICS (SIMULATED)"><LoadingState label={`PREPARING SIMULATED ANALYTICS · ${selectedExperiment.id}`} progress={selectedJob ? selectedJob.progress.eventsProcessed / Math.max(selectedJob.progress.totalEvents, 1) * 100 : undefined} /></Panel>}

      {selectedExperiment && !result && selectedExperiment.status !== 'running' && selectedExperiment.status !== 'queued' && <Panel title="ANALYTICS (SIMULATED)"><EmptyState icon="—" title="NO COMPLETED RESULT" description={`The selected experiment is ${selectedExperiment.status}. Analytics remain unavailable until a completed result exists.`} action={completedExperiments[0] ? <button type="button" style={compactButton} onClick={() => onExperimentSelect(completedExperiments[0].id)}>OPEN COMPLETED RESULT</button> : undefined} /></Panel>}

      {data && viewProps && <Panel title="ANALYTICS (SIMULATED)" bodyStyle={{ padding: 'var(--space-3)', overflow: 'auto' }} style={{ flex: '1 1 auto', minHeight: 0 }}>
        <Tabs items={[...VIEW_ITEMS]} activeId={activeView} onChange={setActiveView} ariaLabel="Analytics sections" />
        <div role="tabpanel" aria-label={VIEW_ITEMS.find((item) => item.id === activeView)?.label ?? 'Analytics section'} style={{ marginTop: 8, minHeight: 0 }}>
          {renderAnalyticsView(activeView, viewProps)}
        </div>
      </Panel>}
    </div>
  )
}
