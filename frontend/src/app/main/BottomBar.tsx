import { MockStrategyState } from '../../mock/mockData'
import { StatusDot } from '../shared/Panel'

export function BottomBar({ s }: { s: MockStrategyState }) {
  const net = s.realizedPnl + s.unrealizedPnl + s.fees
  return (
    <div
      className="mono"
      style={{
        flex: '0 0 auto',
        display: 'flex',
        gap: 18,
        padding: '5px 14px',
        borderTop: '1px solid var(--border-1)',
        background: 'var(--bg-1)',
        fontSize: 11,
      }}
    >
      <span>
        POSITION <span className="pos">{s.inventory >= 0 ? '+' : ''}{s.inventory} BTC</span>
      </span>
      <span>
        NET <span className={net >= 0 ? 'pos' : 'neg'}>{net >= 0 ? '+' : ''}${net.toFixed(0)}</span>
      </span>
      <span>ORDERS {s.orders}</span>
      <span>FILLS {s.fills}</span>
      <span>LATENCY {s.latencyMs}ms</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
        <span>
          <StatusDot state="warn" /> DATA
        </span>
        <span>
          <StatusDot state="ok" /> ENGINE
        </span>
        <span>
          <StatusDot state="ok" /> RISK
        </span>
        <span className="dim">all values simulated</span>
      </span>
    </div>
  )
}
