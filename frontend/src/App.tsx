import { SecondaryMonitor } from './components/layout/SecondaryMonitor'
import { isTauriRuntime } from './platform/nativeBridge'

export default function App() {
  if (!isTauriRuntime()) {
    return (
      <main aria-live="polite" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#080b10', color: '#e6edf7', fontFamily: 'Segoe UI, sans-serif' }}>
        <section style={{ maxWidth: 460, padding: 32, border: '1px solid #263242', borderRadius: 12, background: '#101722' }}>
          <div style={{ color: '#8da2bb', fontSize: 12, letterSpacing: '0.12em', fontWeight: 700 }}>TICKLAB DESKTOP</div>
          <h1 style={{ margin: '12px 0 8px', fontSize: 24 }}>Launch the TickLab app</h1>
          <p style={{ margin: 0, color: '#a9b7c9', lineHeight: 1.6 }}>TickLab runs as a Windows desktop application. Open it from the desktop shortcut or Start menu.</p>
        </section>
      </main>
    )
  }

  return <SecondaryMonitor />
}
