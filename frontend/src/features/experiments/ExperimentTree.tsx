import { useExperimentStore } from "../../shared/experiment-sync-bus"
import { useCallback } from "react"

export function ExperimentTree() {
  const { experiments, setExperiment, selectedExperimentId, setSelectedExperimentId } = useExperimentStore()

  const handleReproduce = useCallback(
    (experimentId: string) => {
      // Re-submit a new job using the exact stored Experiment config
      // This creates a new experiment record (not a mutation) so reproduction is auditable
      setExperiment({ type: "reproduce", experimentId })
    },
    [setExperiment]
  )

  const handleDuplicate = useCallback(
    (experimentId: string) => {
      // Create an exact-input copy as a new sibling
      setExperiment({ type: "duplicate", experimentId })
    },
    [setExperiment]
  )

  const handleCompare = useCallback(
    (experimentIds: string[]) => {
      // Multi-select comparison - load comparison view with ≥2 nodes
      if (experimentIds.length >= 2) {
        setExperiment({ type: "compare", experimentIds })
      }
    },
    [setExperiment]
  )

  const handleOpen = useCallback(
    (experimentId: string) => {
      // Load experiment into Results/Analytics views
      setSelectedExperimentId(experimentId)
    },
    [setSelectedExperimentId]
  )

  if (!experiments || experiments.length === 0) {
    return <div style={{ padding: '16px', color: '#888' }}>No experiments found. Run a backtest or import experiments to see them here.</div>
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <h3 style={{ padding: '8px 12px', borderBottom: '1px solid #333', margin: '-8px -12px -4px', color: '#fff' }}>Experiment Tree</h3>
      <div style={{ background: '#1a1a1a', borderRadius: '4px', border: '1px solid #333', margin: '4px 12px', maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
        <div style={{ display: 'grid', gap: '4px', padding: '8px' }}>
          {experiments.map((exp) => (
            <div
              key={exp.id}
              style={{
                background: selectedExperimentId === exp.id ? '#333' : '#2a2a2a',
                borderRadius: '4px',
                margin: '4px 12px',
                padding: '8px',
                cursor: 'pointer',
                border: '1px solid ' + (selectedExperimentId === exp.id ? '#666' : 'transparent'),
              }}
              onClick={() => handleOpen(exp.id)}
            >
              <div style={{ fontWeight: '600', fontSize: '14px' }}>{exp.strategyRef.version || exp.strategyRef.id}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>{exp.exchange} {exp.symbol} {exp.dateRange.start}–{exp.dateRange.end}</div>
              <div style={{ fontSize: '11px', color: '#555' }}>{exp.status || 'QUEUED'}</div>
              <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', color: '#777', fontSize: '10px' }}>
                {exp.parentExperimentId ? `→ ${exp.parentExperimentId.substring(0, 8)}...` : 'Root'}
                {exp.notes?.length > 0 && ` · ${exp.notes.length} notes`}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '8px 12px', borderTop: '1px solid #333', marginTop: '8px', color: '#888', fontSize: '12px' }}>
        <div style={{ marginRight: '16px' }} onClick={() => handleDuplicate(experiments[0]?.id || '')}>Duplicate</div>
        <div style={{ marginRight: '16px' }} onClick={() => handleCompare([experiments[0]?.id || '', experiments[1]?.id || ''])}>Compare</div>
        <div onClick={() => handleReproduce(experiments[0]?.id || '')}>Reproduce</div>
      </div>
    </div>
  )
}