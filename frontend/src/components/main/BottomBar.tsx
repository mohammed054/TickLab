import { StrategyState } from '../../contracts'
import { StatusDot } from '../shared/Panel'

export function BottomBar({ s }: { s: StrategyState }) {
  const net = s.realizedPnl + s.unrealizedPnl + s.fees
  return (
    <footer
      className="mono"
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        height: 26,
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-base)',
        fontSize: 'var(--font-size-2xs)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span>
          <span style={{ color: 'var(--color-text-muted)' }}>POSITION: </span>
          <span className="pos" style={{ fontWeight: 600 }}>
            {s.inventory >= 0 ? '+' : ''}
            {s.inventory} BTC
          </span>
        </span>
        <span>
          <span style={{ color: 'var(--color-text-muted)' }}>NET P&L: </span>
          <span className={net >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700 }}>
            {net >= 0 ? '+' : ''}${net.toFixed(2)}
          </span>
        </span>
        <span>
          <span style={{ color: 'var(--color-text-muted)' }}>ORDERS: </span>
          <span style={{ color: 'var(--color-text-primary)' }}>{s.orders}</span>
        </span>
        <span>
          <span style={{ color: 'var(--color-text-muted)' }}>FILLS: </span>
          <span style={{ color: 'var(--color-text-primary)' }}>{s.fills}</span>
        </span>
        <span>
          <span style={{ color: 'var(--color-text-muted)' }}>LATENCY: </span>
          <span style={{ color: 'var(--color-positive)', fontWeight: 600 }}>{s.latencyMs.toFixed(1)}ms</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <StatusDot state="ok" pulse />
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>MARKET FEED</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <StatusDot state="ok" />
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>ENGINE RUST CORE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <StatusDot state="ok" />
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>RISK CONTROLS OK</span>
        </div>
        <span className="dim" style={{ borderLeft: '1px solid var(--color-border-subtle)', paddingLeft: 10 }}>
          [CTRL+K] COMMAND PALETTE
        </span>
      </div>
    </footer>
  )
}
