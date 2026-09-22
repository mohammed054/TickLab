import { useState } from 'react'
import { Panel, MetricRow, StatusDot } from '../shared/Panel'

export function DatasetPanel() {
  const [start, setStart] = useState('2024-08-08')
  const [end, setEnd] = useState('2024-08-09')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="DATASET SELECTOR (MOCK — NO REAL FILES)">
        <MetricRow label="Exchange" value="Binance" />
        <MetricRow label="Market" value="USDT Futures" />
        <MetricRow label="Symbol" value="BTCUSDT" />
        <MetricRow label="Data" value="L2 + Trades" />
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <label style={{ flex: 1, fontSize: 10.5 }} className="dim">
            Start
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={{ width: '100%', marginTop: 2, background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--border-1)', borderRadius: 3, padding: 4 }}
            />
          </label>
          <label style={{ flex: 1, fontSize: 10.5 }} className="dim">
            End
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={{ width: '100%', marginTop: 2, background: 'var(--bg-2)', color: 'var(--text-0)', border: '1px solid var(--border-1)', borderRadius: 3, padding: 4 }}
            />
          </label>
        </div>
      </Panel>

      <Panel
        title="DATA QUALITY (MOCK)"
        right={
          <span className="mono" style={{ fontSize: 10 }}>
            <StatusDot state="ok" /> VALID (simulated check)
          </span>
        }
      >
        <MetricRow label="Total events" value="48,291,204" />
        <MetricRow label="Trades" value="6,182,003" />
        <MetricRow label="Order book updates" value="41,882,110" />
        <MetricRow label="Missing intervals" value="0" />
        <MetricRow label="Sequence gaps" value="0" />
        <MetricRow label="Duplicate events" value="0" />
      </Panel>

      <Panel title="RAW DATA PIPELINE (MOCK)">
        <div className="mono dim" style={{ fontSize: 10.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {['RAW EXCHANGE DATA', 'VALIDATION', 'NORMALIZATION', 'ORDER BOOK RECONSTRUCTION', 'TRADE ALIGNMENT', 'TIMESTAMP VALIDATION', 'HFTBACKTEST FORMAT', 'READY'].map(
            (s, i, arr) => (
              <span key={s}>
                <StatusDot state="ok" /> {s}
                {i < arr.length - 1 ? ' ↓' : ''}
              </span>
            )
          )}
        </div>
      </Panel>
    </div>
  )
}
