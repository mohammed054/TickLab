import { useState } from 'react'
import { Panel, MetricRow } from '../shared/Panel'
import { useWorkspace } from '../../state/useWorkspace'
import { genMockTrades } from '../../mock/mockData'

// Full Event Inspector view per docs/08 §8.21. Reads the same Sync Bus
// timestamp/trade selection as ReplayPanel's folded inspector so the two never
// disagree; surrounding-event context is mock trade data.
export function EventInspector() {
  const [ws] = useWorkspace()
  const [showRaw, setShowRaw] = useState(false)
  const [context] = useState(() => genMockTrades(9))

  const orderId = ws.selectedTradeId ?? 'MOCK-ORD-0042'
  const rawEvent = {
    type: 'TRADE',
    price: 112438.2,
    size: 0.42,
    side: 'BUY',
    order_id: orderId,
    sequence: 91827361,
    timestamp_ms: ws.timestampMs,
    source: 'mock (no real feed)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="EVENT INSPECTOR (MOCK)">
        {ws.timestampMs ? (
          <>
            <MetricRow label="Timestamp" value={new Date(ws.timestampMs).toISOString().slice(11, 23)} />
            <MetricRow label="Event type" value="TRADE" />
            <MetricRow label="Price" value="112,438.2" />
            <MetricRow label="Size" value="0.42 BTC" />
            <MetricRow label="Side" value="BUY" valueClass="pos" />
            <MetricRow label="Order ID" value={orderId} />
            <MetricRow label="Sequence" value="91,827,361" />
            <MetricRow label="Latency" value="18.4ms" />
            <MetricRow label="Queue estimate" value="4.82 BTC ahead" />
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() => setShowRaw((v) => !v)}
                style={{
                  fontSize: 10.5,
                  padding: '4px 8px',
                  borderRadius: 3,
                  border: '1px solid var(--border-1)',
                  background: 'transparent',
                  color: 'var(--text-1)',
                }}
              >
                {showRaw ? '[ hide raw event ]' : '[ view raw event ]'}
              </button>
              {showRaw && (
                <pre
                  className="mono dim"
                  style={{ marginTop: 6, fontSize: 10.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {JSON.stringify(rawEvent, null, 2)}
                </pre>
              )}
            </div>
          </>
        ) : (
          <div className="dim">Commit a timestamp from Main (click a candle or a trade) to inspect it here.</div>
        )}
      </Panel>

      <Panel title="STRATEGY STATE AT EVENT (MOCK)">
        <MetricRow label="Inventory" value="+0.18 BTC" />
        <MetricRow label="Open orders" value="2 (1 bid / 1 ask)" />
        <MetricRow label="Spread setting" value="5 ticks" />
      </Panel>

      <Panel title="SURROUNDING EVENTS (MOCK CONTEXT WINDOW)">
        {context.map((t) => (
          <div
            key={t.id}
            className="mono"
            style={{ display: 'flex', gap: 8, padding: '2px 0', fontSize: 10.5, borderBottom: '1px solid var(--border-1)' }}
          >
            <span className="dim">{new Date(t.t).toISOString().slice(11, 23)}</span>
            <span className={t.side === 'BUY' ? 'pos' : 'neg'} style={{ width: 36 }}>
              {t.side}
            </span>
            <span>
              {t.price.toLocaleString()} × {t.size}
            </span>
          </div>
        ))}
      </Panel>
    </div>
  )
}
