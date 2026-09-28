import { useEffect, useState } from 'react'
import { MainMonitor } from './components/layout/MainMonitor'
import { SecondaryMonitor } from './components/layout/SecondaryMonitor'
import { CommandPalette } from './components/shared/CommandPalette'
import { openMonitorWindow } from './platform/nativeBridge'
import { useNativeWindowState } from './platform/useNativeWindowState'
import { useKeyboardShortcuts } from './shared/hooks/useKeyboardShortcuts'
import { StatusDot } from './shared/design-system/primitives'

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
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          height: 36,
          background: 'var(--color-bg-base)',
          borderBottom: '1px solid var(--color-border-subtle)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs)',
              background: 'linear-gradient(135deg, rgba(56,189,248,0.15) 0%, rgba(16,185,129,0.1) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-text-primary)' }}>
              TICK<span style={{ color: 'var(--color-focus)' }}>LAB</span>
            </span>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: 'var(--color-focus)',
                padding: '0 3px',
                borderRadius: '2px',
                background: 'rgba(56, 189, 248, 0.2)',
                letterSpacing: '0.04em',
              }}
            >
              QUANT PRO
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--color-bg-raised)',
              border: '1px solid var(--color-border-subtle)',
              fontSize: 'var(--font-size-2xs)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <StatusDot state="ok" pulse />
            <span className="mono" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
              CORE ENGINE ACTIVE
            </span>
            <span className="dim">·</span>
            <span>HFT IPC: OK</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            role="tablist"
            aria-label="Workspace Monitor Switcher"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: 2,
              background: 'var(--color-bg-panel)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeShell === 'main'}
              onClick={() => setActiveShell('main')}
              style={shellTabStyle(activeShell === 'main')}
            >
              <span style={{ opacity: 0.6, fontSize: 10 }}>[1]</span>
              <span>MONITOR 1: ORDER FLOW & DEPTH</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeShell === 'secondary'}
              onClick={() => setActiveShell('secondary')}
              style={shellTabStyle(activeShell === 'secondary')}
            >
              <span style={{ opacity: 0.6, fontSize: 10 }}>[2]</span>
              <span>MONITOR 2: QUANT RESEARCH LAB</span>
            </button>
          </div>

          <button
            type="button"
            title="Pop out this monitor into a separate native window"
            onClick={() => {
              void openMonitorWindow(activeShell)
            }}
            style={{
              fontSize: 'var(--font-size-2xs)',
              padding: '4px 8px',
              background: 'var(--color-bg-raised)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontWeight: 500,
            }}
          >
            <span>⎘</span>
            <span>POP-OUT WINDOW</span>
          </button>
        </div>
      </header>

      <div style={{ flex: '1 1 auto', minHeight: 0, width: '100%', position: 'relative' }}>
        {activeShell === 'main' ? <MainMonitor /> : <SecondaryMonitor />}
      </div>
    </div>
  )
}

function shellTabStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 'var(--font-size-xs)',
    fontWeight: active ? 600 : 400,
    padding: '3px 10px',
    background: active ? 'var(--color-bg-control-active)' : 'transparent',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
    border: active ? '1px solid var(--color-border-strong)' : '1px solid transparent',
    borderRadius: 'var(--radius-xs)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    letterSpacing: '0.02em',
    transition: 'all 0.12s ease',
  }
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
