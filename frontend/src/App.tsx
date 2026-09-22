import { MainMonitor } from './components/layout/MainMonitor'
import { SecondaryMonitor } from './components/layout/SecondaryMonitor'
import { CommandPalette } from './components/shared/CommandPalette'

function openMonitorWindow(which: 'main' | 'secondary') {
  const url = `${window.location.origin}${window.location.pathname}?monitor=${which}`
  window.open(url, `btc-workstation-${which}`, 'width=1400,height=900')
}

function CombinedView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          padding: '6px 12px',
          background: 'var(--bg-2)',
          borderBottom: '1px solid var(--border-1)',
          fontSize: 11,
        }}
      >
        <strong>BTC Quant Workstation</strong>
        <span className="dim">— dev preview: both monitors stacked in one window</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => openMonitorWindow('main')} style={btnStyle}>
            Open Main Monitor window
          </button>
          <button onClick={() => openMonitorWindow('secondary')} style={btnStyle}>
            Open Secondary Monitor window
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
        <div style={{ flex: '1 1 70%', minWidth: 0, borderRight: '2px solid var(--border-2)' }}>
          <MainMonitor />
        </div>
        <div style={{ flex: '1 1 30%', minWidth: 340, maxWidth: 460 }}>
          <SecondaryMonitor />
        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  fontSize: 10.5,
  padding: '4px 8px',
  background: 'var(--bg-3)',
  color: 'var(--text-1)',
  border: '1px solid var(--border-1)',
  borderRadius: 4,
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const monitor = params.get('monitor')

  return (
    <div style={{ height: '100vh' }}>
      <CommandPalette />
      {monitor === 'main' ? <MainMonitor /> : monitor === 'secondary' ? <SecondaryMonitor /> : <CombinedView />}
    </div>
  )
}
