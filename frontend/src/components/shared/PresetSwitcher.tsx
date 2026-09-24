import { useWorkspace } from '../../state/useWorkspace'
import { SecondaryTabId, WorkspacePresetId } from '../../state/syncBus'
import { mockRuntime } from '../../mock/runtime/runtime'

const PRESETS: { id: WorkspacePresetId; label: string; tab: SecondaryTabId; environment?: 'RESEARCH' | 'PAPER' | 'LIVE' }[] = [
  { id: 'MARKET', label: 'Market', tab: 'market-overview' },
  { id: 'RESEARCH', label: 'Research', tab: 'parameters', environment: 'RESEARCH' },
  { id: 'BACKTEST', label: 'Backtest', tab: 'backtest', environment: 'RESEARCH' },
  { id: 'REPLAY', label: 'Replay', tab: 'replay', environment: 'RESEARCH' },
  { id: 'EXECUTION', label: 'Execution', tab: 'risk', environment: 'RESEARCH' },
  { id: 'PAPER', label: 'Paper', tab: 'risk', environment: 'PAPER' },
  { id: 'LIVE', label: 'Live (simulated)', tab: 'risk', environment: 'LIVE' },
]

export function PresetSwitcher() {
  const [workspace, updateWorkspace] = useWorkspace()
  const apply = (id: WorkspacePresetId) => {
    const preset = PRESETS.find((candidate) => candidate.id === id)
    if (!preset) return
    updateWorkspace({ preset: id, activeTab: { secondaryMonitor: preset.tab }, ...(preset.environment ? { environment: preset.environment } : {}) })
    if (preset.environment) mockRuntime.setEnvironment(preset.environment)
  }
  return <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}><span className="dim">PRESET</span><select aria-label="Workspace preset" value={workspace.preset} onChange={(event) => apply(event.target.value as WorkspacePresetId)} style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 3, padding: '3px 5px', fontSize: 10 }}>{PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
}
