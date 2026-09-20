import { MainMonitorShell } from '../main-monitor/MainMonitorShell'
import { SecondaryMonitorShell } from '../secondary-monitor/SecondaryMonitorShell'
import { useWorkspaceContext } from '../../shared/sync-bus'

export function SingleDisplayShell() {
  const { activeTab } = useWorkspaceContext()
  const [currentView, setCurrentView] = React.useState<'main' | 'secondary'>('main')

  const isSecondaryActive = activeTab?.secondaryMonitor !== undefined && activeTab?.secondaryMonitor !== 'strategy'

  return (
    <div className="single-display-shell" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d0d' }}>
      <header style={{ 
        padding: '8px 16px', 
        borderBottom: '1px solid #333', 
        background: '#1a1a1a',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <strong>TickLab — Single Display Mode</strong>
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
          <button
            onClick={() => setCurrentView('main')}
            style={{
              padding: '6px 16px',
              background: currentView === 'main' ? '#333' : 'transparent',
              border: '1px solid #333',
              borderRadius: '4px',
              color: currentView === 'main' ? '#fff' : '#888',
              cursor: 'pointer'
            }}
          >
            Main Monitor
          </button>
          <button
            onClick={() => setCurrentView('secondary')}
            style={{
              padding: '6px 16px',
              background: currentView === 'secondary' ? '#333' : 'transparent',
              border: '1px solid #333',
              borderRadius: '4px',
              color: currentView === 'secondary' ? '#fff' : '#888',
              cursor: 'pointer'
            }}
          >
            Secondary Monitor
          </button>
        </div>
      </header>
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {currentView === 'main' ? <MainMonitorShell /> : <SecondaryMonitorShell />}
      </main>
    </div>
  )
}

import React from 'react'