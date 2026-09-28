import { useMemo, useState } from 'react'
import { timestampNsToMs } from '../../contracts'
import { useMarketRuntime } from '../../state/appStore'
import { useWorkspace } from '../../state/useWorkspace'
import { MetricRow, Panel } from '../shared/Panel'

export function EventInspector() {
  const { events, orderBook, strategy } = useMarketRuntime()
  const [workspace] = useWorkspace()
  const [showRaw, setShowRaw] = useState(false)
  const orderedEvents = useMemo(() => [...events].sort((left, right) => left.sequence - right.sequence), [events])
  const selectedIndex = useMemo(() => {
    if (workspace.replay?.currentEventId) {
      const replayIndex = orderedEvents.findIndex((event) => event.eventId === workspace.replay?.currentEventId)
      if (replayIndex >= 0) return replayIndex
    }
    if (workspace.selectedTradeId) {
      const tradeIndex = orderedEvents.findIndex((event) => event.eventId === workspace.selectedTradeId)
      if (tradeIndex >= 0) return tradeIndex
    }
    if (workspace.timestamp) {
      const timestampIndex = orderedEvents.findIndex((event) => event.timestampNs === workspace.timestamp)
      if (timestampIndex >= 0) return timestampIndex
    }
    return -1
  }, [orderedEvents, workspace.replay?.currentEventId, workspace.selectedTradeId, workspace.timestamp])
  const selectedEvent = selectedIndex >= 0 ? orderedEvents[selectedIndex] : null
  const contextEvents =
    selectedIndex >= 0 ? orderedEvents.slice(Math.max(0, selectedIndex - 4), selectedIndex + 5) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="NANOSECOND EVENT INSPECTOR">
        {selectedEvent ? (
          <>
            <MetricRow
              label="Timestamp (UTC)"
              value={new Date(timestampNsToMs(selectedEvent.timestampNs)).toISOString().slice(11, 23)}
            />
            <MetricRow label="Event Classification" value={selectedEvent.type.toUpperCase()} />
            <MetricRow label="Event Price" value={selectedEvent.price ? `$${selectedEvent.price.toFixed(1)}` : '—'} />
            <MetricRow label="Quantity (BTC)" value={selectedEvent.size ? `${selectedEvent.size.toFixed(3)} BTC` : '—'} />
            <MetricRow
              label="Aggressor Side"
              value={selectedEvent.tradeSide ?? selectedEvent.side?.toUpperCase() ?? '—'}
              valueClass={
                selectedEvent.tradeSide === 'BUY'
                  ? 'pos'
                  : selectedEvent.tradeSide === 'SELL'
                  ? 'neg'
                  : undefined
              }
            />
            <MetricRow label="Order Trace ID" value={selectedEvent.orderId ?? selectedEvent.eventId} />
            <MetricRow label="Feed Sequence #" value={`#${selectedEvent.sequence.toLocaleString()}`} />
            <MetricRow
              label="Queue Position Ahead"
              value={selectedEvent.queueAhead === undefined ? '—' : `${selectedEvent.queueAhead.toFixed(2)} BTC`}
            />

            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setShowRaw((value) => !value)}
                style={{
                  fontSize: 'var(--font-size-2xs)',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-bg-control)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {showRaw ? 'HIDE RAW EVENT JSON' : 'VIEW RAW EVENT PAYLOAD'}
              </button>
              {showRaw && (
                <pre
                  className="mono"
                  style={{
                    marginTop: 6,
                    padding: 8,
                    background: 'var(--color-bg-base)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '10px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'var(--color-focus)',
                  }}
                >
                  {JSON.stringify(selectedEvent, null, 2)}
                </pre>
              )}
            </div>
          </>
        ) : (
          <div className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>
            Select a trade from the Tape, Chart, or Replay timeline to inspect event payload.
          </div>
        )}
      </Panel>

      <Panel title="MARKET DEPTH STATE AT TICK">
        <MetricRow label="Mid-Market Price" value={`$${orderBook.mid.toFixed(1)}`} />
        <MetricRow label="Bid-Ask Spread" value={`$${orderBook.spread.toFixed(1)}`} />
        <MetricRow label="Sequence ID" value={`#${orderBook.sequence.toLocaleString()}`} />
        <MetricRow
          label="Top-of-Book Bid Depth"
          value={`${orderBook.bids.reduce((total, level) => total + level.size, 0).toFixed(2)} BTC`}
        />
      </Panel>

      <Panel title="STRATEGY TELEMETRY AT TICK">
        <MetricRow label="Strategy Engine" value={`${strategy.name} ${strategy.version}`} />
        <MetricRow
          label="Inventory Exposure"
          value={`${strategy.inventory >= 0 ? '+' : ''}${strategy.inventory} BTC`}
          valueClass={strategy.inventory >= 0 ? 'pos' : 'neg'}
        />
        <MetricRow label="Active Working Orders" value={strategy.orders.toLocaleString()} />
        <MetricRow label="Execution Latency" value={`${strategy.latencyMs.toFixed(1)}ms`} />
      </Panel>

      <Panel title="SURROUNDING EVENT STREAM (±4 TICKS)">
        {contextEvents.length > 0 ? (
          contextEvents.map((event) => (
            <div
              key={event.eventId}
              className="mono"
              style={{
                display: 'flex',
                gap: 8,
                padding: '2px 4px',
                fontSize: '10px',
                borderBottom: '1px solid var(--color-border-subtle)',
                background: event.eventId === selectedEvent?.eventId ? 'var(--color-bg-control-active)' : 'transparent',
              }}
            >
              <span className="dim">
                {new Date(timestampNsToMs(event.timestampNs)).toISOString().slice(11, 23)}
              </span>
              <span style={{ width: 100, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {event.type.toUpperCase()}
              </span>
              <span>
                {event.price?.toFixed(1) ?? '—'} × {event.size?.toFixed(3) ?? '—'}
              </span>
            </div>
          ))
        ) : (
          <div className="dim">No event context available.</div>
        )}
      </Panel>
    </div>
  )
}
