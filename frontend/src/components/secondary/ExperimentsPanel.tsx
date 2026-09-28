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
    <Panel title={`EXPERIMENT REGISTRY & VERSION LINEAGE (${experiments.length} RUNS)`} bodyStyle={{ padding: 0 }} style={{ height: '100%' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="dim" style={{ fontSize: 11 }}>Deterministic experiment lineage with full parameter reproducibility</span>
        <span className="mono dim" style={{ fontSize: 10.5 }}>{selectedForCompare.size} SELECTED FOR DIFF</span>
      </div>
      <div style={{ overflow: 'auto', flex: 1 }}>
        {experiments.map((experiment) => (
          <div
            key={experiment.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              borderBottom: '1px solid var(--border-1)',
              background: selectedForCompare.has(experiment.id) ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
              transition: 'background 0.15s ease',
            }}
          >
            <button
              type="button"
              onClick={() => openExperiment(experiment.id)}
              style={{
                flex: 1,
                textAlign: 'left',
                background: 'transparent',
                border: 0,
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <div className="mono" style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-0)' }}>
                {experiment.strategyRef.id} <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>· {experiment.id}</span>
              </div>
              <div className="dim mono" style={{ fontSize: 10, marginTop: 2 }}>
                Dataset: {experiment.datasetId} · Status: {experiment.status.toUpperCase()}
              </div>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {experiment.results && (
                <span className={`mono ${experiment.results.headline.netPnl >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 12, fontWeight: 700 }}>
                  {experiment.results.headline.netPnl >= 0 ? '+' : ''}${experiment.results.headline.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
              <span className="mono" style={{ fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusDot state={STATUS_STATE[experiment.status]} /> {experiment.status.toUpperCase()}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => reproduce(experiment.id)}
                  style={{
                    fontSize: 9.5,
                    padding: '3px 6px',
                    border: '1px solid var(--border-1)',
                    borderRadius: 3,
                    background: 'var(--bg-2)',
                    color: 'var(--text-1)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  REPRO
                </button>
                <button
                  type="button"
                  onClick={() => launchDerived(experiment.id, 'branch')}
                  style={{
                    fontSize: 9.5,
                    padding: '3px 6px',
                    border: '1px solid var(--border-1)',
                    borderRadius: 3,
                    background: 'var(--bg-2)',
                    color: 'var(--text-1)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  BRANCH
                </button>
                <button
                  type="button"
                  onClick={() => exportExperiment(experiment.id)}
                  style={{
                    fontSize: 9.5,
                    padding: '3px 6px',
                    border: '1px solid var(--border-1)',
                    borderRadius: 3,
                    background: 'var(--bg-2)',
                    color: 'var(--text-1)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  EXPORT
                </button>
                <button
                  type="button"
                  aria-pressed={selectedForCompare.has(experiment.id)}
                  onClick={() => toggleCompare(experiment.id)}
                  style={{
                    fontSize: 9.5,
                    padding: '3px 6px',
                    border: selectedForCompare.has(experiment.id) ? '1px solid var(--color-brand-primary)' : '1px solid var(--border-1)',
                    borderRadius: 3,
                    background: selectedForCompare.has(experiment.id) ? 'var(--color-brand-primary)' : 'var(--bg-2)',
                    color: selectedForCompare.has(experiment.id) ? '#080a0d' : 'var(--text-1)',
                    fontWeight: selectedForCompare.has(experiment.id) ? 700 : 500,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  COMPARE
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
