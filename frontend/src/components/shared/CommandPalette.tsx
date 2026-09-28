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
  category: string
  keywords: string
  shortcut?: string
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
    {
      id: 'run-backtest',
      label: 'Execute Strategy Backtest',
      category: 'EXECUTION',
      keywords: 'run start backtest simulation execute',
      shortcut: '⌘⏎',
      run: () => {
        if (!selectedDataset || !canRunBacktest(selectedDataset)) {
          updateWorkspace({ activeTab: { secondaryMonitor: 'data-quality' } })
          return
        }
        const baseRequest = createDefaultBacktestRequest()
        const request = {
          ...baseRequest,
          datasetId: selectedDataset.id,
          dateRange: selectedDataset.dateRange,
          parameters: {
            ...baseRequest.parameters,
            spreadTicks: parameters.spreadTicks,
            orderSize: parameters.orderSize,
            requoteMs: parameters.requoteMs,
            inventoryLimit: parameters.inventoryLimit,
            inventorySkew: parameters.inventorySkew,
          },
          executionModel: {
            ...baseRequest.executionModel,
            makerFee: parameters.makerFee,
            takerFee: parameters.takerFee,
            latencyModel: parameters.latencyModel,
            queueModel: parameters.queueModel,
            allowPartialFills: parameters.allowPartialFills,
          },
        }
        const jobId = mockWorkbench.startBacktest(request)
        const job = mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === jobId)
        if (job) updateWorkspace({ experiment: { id: job.experimentId }, activeTab: { secondaryMonitor: 'backtest' } })
      },
    },
    {
      id: 'open-order-book',
      label: 'Focus DOM / L2 Order Book Ladder',
      category: 'MONITOR',
      keywords: 'book ladder main market depth',
      run: () => {
        window.dispatchEvent(new CustomEvent('ticklab:open-monitor', { detail: 'main' }))
        void openMonitorWindow('main')
      },
    },
    {
      id: 'open-strategy',
      label: 'Open Strategy Python IDE',
      category: 'RESEARCH',
      keywords: 'strategy code editor python monaco',
      run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'strategy' } }),
    },
    {
      id: 'replay',
      label: 'Launch Nanosecond Event Replay',
      category: 'INVESTIGATION',
      keywords: 'replay event timestamp scrub tick',
      run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'replay' } }),
    },
    {
      id: 'compare',
      label: 'Compare Historical Simulation Runs',
      category: 'EXPERIMENTS',
      keywords: 'compare selection results diff',
      run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'compare' } }),
    },
    {
      id: 'latest-results',
      label: 'View Latest Simulation Results & Attribution',
      category: 'ANALYTICS',
      keywords: 'latest result experiment pnl metrics',
      run: () => {
        const latest = experiments.find((experiment) => experiment.status === 'complete')
        if (latest) {
          updateWorkspace({ experiment: { id: latest.id }, selectedExperimentId: latest.id, activeTab: { secondaryMonitor: 'results' } })
        }
      },
    },
    {
      id: 'paper',
      label: 'Switch to Paper Simulation Environment',
      category: 'ENVIRONMENT',
      keywords: 'paper environment risk live',
      run: () => {
        mockRuntime.setEnvironment('PAPER')
        mockWorkbench.appendAudit('ENVIRONMENT_SWITCH', 'workspace', 'active', 'PAPER')
        updateWorkspace({ environment: 'PAPER', activeTab: { secondaryMonitor: 'risk' } })
      },
    },
    {
      id: 'adverse',
      label: 'Open Adverse Selection & Markout Profiler',
      category: 'ANALYTICS',
      keywords: 'adverse selection markout analytics post trade',
      run: () => {
        updateWorkspace({ activeTab: { secondaryMonitor: 'analytics' } })
        window.dispatchEvent(new CustomEvent('ticklab:analytics-view', { detail: 'adverse' }))
      },
    },
    {
      id: 'dataset',
      label: 'Open Dataset Catalog & Ingestion',
      category: 'DATA',
      keywords: 'dataset data quality catalog',
      run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'data' } }),
    },
    {
      id: 'data-center',
      label: 'Open Data Center Storage & Tier Manager',
      category: 'DATA',
      keywords: 'catalog datasets manage storage l2 l3 parquet',
      run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'data-center' } }),
    },
    {
      id: 'realtime',
      label: 'Open Gateway Telemetry & Feed Status',
      category: 'TELEMETRY',
      keywords: 'feed websocket health monitor latency',
      run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'realtime-monitor' } }),
    },
    {
      id: 'market-overview',
      label: 'Open Cross-Asset Universe Matrix',
      category: 'MARKETS',
      keywords: 'symbols eth sol derivatives basis',
      run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'market-overview' } }),
    },
    {
      id: 'notes',
      label: 'Open Quantitative Research Journal',
      category: 'RESEARCH',
      keywords: 'notes annotations markdown logs',
      run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'research-notes' } }),
    },
    {
      id: 'stop',
      label: 'EMERGENCY KILL SWITCH: Halt All Execution',
      category: 'RISK',
      keywords: 'stop kill switch cancel halt abort',
      run: () => {
        mockWorkbench.getSnapshot().jobs.filter((job) => job.progress.status === 'running' || job.progress.status === 'queued').forEach((job) => mockWorkbench.cancelJob(job.id))
        mockRuntime.setStrategyStatus('STOPPED')
        mockWorkbench.appendAudit('STRATEGY_STOP', 'strategy', 'active', 'command palette')
        updateWorkspace({ environment: 'RESEARCH', activeTab: { secondaryMonitor: 'risk' } })
      },
    },
    {
      id: 'logs',
      label: 'View Structured Engine & IPC Logs',
      category: 'TELEMETRY',
      keywords: 'logs structured errors rust zerocopy',
      run: () => updateWorkspace({ activeTab: { secondaryMonitor: 'logs' } }),
    },
  ], [experiments, parameters, selectedDataset, updateWorkspace])

  const filtered = useMemo(() => commands.filter((command) => `${command.label} ${command.category} ${command.keywords}`.toLowerCase().includes(query.trim().toLowerCase())), [commands, query])

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
    <div
      role="presentation"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '10vh',
        zIndex: 9999,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 580,
          background: 'var(--bg-1)',
          border: '1px solid var(--border-focus)',
          borderRadius: 8,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px var(--border-focus)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-brand-primary)' }}>
            TICKLAB COMMAND DISPATCHER
          </span>
          <span className="mono dim" style={{ fontSize: 10 }}>ESC TO CLOSE</span>
        </div>

        <input
          ref={inputRef}
          aria-label="Search commands"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelectedIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setSelectedIndex((index) => Math.min(index + 1, filtered.length - 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setSelectedIndex((index) => Math.max(index - 1, 0))
            }
            if (event.key === 'Enter') execute(filtered[selectedIndex])
          }}
          placeholder="Type an action, command, or parameter..."
          style={{
            width: '100%',
            padding: '12px 14px',
            background: 'var(--bg-0)',
            color: 'var(--text-0)',
            border: 0,
            borderBottom: '1px solid var(--border-1)',
            outline: 0,
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
          }}
        />

        <div role="listbox" aria-label="Commands" style={{ maxHeight: 380, overflow: 'auto', padding: 4 }}>
          {filtered.length === 0 ? (
            <div className="dim" style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12 }}>
              No matching commands found.
            </div>
          ) : (
            filtered.map((command, index) => {
              const isSelected = index === selectedIndex
              return (
                <button
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => execute(command)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    margin: '1px 0',
                    border: 'none',
                    borderRadius: 4,
                    background: isSelected ? 'var(--bg-3)' : 'transparent',
                    color: isSelected ? 'var(--text-0)' : 'var(--text-1)',
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        padding: '2px 5px',
                        borderRadius: 3,
                        background: isSelected ? 'var(--bg-2)' : 'var(--bg-2)',
                        color: isSelected ? 'var(--color-brand-primary)' : 'var(--text-2)',
                        border: '1px solid var(--border-1)',
                      }}
                    >
                      {command.category}
                    </span>
                    <span style={{ fontWeight: isSelected ? 600 : 400 }}>{command.label}</span>
                  </div>
                  {command.shortcut && (
                    <span className="mono dim" style={{ fontSize: 10 }}>
                      {command.shortcut}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
