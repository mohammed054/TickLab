import { useEffect, useMemo, useState } from 'react'
import { MarketEvent, timestampNsToMs } from '../../contracts'
import { useMarketRuntime } from '../../state/appStore'
import { useWorkspace } from '../../state/useWorkspace'
import { MetricRow, Panel } from '../shared/Panel'

const SPEEDS = [0.1, 0.5, 1, 5, 10, 50, 100, 1000] as const
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
      selectedTradeId:
        nextEvent.type === 'trade' || nextEvent.type === 'fill' ? nextEvent.eventId : workspace.selectedTradeId,
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
            selectedTradeId:
              nextEvent.type === 'trade' || nextEvent.type === 'fill'
                ? nextEvent.eventId
                : workspace.selectedTradeId,
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
    }, Math.max(30, 1000 / speed))
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
    const next = orderedEvents.findIndex(
      (event, index) => index > cursor && index <= safeEndIndex && types.includes(event.type)
    )
    if (next >= 0) {
      setPlaying(false)
      publishCursor(next, false)
    }
  }

  const togglePlaying = () => {
    const nextPlaying = !playing
    setPlaying(nextPlaying)
    updateWorkspace({
      replay: {
        isPlaying: nextPlaying,
        speed,
        rangeStart: rangeStartNs,
        rangeEnd: rangeEndNs,
        currentEventId: currentEvent?.eventId ?? null,
        currentTimestampNs: currentEvent?.timestampNs ?? null,
      },
    })
  }

  useEffect(() => {
    const onToggle = () => togglePlaying()
    const onStep = (event: Event) => step((event as CustomEvent<number>).detail)
    window.addEventListener('ticklab:replay-toggle', onToggle)
    window.addEventListener('ticklab:replay-step', onStep)
    return () => {
      window.removeEventListener('ticklab:replay-toggle', onToggle)
      window.removeEventListener('ticklab:replay-step', onStep)
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="HIGH-PRECISION REPLAY TRANSPORT">
        {/* Playback Transport Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '4px 0' }}>
          <button
            type="button"
            aria-label="First event"
            onClick={() => {
              setPlaying(false)
              publishCursor(safeStartIndex, false)
            }}
            disabled={orderedEvents.length === 0}
            style={transportStyle}
          >
            ⏮
          </button>
          <button
            type="button"
            aria-label="Step back 1 tick"
            onClick={() => step(-1)}
            disabled={orderedEvents.length === 0}
            style={transportStyle}
          >
            ◀
          </button>
          <button
            type="button"
            aria-label={playing ? 'Pause replay' : 'Play replay'}
            onClick={togglePlaying}
            disabled={orderedEvents.length === 0}
            style={{ ...transportStyle, color: 'var(--color-focus)', minWidth: 44, fontWeight: 700 }}
          >
            {playing ? '⏸ PAUSE' : '▶ PLAY'}
          </button>
          <button
            type="button"
            aria-label="Step forward 1 tick"
            onClick={() => step(1)}
            disabled={orderedEvents.length === 0}
            style={transportStyle}
          >
            ▶
          </button>
          <button
            type="button"
            aria-label="Last event"
            onClick={() => {
              setPlaying(false)
              publishCursor(safeEndIndex, false)
            }}
            disabled={orderedEvents.length === 0}
            style={transportStyle}
          >
            ⏭
          </button>
        </div>

        {/* Speed Selector */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={speed === value}
              onClick={() => setSpeed(value)}
              style={{
                ...transportStyle,
                fontSize: '10px',
                padding: '2px 6px',
                background: speed === value ? 'var(--color-bg-control-active)' : 'transparent',
                color: speed === value ? 'var(--color-focus)' : 'var(--color-text-muted)',
                borderColor: speed === value ? 'var(--color-border-accent)' : 'var(--color-border-subtle)',
                fontWeight: speed === value ? 700 : 400,
              }}
            >
              {value}x
            </button>
          ))}
        </div>

        {/* Range Scrubber */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto 1fr',
            gap: 6,
            alignItems: 'center',
            marginTop: 8,
            fontSize: '9.5px',
          }}
        >
          <span className="dim mono">START</span>
          <input
            aria-label="Replay range start"
            type="range"
            min={0}
            max={Math.max(orderedEvents.length - 1, 0)}
            value={safeStartIndex}
            onChange={(event) => {
              const next = Math.min(Number(event.target.value), safeEndIndex)
              setRangeStartIndex(next)
              setCursor(next)
              updateWorkspace({
                replay: {
                  isPlaying: false,
                  speed,
                  rangeStart: orderedEvents[next]?.timestampNs ?? '0',
                  rangeEnd: rangeEndNs,
                  currentEventId: orderedEvents[next]?.eventId ?? null,
                  currentTimestampNs: orderedEvents[next]?.timestampNs ?? null,
                },
              })
            }}
          />
          <span className="dim mono">END</span>
          <input
            aria-label="Replay range end"
            type="range"
            min={0}
            max={Math.max(orderedEvents.length - 1, 0)}
            value={safeEndIndex}
            onChange={(event) => {
              const next = Math.max(Number(event.target.value), safeStartIndex)
              setRangeEndIndex(next)
              setCursor((current) => Math.min(current, next))
              updateWorkspace({
                replay: {
                  isPlaying: false,
                  speed,
                  rangeStart: rangeStartNs,
                  rangeEnd: orderedEvents[next]?.timestampNs ?? '0',
                  currentEventId: currentEvent?.eventId ?? null,
                  currentTimestampNs: currentEvent?.timestampNs ?? null,
                },
              })
            }}
          />
        </div>

        {/* Event Type Jump Controls */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }}>
          <button type="button" onClick={() => stepTo(['trade', 'fill'])} style={actionStyle}>
            NEXT TRADE / FILL
          </button>
          <button
            type="button"
            onClick={() => stepTo(['strategy_decision', 'order_submit'])}
            style={actionStyle}
          >
            NEXT STRATEGY DECISION
          </button>
        </div>
      </Panel>

      <Panel title="TICK EVENT INSPECTOR">
        {currentEvent ? (
          <>
            <MetricRow label="Event Timestamp (UTC)" value={formatTimestamp(currentEvent.timestampNs)} />
            <MetricRow label="Event Class" value={currentEvent.type.toUpperCase()} />
            <MetricRow label="Feed Sequence #" value={`#${currentEvent.sequence.toLocaleString()}`} />
            <MetricRow label="Event Price" value={currentEvent.price ? `$${currentEvent.price.toFixed(1)}` : '—'} />
            <MetricRow label="Event Size" value={currentEvent.size ? `${currentEvent.size.toFixed(3)} BTC` : '—'} />
            <MetricRow label="Order / Event ID" value={currentEvent.orderId ?? currentEvent.eventId} />
            <MetricRow
              label="Queue Position Ahead"
              value={currentEvent.queueAhead ? `${currentEvent.queueAhead.toFixed(2)} BTC` : '—'}
            />
          </>
        ) : (
          <div className="dim">No replay events available.</div>
        )}
      </Panel>

      <Panel title="TRADE INVESTIGATION & POST-FILL MARKOUT">
        {currentEvent && (currentEvent.type === 'trade' || currentEvent.type === 'fill') ? (
          <>
            <MetricRow
              label="Fill Price"
              value={
                currentEvent.fillPrice
                  ? `$${currentEvent.fillPrice.toFixed(1)}`
                  : currentEvent.price
                  ? `$${currentEvent.price.toFixed(1)}`
                  : '—'
              }
            />
            <MetricRow label="Event Trace ID" value={currentEvent.eventId} />
            <MetricRow
              label="Aggressive Side"
              value={currentEvent.tradeSide ?? '—'}
              valueClass={
                currentEvent.tradeSide === 'BUY'
                  ? 'pos'
                  : currentEvent.tradeSide === 'SELL'
                  ? 'neg'
                  : undefined
              }
            />
          </>
        ) : (
          <div className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>
            Advance replay or select a trade to inspect granular post-fill markout metrics.
          </div>
        )}
      </Panel>
    </div>
  )
}

const transportStyle: React.CSSProperties = {
  minWidth: 32,
  padding: '3px 8px',
  background: 'var(--color-bg-control)',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-xs)',
  fontSize: '12px',
  cursor: 'pointer',
}

const actionStyle: React.CSSProperties = {
  padding: '4px 8px',
  background: 'var(--color-bg-control)',
  color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-xs)',
  fontSize: 'var(--font-size-2xs)',
  fontWeight: 600,
  cursor: 'pointer',
}
