import { useEffect, useState } from 'react'

interface LatencySample {
  timestamp: string
  feed: number
  decision: number
  exchange: number
  roundTrip: number
}

interface ExecutionMonitorPanelProps {
  feedLatency: number | null
  decisionLatency: number | null
  orderLatency: number | null
  exchangeResponse: number | null
  roundTrip: number | null
  rejectedCount: number
  cancelledCount: number
  staleCount: number
  droppedEvents: number
  sequenceGaps: number
  reconnects: number
  latencyHistory: LatencySample[]
  environment: 'RESEARCH' | 'PAPER' | 'LIVE'
}

const EMPTY_STATE = {
  title: 'NO STRATEGY LOADED',
  action: 'CREATE STRATEGY',
}

export function ExecutionMonitorPanel(props: ExecutionMonitorPanelProps) {
  const {
    feedLatency, decisionLatency, orderLatency, exchangeResponse,
    roundTrip, rejectedCount, cancelledCount, staleCount,
    droppedEvents, sequenceGaps, reconnects, latencyHistory,
    environment,
  } = props

  if (!environment) {
    return (
      <div className="empty-state">
        <div />
        <h3>{EMPTY_STATE.title}</h3>
        <p>{EMPTY_STATE.action}</p>
      </div>
    )
  }

  return (
    <div className="execution-monitor-panel">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <span>Feed Latency</span>
          <span>{feedLatency != null ? `${feedLatency}ms` : '—'}</span>
        </div>
        <div>
          <span>Decision Latency</span>
          <span>{decisionLatency != null ? `${decisionLatency}ms` : '—'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <span>Order Latency</span>
          <span>{orderLatency != null ? `${orderLatency}ms` : '—'}</span>
        </div>
        <div>
          <span>Exchange Response</span>
          <span>{exchangeResponse != null ? `${exchangeResponse}ms` : '—'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <span>Round-Trip</span>
          <span>{roundTrip != null ? `${roundTrip}ms` : '—'}</span>
        </div>
        <div>
          <span>Rejected</span>
          <span>{rejectedCount}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <span>Cancelled</span>
          <span>{cancelledCount}</span>
        </div>
        <div>
          <span>Stale</span>
          <span>{staleCount}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <span>Dropped Events</span>
          <span>{droppedEvents}</span>
        </div>
        <div>
          <span>Sequence Gaps</span>
          <span>{sequenceGaps}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <span>Reconnects</span>
          <span>{reconnects}</span>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <span>Latency History</span>
        {/* History rendered via small sparkline/multi-line chart per docs/11 §11.6 */}
      </div>
    </div>
  )
}