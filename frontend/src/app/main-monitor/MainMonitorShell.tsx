import { useWorkspaceContext } from '../../shared/sync-bus'

export function MainMonitorShell() {
  const { symbol, exchange, environment, timestamp, isConnected } = useWorkspaceContext()

  return (
    <div className="main-monitor-shell" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '8px 16px', borderBottom: '1px solid #333', background: '#1a1a1a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <strong>TickLab — Main Monitor</strong>
          <span style={{ color: '#888' }}>{symbol} @ {exchange}</span>
          <span style={{ 
            color: environment === 'LIVE' ? '#ff4444' : environment === 'PAPER' ? '#ffaa00' : '#44aa44',
            textTransform: 'uppercase',
            fontSize: '12px',
            padding: '2px 8px',
            border: '1px solid currentColor',
            borderRadius: '4px'
          }}>
            {environment}
          </span>
          <span style={{ marginLeft: 'auto', color: isConnected ? '#44aa44' : '#ff4444' }}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </span>
          {timestamp && (
            <span style={{ color: '#888', fontSize: '12px', fontFamily: 'monospace' }}>
              T: {new Date(Number(timestamp) / 1_000_000).toISOString()}
            </span>
          )}
        </div>
      </header>
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', gap: '8px', padding: '8px', background: '#0d0d0d' }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ flex: 1, background: '#1a1a1a', borderRadius: '4px', border: '1px solid #333' }}>
            Price Chart Area
          </div>
          <div style={{ height: '200px', background: '#1a1a1a', borderRadius: '4px', border: '1px solid #333' }}>
            Trade Tape Area
          </div>
        </section>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ flex: 1, background: '#1a1a1a', borderRadius: '4px', border: '1px solid #333' }}>
            Order Book Ladder Area
          </div>
          <div style={{ flex: 1, background: '#1a1a1a', borderRadius: '4px', border: '1px solid #333' }}>
            Order Flow / Microstructure Area
          </div>
        </aside>
      </main>
      <footer style={{ padding: '8px 16px', borderTop: '1px solid #333', background: '#1a1a1a', color: '#888', fontSize: '12px' }}>
        Bottom Bar — P&L, Risk, System Status
      </footer>
    </div>
  )
}