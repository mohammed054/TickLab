import { Trade } from '../../contracts'
import { MetricRow, Panel } from '../shared/Panel'

export function OrderFlowPanel({ trades }: { trades: Trade[] }) {
  const buyVol = trades.filter((t) => t.side === 'BUY').reduce((s, t) => s + t.size, 0)
  const sellVol = trades.filter((t) => t.side === 'SELL').reduce((s, t) => s + t.size, 0)
  const totalVol = buyVol + sellVol || 1
  const delta = buyVol - sellVol
  const buyPct = (buyVol / totalVol) * 100
  const avgSize = trades.length ? totalVol / trades.length : 0

  return (
    <Panel title="ORDER FLOW & DELTA" style={{ flex: '0 0 220px', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Cumulative Delta Visualizer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }} className="mono">
            <span className="pos">BUY: {buyVol.toFixed(2)} BTC</span>
            <span className="neg">SELL: {sellVol.toFixed(2)} BTC</span>
          </div>
          <div
            style={{
              display: 'flex',
              height: 6,
              background: 'var(--color-bg-base)',
              borderRadius: '2px',
              overflow: 'hidden',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ width: `${buyPct}%`, background: 'var(--color-positive)' }} />
            <div style={{ width: `${100 - buyPct}%`, background: 'var(--color-negative)' }} />
          </div>
        </div>

        <MetricRow
          label="Cumulative Delta"
          value={`${delta >= 0 ? '+' : ''}${delta.toFixed(2)} BTC`}
          valueClass={delta >= 0 ? 'pos' : 'neg'}
        />
        <MetricRow label="Trades / sec" value={(trades.length / 6).toFixed(1)} />
        <MetricRow label="Avg trade size" value={`${avgSize.toFixed(3)} BTC`} />
        <MetricRow
          label="Aggressive ratio"
          value={`${buyPct.toFixed(0)}% Buy / ${(100 - buyPct).toFixed(0)}% Sell`}
        />
        <MetricRow label="Large blocks (>1 BTC)" value={trades.filter((t) => t.size >= 1).length.toString()} />
      </div>
    </Panel>
  )
}
