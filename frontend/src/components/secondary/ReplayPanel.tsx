import { useEffect, useMemo, useState } from 'react'
import { MarketEvent, timestampNsToMs } from '../../contracts'
import { useMarketRuntime } from '../../state/appStore'
import { useWorkspace } from '../../state/useWorkspace'
import { MetricRow, Panel } from '../shared/Panel'

const SPEEDS = [0.01, 0.1, 0.5, 1, 5, 10, 100, 1000] as const
type ReplaySpeed = (typeof SPEEDS)[number]

function formatTimestamp(timestampNs: string | null): string {
  if (!timestampNs) return '—'
  return new Date(timestampNsToMs(timestampNs)).toISOString().slice(11, 23)
}

export function ReplayPanel() {
  const { events } = useMarketRuntime()
  const [workspace, updateWorkspace] = useWorkspace()
  const orderedEvents = useMemo(() => [...events].sort((left, right) => left.sequence - right.sequence), [events])
  const [cursor, setCursor] = useState(0)
  const [rangeStartIndex, setRangeStartIndex] = useState(0)
  const [rangeEndIndex, setRangeEndIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<ReplaySpeed>(1)
  const safeStartIndex = Math.min(rangeStartIndex, Math.max(orderedEvents.length - 1, 0))
  const safeEndIndex = Math.max(safeStartIndex, Math.min(rangeEndIndex, Math.max(orderedEvents.length - 1, 0)))
  const rangeStartNs = orderedEvents[safeStartIndex]?.timestampNs ?? '0'
  const rangeEndNs = orderedEvents[safeEndIndex]?.timestampNs ?? '0'
  const currentEvent = orderedEvents[cursor]

  useEffect(() => {
    if (orderedEvents.length === 0) {
      setRangeStartIndex(0)
      setRangeEndIndex(0)
      setCursor(0)
      return
    }
    setRangeStartIndex((current) => Math.min(current, orderedEvents.length - 1))
    setRangeEndIndex((current) => Math.max(0, Math.min(current || orderedEvents.length - 1, orderedEvents.length - 1)))
    setCursor((current) => Math.min(current, orderedEvents.length - 1))
  }, [orderedEvents.length])

  const publishCursor = (nextCursor: number, nextPlaying = playing) => {
    const boundedCursor = Math.min(safeEndIndex, Math.max(safeStartIndex, nextCursor))
    const nextEvent = orderedEvents[boundedCursor]
    if (!nextEvent) return
    setCursor(boundedCursor)
    updateWorkspace({
      timestamp: nextEvent.timestampNs,
      selectedTradeId: nextEvent.type === 'trade' || nextEvent.type === 'fill' ? nextEvent.eventId : workspace.selectedTradeId,
      replay: {
        isPlaying: nextPlaying,
        speed,
        rangeStart: rangeStartNs,
        rangeEnd: rangeEndNs,
        currentEventId: nextEvent.eventId,
        currentTimestampNs: nextEvent.timestampNs,
      },
    })
  }

  useEffect(() => {
    if (!playing || orderedEvents.length === 0) return
    const timer = window.setInterval(() => {
      setCursor((current) => {
        const next = Math.min(safeEndIndex, Math.max(safeStartIndex, current + 1))
        const nextEvent = orderedEvents[next]
        if (nextEvent) {
          updateWorkspace({
            timestamp: nextEvent.timestampNs,
            selectedTradeId: nextEvent.type === 'trade' || nextEvent.type === 'fill' ? nextEvent.eventId : workspace.selectedTradeId,
            replay: {
              isPlaying: next < safeEndIndex,
              speed,
              rangeStart: rangeStartNs,
              rangeEnd: rangeEndNs,
              currentEventId: nextEvent.eventId,
              currentTimestampNs: nextEvent.timestampNs,
            },
          })
        }
        if (next >= safeEndIndex) setPlaying(false)
        return next
      })
    }, Math.max(40, 1000 / speed))
    return () => window.clearInterval(timer)
  }, [playing, speed, orderedEvents, safeStartIndex, safeEndIndex, rangeStartNs, rangeEndNs, updateWorkspace, workspace.selectedTradeId])

  useEffect(() => {
    if (playing || !workspace.timestamp || orderedEvents.length === 0) return
    const index = orderedEvents.findIndex((event) => event.timestampNs === workspace.timestamp)
    if (index >= safeStartIndex && index <= safeEndIndex) setCursor(index)
  }, [workspace.timestamp, playing, orderedEvents, safeStartIndex, safeEndIndex])

  const step = (amount: number) => {
    const next = Math.min(Math.max(cursor + amount, safeStartIndex), safeEndIndex)
    setPlaying(false)
    publishCursor(next, false)
  }

  const stepTo = (types: MarketEvent['type'][]) => {
    const next = orderedEvents.findIndex((event, index) => index > cursor && index <= safeEndIndex && types.includes(event.type))
    if (next >= 0) {
      setPlaying(false)
      publishCursor(next, false)
    }
  }

  const togglePlaying = () => {
    const nextPlaying = !playing
    setPlaying(nextPlaying)
    updateWorkspace({ replay: { isPlaying: nextPlaying, speed, rangeStart: rangeStartNs, rangeEnd: rangeEndNs, currentEventId: currentEvent?.eventId ?? null, currentTimestampNs: currentEvent?.timestampNs ?? null } })
  }

  useEffect(() => {
    const onToggle = () => togglePlaying()
    const onStep = (event: Event) => step((event as CustomEvent<number>).detail)
    window.addEventListener('ticklab:replay-toggle', onToggle)
    window.addEventListener('ticklab:replay-step', onStep)
    return () => { window.removeEventListener('ticklab:replay-toggle', onToggle); window.removeEventListener('ticklab:replay-step', onStep) }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="REPLAY CONTROLS (MOCK)">
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '6px 0' }}>
          <button type="button" aria-label="First event" onClick={() => { setPlaying(false); publishCursor(safeStartIndex, false) }} disabled={orderedEvents.length === 0} style={transportStyle}>⏮</button>
          <button type="button" aria-label="Previous event" onClick={() => step(-1)} disabled={orderedEvents.length === 0} style={transportStyle}>◀</button>
          <button type="button" aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={togglePlaying} disabled={orderedEvents.length === 0} style={{ ...transportStyle, color: 'var(--color-info)' }}>{playing ? '⏸' : '▶'}</button>
          <button type="button" aria-label="Next event" onClick={() => step(1)} disabled={orderedEvents.length === 0} style={transportStyle}>⏭</button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {SPEEDS.map((value) => <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)} style={{ ...transportStyle, fontSize: 10, padding: '3px 6px', background: speed === value ? 'var(--color-bg-control)' : 'transparent', color: speed === value ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{value}x</button>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: 6, alignItems: 'center', marginTop: 8, fontSize: 9.5 }}>
          <span className="dim">START</span><input aria-label="Replay range start" type="range" min={0} max={Math.max(orderedEvents.length - 1, 0)} value={safeStartIndex} onChange={(event) => { const next = Math.min(Number(event.target.value), safeEndIndex); setRangeStartIndex(next); setCursor(next); updateWorkspace({ replay: { isPlaying: false, speed, rangeStart: orderedEvents[next]?.timestampNs ?? '0', rangeEnd: rangeEndNs, currentEventId: orderedEvents[next]?.eventId ?? null, currentTimestampNs: orderedEvents[next]?.timestampNs ?? null } }) }} />
          <span className="dim">END</span><input aria-label="Replay range end" type="range" min={0} max={Math.max(orderedEvents.length - 1, 0)} value={safeEndIndex} onChange={(event) => { const next = Math.max(Number(event.target.value), safeStartIndex); setRangeEndIndex(next); setCursor((current) => Math.min(current, next)); updateWorkspace({ replay: { isPlaying: false, speed, rangeStart: rangeStartNs, rangeEnd: orderedEvents[next]?.timestampNs ?? '0', currentEventId: currentEvent?.eventId ?? null, currentTimestampNs: currentEvent?.timestampNs ?? null } }) }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }}>
          <button type="button" onClick={() => stepTo(['trade', 'fill'])} style={actionStyle}>NEXT TRADE</button>
          <button type="button" onClick={() => stepTo(['strategy_decision', 'order_submit'])} style={actionStyle}>NEXT STRATEGY ACTION</button>
        </div>
      </Panel>

      <Panel title="EVENT INSPECTOR (MOCK)">
        {currentEvent ? <>
          <MetricRow label="Timestamp" value={formatTimestamp(currentEvent.timestampNs)} />
          <MetricRow label="Event type" value={currentEvent.type.toUpperCase()} />
          <MetricRow label="Sequence" value={currentEvent.sequence.toLocaleString()} />
          <MetricRow label="Price" value={currentEvent.price?.toFixed(1) ?? '—'} />
          <MetricRow label="Size" value={currentEvent.size?.toFixed(3) ?? '—'} />
          <MetricRow label="Order ID" value={currentEvent.orderId ?? currentEvent.eventId} />
          <MetricRow label="Queue estimate" value={currentEvent.queueAhead?.toFixed(2) ?? '—'} />
        </> : <div className="dim">No replay events available.</div>}
      </Panel>

      <Panel title="TRADE INVESTIGATION — MARKOUT (MOCK)">
        {currentEvent && (currentEvent.type === 'trade' || currentEvent.type === 'fill') ? <>
          <MetricRow label="Fill price" value={currentEvent.fillPrice?.toFixed(1) ?? currentEvent.price?.toFixed(1) ?? '—'} />
          <MetricRow label="Event ID" value={currentEvent.eventId} />
          <MetricRow label="Trade side" value={currentEvent.tradeSide ?? '—'} valueClass={currentEvent.tradeSide === 'BUY' ? 'pos' : currentEvent.tradeSide === 'SELL' ? 'neg' : undefined} />
        </> : <div className="dim">Use Next Trade or select a trade to inspect markout data.</div>}
      </Panel>
    </div>
  )
}

const transportStyle: React.CSSProperties = { minWidth: 30, padding: '4px 7px', background: 'var(--color-bg-control)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', fontSize: 15 }
const actionStyle: React.CSSProperties = { padding: '4px 7px', background: 'var(--color-bg-control)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', fontSize: 9 }
