import { useState } from 'react'
import { mockWorkbench } from '../../mock/workbench'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'
import { Panel, StatusDot } from '../shared/Panel'

const STATUS_STATE = {
  queued: 'off',
  running: 'warn',
  complete: 'ok',
  failed: 'bad',
  cancelled: 'bad',
} as const

export function ExperimentsPanel() {
  const { experiments } = useWorkbench()
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set())
  const [, updateWorkspace] = useWorkspace()

  const openExperiment = (id: string) => updateWorkspace({ experiment: { id }, selectedExperimentId: id, activeTab: { secondaryMonitor: 'results' } })
  const toggleCompare = (id: string) => {
    const next = new Set(selectedForCompare)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedForCompare(next)
    window.dispatchEvent(new CustomEvent('ticklab:compare-selection', { detail: Array.from(next) }))
  }
  const reproduce = (id: string) => {
    const jobId = mockWorkbench.reproduceExperiment(id)
    if (!jobId) return
    const job = mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === jobId)
    if (job) updateWorkspace({ experiment: { id: job.experimentId }, activeTab: { secondaryMonitor: 'backtest' } })
  }

  const launchDerived = (id: string, mode: 'duplicate' | 'branch') => {
    const jobId = mode === 'duplicate' ? mockWorkbench.duplicateExperiment(id) : mockWorkbench.branchExperiment(id)
    if (!jobId) return
    const job = mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === jobId)
    if (job) updateWorkspace({ experiment: { id: job.experimentId }, activeTab: { secondaryMonitor: 'backtest' } })
  }

  const exportExperiment = (id: string) => {
    const experiment = experiments.find((candidate) => candidate.id === id)
    if (!experiment) return
    const blob = new Blob([JSON.stringify(experiment, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${id}-experiment.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <Panel title={`EXPERIMENTS (${experiments.length}, MOCK)`} bodyStyle={{ padding: 0 }} style={{ height: '100%' }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="dim" style={{ fontSize: 10.5 }}>Select experiments for comparison</span>
        <span className="mono dim" style={{ fontSize: 10 }}>{selectedForCompare.size} selected</span>
      </div>
      {experiments.map((experiment) => (
        <div key={experiment.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid var(--border-1)' }}>
          <button type="button" onClick={() => openExperiment(experiment.id)} style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 }}>
            <div className="mono" style={{ fontWeight: 600 }}>{experiment.strategyRef.id} · {experiment.id}</div>
            <div className="dim" style={{ fontSize: 10.5 }}>{experiment.datasetId} · {experiment.status.toUpperCase()}</div>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {experiment.results && <span className={`mono ${experiment.results.headline.netPnl >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 10.5 }}>{experiment.results.headline.netPnl >= 0 ? '+' : ''}${experiment.results.headline.netPnl.toFixed(0)}</span>}
            <span className="mono" style={{ fontSize: 10.5 }}><StatusDot state={STATUS_STATE[experiment.status]} /> {experiment.status.toUpperCase()}</span>
            <button type="button" onClick={() => reproduce(experiment.id)} style={{ fontSize: 9, padding: '3px 5px', border: '1px solid var(--border-1)', borderRadius: 3, background: 'transparent', color: 'var(--text-2)' }}>REPRO</button>
            <button type="button" onClick={() => launchDerived(experiment.id, 'duplicate')} style={{ fontSize: 9, padding: '3px 5px', border: '1px solid var(--border-1)', borderRadius: 3, background: 'transparent', color: 'var(--text-2)' }}>DUPLICATE</button>
            <button type="button" onClick={() => launchDerived(experiment.id, 'branch')} style={{ fontSize: 9, padding: '3px 5px', border: '1px solid var(--border-1)', borderRadius: 3, background: 'transparent', color: 'var(--text-2)' }}>BRANCH</button>
            <button type="button" onClick={() => exportExperiment(experiment.id)} style={{ fontSize: 9, padding: '3px 5px', border: '1px solid var(--border-1)', borderRadius: 3, background: 'transparent', color: 'var(--text-2)' }}>EXPORT</button>
            <button type="button" aria-pressed={selectedForCompare.has(experiment.id)} onClick={() => toggleCompare(experiment.id)} style={{ fontSize: 9, padding: '3px 5px', border: '1px solid var(--border-1)', borderRadius: 3, background: selectedForCompare.has(experiment.id) ? 'var(--bg-3)' : 'transparent', color: selectedForCompare.has(experiment.id) ? 'var(--text-0)' : 'var(--text-2)' }}>CMP</button>
          </div>
        </div>
      ))}
    </Panel>
  )
}
