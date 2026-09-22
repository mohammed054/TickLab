import { useState } from 'react'
import { Panel, MetricRow } from '../shared/Panel'

export function RiskPanel() {
  const [confirming, setConfirming] = useState(false)
  return (
    <Panel title="RISK CONTROLS (MOCK)">
      <MetricRow label="Max position" value="2.0 BTC" />
      <MetricRow label="Max daily loss" value="$500" />
      <MetricRow label="Max drawdown" value="8%" />
      <MetricRow label="Current exposure" value="0.82 BTC" />
      <div style={{ marginTop: 10 }}>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            style={{ width: '100%', padding: '9px 0', background: 'var(--neg-dim)', color: 'var(--neg)', border: '1px solid var(--neg)', borderRadius: 4, fontWeight: 700 }}
          >
            STOP STRATEGY
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setConfirming(false)}
              style={{ flex: 1, padding: '9px 0', background: 'var(--neg)', color: '#160707', border: 'none', borderRadius: 4, fontWeight: 700 }}
            >
              CONFIRM STOP (mock)
            </button>
            <button onClick={() => setConfirming(false)} style={{ flex: 1, padding: '9px 0', background: 'var(--bg-2)', color: 'var(--text-1)', border: '1px solid var(--border-1)', borderRadius: 4 }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </Panel>
  )
}
