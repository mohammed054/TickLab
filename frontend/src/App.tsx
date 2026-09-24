import { useEffect, useState } from 'react'
import { MainMonitor } from './components/layout/MainMonitor'
import { SecondaryMonitor } from './components/layout/SecondaryMonitor'
import { CommandPalette } from './components/shared/CommandPalette'
import { openMonitorWindow } from './platform/nativeBridge'
import { useNativeWindowState } from './platform/useNativeWindowState'
import { useKeyboardShortcuts } from './shared/hooks/useKeyboardShortcuts'

function SingleDisplayShell() {
  const [activeShell, setActiveShell] = useState<'main' | 'secondary'>('main')
  useEffect(() => {
    const onOpenMonitor = (event: Event) => {
      const shell = (event as CustomEvent<'main' | 'secondary'>).detail
      if (shell === 'main' || shell === 'secondary') setActiveShell(shell)
    }
    window.addEventListener('ticklab:open-monitor', onOpenMonitor)
    return () => window.removeEventListener('ticklab:open-monitor', onOpenMonitor)
  }, [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--color-bg-raised)', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <strong style={{ fontSize: 'var(--font-size-sm)' }}>BTC Quant Workstation</strong>
        <span className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>Single-display development shell</span>
        <div role="tablist" aria-label="Monitor shell" style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button type="button" role="tab" aria-selected={activeShell === 'main'} onClick={() => setActiveShell('main')} style={shellButtonStyle(activeShell === 'main')}>Main Monitor</button>
          <button type="button" role="tab" aria-selected={activeShell === 'secondary'} onClick={() => setActiveShell('secondary')} style={shellButtonStyle(activeShell === 'secondary')}>Research Lab</button>
        </div>
        <button type="button" onClick={() => { void openMonitorWindow(activeShell) }} style={{ ...shellButtonStyle(false), marginLeft: 4 }}>Open separate window</button>
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0 }}>{activeShell === 'main' ? <MainMonitor /> : <SecondaryMonitor />}</div>
    </div>
  )
}

function shellButtonStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 'var(--font-size-xs)',
    padding: '4px 8px',
    background: active ? 'var(--color-bg-control)' : 'transparent',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-sm)',
  }
}

export default function App() {
  useKeyboardShortcuts()
  useNativeWindowState()
  const params = new URLSearchParams(window.location.search)
  const requestedShell = params.get('shell') ?? params.get('monitor')

  return (
    <div style={{ height: '100vh' }}>
      <CommandPalette />
      {requestedShell === 'main' ? <MainMonitor /> : requestedShell === 'secondary' ? <SecondaryMonitor /> : <SingleDisplayShell />}
    </div>
  )
}
