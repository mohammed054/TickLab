import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDefaultBacktestRequest, mockWorkbench } from '../../mock/workbench'
import { canRunBacktest, getSelectedRecord, useMockDatasetStore } from '../../mock/datasets/datasetCatalog'
import { mockRuntime } from '../../mock/runtime/runtime'
import { openMonitorWindow } from '../../platform/nativeBridge'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'
import { useStrategyParameters } from '../../state/parameterStore'
import { useFocusTrap } from '../../shared/hooks/useFocusTrap'

interface Command {
  id: string
  label: string
  keywords: string
  run: () => void
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const { experiments } = useWorkbench()
  const datasetSnapshot = useMockDatasetStore()
  const selectedDataset = getSelectedRecord(datasetSnapshot)
  const [parameters] = useStrategyParameters()
  const [, updateWorkspace] = useWorkspace()

  const commands = useMemo<Command[]>(() => [
    { id: 'run-backtest', label: 'Run backtest', keywords: 'run start backtest', run: () => { if (!selectedDataset || !canRunBacktest(selectedDataset)) { updateWorkspace({ activeTab: { secondaryMonitor: 'data-quality' } }); return } const baseRequest = createDefaultBacktestRequest(); const request = { ...baseRequest, datasetId: selectedDataset.id, dateRange: selectedDataset.dateRange, parameters: { ...baseRequest.parameters, spreadTicks: parameters.spreadTicks, orderSize: parameters.orderSize, requoteMs: parameters.requoteMs, inventoryLimit: parameters.inventoryLimit, inventorySkew: parameters.inventorySkew }, executionModel: { ...baseRequest.executionModel, makerFee: parameters.makerFee, takerFee: parameters.takerFee, latencyModel: parameters.latencyModel, queueModel: parameters.queueModel, allowPartialFills: parameters.allowPartialFills } }; const jobId = mockWorkbench.startBacktest(request); const job = mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === jobId); if (job) updateWorkspace({ experiment: { id: job.experimentId }, activeTab: { secondaryMonitor: 'backtest' } }) } },
    { id: 'open-order-book', label: 'Open BTC order book', keywords: 'book ladder main market', run: () => { window.dispatchEvent(new CustomEvent('ticklab:open-monitor', { detail: 'main' })); void openMonitorWindow('main') } },
    { id: 'open-strategy', label: 'Open strategy editor', keywords: 'strategy code editor', run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'strategy' } }) },
    { id: 'replay', label: 'Replay last timestamp', keywords: 'replay event timestamp', run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'replay' } }) },
    { id: 'compare', label: 'Compare experiments', keywords: 'compare selection results', run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'compare' } }) },
    { id: 'latest-results', label: 'Show latest results', keywords: 'latest result experiment', run: () => { const latest = experiments.find((experiment) => experiment.status === 'complete'); if (latest) updateWorkspace({ experiment: { id: latest.id }, selectedExperimentId: latest.id, activeTab: { secondaryMonitor: 'results' } }) } },
    { id: 'paper', label: 'Start paper trading', keywords: 'paper environment risk', run: () => { mockRuntime.setEnvironment('PAPER'); mockWorkbench.appendAudit('ENVIRONMENT_SWITCH', 'workspace', 'active', 'PAPER'); updateWorkspace({ environment: 'PAPER', activeTab: { secondaryMonitor: 'risk' } }) } },
    { id: 'adverse', label: 'Show adverse-selection analysis', keywords: 'adverse selection markout analytics', run: () => { updateWorkspace({ activeTab: { secondaryMonitor: 'analytics' } }); window.dispatchEvent(new CustomEvent('ticklab:analytics-view', { detail: 'adverse' })) } },
    { id: 'dataset', label: 'Open dataset selector', keywords: 'dataset data quality', run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'data' } }) },
    { id: 'data-center', label: 'Open data center', keywords: 'catalog datasets manage', run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'data-center' } }) },
    { id: 'realtime', label: 'Open realtime monitor', keywords: 'feed websocket health monitor', run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'realtime-monitor' } }) },
    { id: 'market-overview', label: 'Open market overview', keywords: 'symbols eth sol derivatives', run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'market-overview' } }) },
    { id: 'notes', label: 'Open research notes', keywords: 'notes annotations', run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'research-notes' } }) },
    { id: 'stop', label: 'Stop strategy', keywords: 'stop kill switch cancel', run: () => { mockWorkbench.getSnapshot().jobs.filter((job) => job.progress.status === 'running' || job.progress.status === 'queued').forEach((job) => mockWorkbench.cancelJob(job.id)); mockRuntime.setStrategyStatus('STOPPED'); mockWorkbench.appendAudit('STRATEGY_STOP', 'strategy', 'active', 'command palette'); updateWorkspace({ environment: 'RESEARCH', activeTab: { secondaryMonitor: 'risk' } }) } },
    { id: 'logs', label: 'Show logs', keywords: 'logs structured errors', run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'logs' } }) },
  ], [experiments, parameters, selectedDataset, updateWorkspace])
  const filtered = useMemo(() => commands.filter((command) => `${command.label} ${command.keywords}`.toLowerCase().includes(query.trim().toLowerCase())), [commands, query])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const execute = (command: Command | undefined) => {
    if (!command) return
    command.run()
    setOpen(false)
  }

  useFocusTrap(open, dialogRef, close)

  if (!open) return null

  return (
    <div role="presentation" onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh', zIndex: 50 }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Command palette" tabIndex={-1} onClick={(event) => event.stopPropagation()} style={{ width: 520, background: 'var(--color-bg-panel)', border: '1px solid var(--color-border-strong)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 11, color: 'var(--color-text-muted)' }}>COMMAND PALETTE · CTRL/CMD K</div>
        <input ref={inputRef} aria-label="Search commands" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0) }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => Math.min(index + 1, filtered.length - 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => Math.max(index - 1, 0)) } if (event.key === 'Enter') execute(filtered[selectedIndex]) }} placeholder="Search actions…" style={{ width: '100%', padding: '10px 12px', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: 0, borderBottom: '1px solid var(--color-border-subtle)', outline: 0, fontSize: 13 }} />
        <div role="listbox" aria-label="Commands" style={{ maxHeight: 360, overflow: 'auto' }}>
          {filtered.length === 0 ? <div className="dim" style={{ padding: 16 }}>No matching commands.</div> : filtered.map((command, index) => <button key={command.id} type="button" role="option" aria-selected={index === selectedIndex} onMouseEnter={() => setSelectedIndex(index)} onClick={() => execute(command)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 0, borderBottom: '1px solid var(--color-border-subtle)', background: index === selectedIndex ? 'var(--color-bg-control)' : 'transparent', color: 'var(--color-text-primary)', fontSize: 12.5, cursor: 'pointer' }}>{command.label}</button>)}
        </div>
      </div>
    </div>
  )
}
