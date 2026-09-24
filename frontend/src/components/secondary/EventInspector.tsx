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
  const contextEvents = selectedIndex >= 0 ? orderedEvents.slice(Math.max(0, selectedIndex - 4), selectedIndex + 5) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="EVENT INSPECTOR (MOCK)">
        {selectedEvent ? <>
          <MetricRow label="Timestamp" value={new Date(timestampNsToMs(selectedEvent.timestampNs)).toISOString().slice(11, 23)} />
          <MetricRow label="Event type" value={selectedEvent.type.toUpperCase()} />
          <MetricRow label="Price" value={selectedEvent.price?.toFixed(1) ?? '—'} />
          <MetricRow label="Size" value={selectedEvent.size?.toFixed(3) ?? '—'} />
          <MetricRow label="Side" value={selectedEvent.tradeSide ?? selectedEvent.side?.toUpperCase() ?? '—'} valueClass={selectedEvent.tradeSide === 'BUY' ? 'pos' : selectedEvent.tradeSide === 'SELL' ? 'neg' : undefined} />
          <MetricRow label="Order ID" value={selectedEvent.orderId ?? selectedEvent.eventId} />
          <MetricRow label="Sequence" value={selectedEvent.sequence.toLocaleString()} />
           <MetricRow label="Queue ahead" value={selectedEvent.queueAhead === undefined ? '—' : `${selectedEvent.queueAhead.toFixed(2)} BTC`} />

          <div style={{ marginTop: 6 }}>
            <button type="button" onClick={() => setShowRaw((value) => !value)} style={{ fontSize: 10.5, padding: '4px 8px', borderRadius: 3, border: '1px solid var(--border-1)', background: 'transparent', color: 'var(--text-1)' }}>{showRaw ? '[ hide raw event ]' : '[ view raw event ]'}</button>
            {showRaw && <pre className="mono dim" style={{ marginTop: 6, fontSize: 10.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(selectedEvent, null, 2)}</pre>}
          </div>
        </> : <div className="dim">Commit a timestamp, trade, or replay event to inspect it here.</div>}
      </Panel>

      <Panel title="MARKET STATE AT EVENT (MOCK)">
        <MetricRow label="Mid" value={orderBook.mid.toFixed(1)} />
        <MetricRow label="Spread" value={orderBook.spread.toFixed(1)} />
        <MetricRow label="Sequence" value={orderBook.sequence.toLocaleString()} />
        <MetricRow label="Visible bid depth" value={orderBook.bids.reduce((total, level) => total + level.size, 0).toFixed(2)} />
      </Panel>

      <Panel title="STRATEGY STATE AT EVENT (MOCK)">
        <MetricRow label="Strategy" value={`${strategy.name} ${strategy.version}`} />
        <MetricRow label="Inventory" value={`${strategy.inventory >= 0 ? '+' : ''}${strategy.inventory} BTC`} />
        <MetricRow label="Open orders" value={strategy.orders.toLocaleString()} />
        <MetricRow label="Latency" value={`${strategy.latencyMs}ms`} />
      </Panel>

      <Panel title="SURROUNDING EVENTS (MOCK CONTEXT WINDOW)">
        {contextEvents.length > 0 ? contextEvents.map((event) => <div key={event.eventId} className="mono" style={{ display: 'flex', gap: 8, padding: '2px 0', fontSize: 10.5, borderBottom: '1px solid var(--border-1)' }}><span className="dim">{new Date(timestampNsToMs(event.timestampNs)).toISOString().slice(11, 23)}</span><span style={{ width: 100 }}>{event.type.toUpperCase()}</span><span>{event.price?.toFixed(1) ?? '—'} × {event.size?.toFixed(3) ?? '—'}</span></div>) : <div className="dim">No event context available.</div>}
      </Panel>
    </div>
  )
}
