import { Panel, MetricRow } from '../shared/Panel'

export function AnalyticsPanel() {
  const buckets = [
    ['Low', '+$182', '41%'],
    ['Normal', '+$310', '38%'],
    ['High', '-$64', '29%'],
    ['Extreme', '-$210', '18%'],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="VOLATILITY BUCKET P&L (MOCK)">
        {buckets.map(([b, pnl, fill]) => (
          <div key={b} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11.5 }}>
            <span className="dim">{b}</span>
            <span className="mono">
              <span className={pnl.startsWith('-') ? 'neg' : 'pos'}>{pnl}</span>
              <span className="dim" style={{ marginLeft: 8 }}>
                fill {fill}
              </span>
            </span>
          </div>
        ))}
      </Panel>
      <Panel title="AI RESEARCH ASSISTANT (MOCK — NOT A REAL MODEL CALL)">
        <p style={{ margin: '0 0 8px', color: 'var(--text-1)' }}>
          During the highest-volatility intervals, simulated adverse-selection losses increased while average spread capture stayed
          roughly flat. A possible experiment: widen quotes when realized volatility exceeds its 90th percentile.
        </p>
        <button
          style={{
            fontSize: 11,
            padding: '6px 10px',
            background: 'var(--accent)',
            color: '#0d0f12',
            border: 'none',
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          CREATE EXPERIMENT (mock)
        </button>
      </Panel>
      <Panel title="LATENCY DISTRIBUTION (MOCK)">
        <MetricRow label="p50" value="14.2ms" />
        <MetricRow label="p90" value="28.6ms" />
        <MetricRow label="p99" value="61.3ms" />
      </Panel>
    </div>
  )
}
