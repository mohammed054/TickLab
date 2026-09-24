import { useMemo, useState } from 'react'
import { mockDatasetStore, useMockDatasetStore } from '../../mock/datasets/datasetCatalog'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'

export function GlobalSearch() {
  const { experiments, notes, logs } = useWorkbench()
  const datasetStore = useMockDatasetStore()
  const [, updateWorkspace] = useWorkspace()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const normalized = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!normalized) return []
    const experimentResults = experiments.filter((experiment) => `${experiment.id} ${experiment.strategyRef.id} ${experiment.datasetId}`.toLowerCase().includes(normalized)).slice(0, 5).map((experiment) => ({ id: experiment.id, kind: 'Experiment', label: `${experiment.strategyRef.id} · ${experiment.id}`, action: () => updateWorkspace({ experiment: { id: experiment.id }, selectedExperimentId: experiment.id, activeTab: { secondaryMonitor: 'results' } }) }))
    const noteResults = notes.filter((note) => `${note.body} ${note.targetId}`.toLowerCase().includes(normalized)).slice(0, 5).map((note) => ({ id: note.id, kind: 'Note', label: note.body, action: () => updateWorkspace({ activeTab: { secondaryMonitor: 'research-notes' } }) }))
    const logResults = logs.filter((log) => `${log.message} ${log.service}`.toLowerCase().includes(normalized)).slice(0, 5).map((log) => ({ id: log.id, kind: 'Log', label: log.message, action: () => updateWorkspace({ timestamp: log.timestampNs, activeTab: { secondaryMonitor: 'event-inspector' } }) }))
    const datasetResults = datasetStore.records.filter((record) => `${record.id} ${record.selection.symbol} ${record.selection.exchange}`.toLowerCase().includes(normalized)).slice(0, 5).map((record) => ({ id: record.id, kind: 'Dataset', label: record.id, action: () => { mockDatasetStore.selectSelection(record.selection); updateWorkspace({ dataset: { id: record.id, exchange: record.selection.exchange, symbol: record.selection.symbol, market: record.selection.market, startNs: record.dateRange.start, endNs: record.dateRange.end }, exchange: record.selection.exchange, symbol: record.selection.symbol, activeTab: { secondaryMonitor: 'data-quality' } }) } }))
    return [...experimentResults, ...noteResults, ...logResults, ...datasetResults]
  }, [datasetStore.records, experiments, logs, normalized, notes, updateWorkspace])

  return (
    <div style={{ position: 'relative', minWidth: 180 }}>
      <input aria-label="Global search" value={query} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} placeholder="Search workspace…" style={{ width: '100%', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: '4px 7px', fontSize: 'var(--font-size-xs)' }} />
      {open && normalized && <div role="listbox" aria-label="Global search results" style={{ position: 'absolute', top: '110%', right: 0, width: 340, maxHeight: 360, overflow: 'auto', zIndex: 30, background: 'var(--color-bg-panel)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.35)' }}>{results.length === 0 ? <div className="dim" style={{ padding: 10, fontSize: 11 }}>No matching workspace objects.</div> : results.map((result) => <button key={`${result.kind}-${result.id}`} type="button" role="option" onMouseDown={() => { result.action(); setOpen(false); setQuery('') }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', border: 0, borderBottom: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 11 }}><span className="dim" style={{ fontSize: 9, marginRight: 6 }}>{result.kind}</span>{result.label}</button>)}</div>}
    </div>
  )
}
