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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <header className="shell-bar">
        <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
          <span className="brand" style={{ alignSelf: 'center' }}>TickLab</span>
          <div className="shell-tabs" role="tablist" aria-label="Workspace">
            <button type="button" role="tab" aria-selected={activeShell === 'main'} onClick={() => setActiveShell('main')}>
              Market
            </button>
            <button type="button" role="tab" aria-selected={activeShell === 'secondary'} onClick={() => setActiveShell('secondary')}>
              Research
            </button>
          </div>
        </div>
        <button
          type="button"
          className="shell-action"
          title="Open this view in a separate window"
          onClick={() => {
            void openMonitorWindow(activeShell)
          }}
        >
          Pop out
        </button>
      </header>

      <div style={{ flex: '1 1 auto', minHeight: 0, width: '100%', position: 'relative' }}>
        {activeShell === 'main' ? <MainMonitor /> : <SecondaryMonitor />}
      </div>
    </div>
  )
}

export default function App() {
  useKeyboardShortcuts()
  useNativeWindowState()
  const params = new URLSearchParams(window.location.search)
  const requestedShell = params.get('shell') ?? params.get('monitor')

  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <CommandPalette />
      {requestedShell === 'main' ? (
        <MainMonitor />
      ) : requestedShell === 'secondary' ? (
        <SecondaryMonitor />
      ) : (
        <SingleDisplayShell />
      )}
    </div>
  )
}
