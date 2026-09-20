import { Panel } from '../../shared/design-system/Panel'
import { MetricRow } from '../../shared/design-system/MetricRow'

interface ExecutionMonitorProps {
  feedLatencyMs: number | null
  decisionLatencyMs: number | null
  orderLatencyMs: number | null
  exchangeResponseMs: number | null
  roundTripMs: number | null
  rejectedCount: number
  cancelledCount: number
  staleCount: number
  droppedEvents: number
  sequenceGaps: number
  reconnects: number
  missingData: number
}

export function ExecutionMonitorPanel({
  feedLatencyMs,
  decisionLatencyMs,
  orderLatencyMs,
  exchangeResponseMs,
  roundTripMs,
  rejectedCount,
  cancelledCount,
  staleCount,
  droppedEvents,
  sequenceGaps,
  reconnects,
  missingData,
}: ExecutionMonitorProps) {
  const fmt = (v: number | null) => (v != null ? `${v}ms` : '—')

  return (
    <Panel header="Execution / System">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <MetricRow label="Feed Latency" value={fmt(feedLatencyMs)} />
        <MetricRow label="Decision Latency" value={fmt(decisionLatencyMs)} />
        <MetricRow label="Order Latency" value={fmt(orderLatencyMs)} />
        <MetricRow label="Exchange RT" value={fmt(exchangeResponseMs)} />
        <MetricRow label="Round-Trip" value={fmt(roundTripMs)} />
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
        <MetricRow label="Rejected" value={rejectedCount} color={rejectedCount > 0 ? 'var(--color-negative)' : undefined} />
        <MetricRow label="Cancelled" value={cancelledCount} />
        <MetricRow label="Stale" value={staleCount} color={staleCount > 0 ? 'var(--color-warning)' : undefined} />
        <MetricRow label="Dropped Events" value={droppedEvents} color={droppedEvents > 0 ? 'var(--color-negative)' : undefined} />
        <MetricRow label="Seq Gaps" value={sequenceGaps} color={sequenceGaps > 0 ? 'var(--color-negative)' : undefined} />
        <MetricRow label="Reconnects" value={reconnects} color={reconnects > 0 ? 'var(--color-warning)' : undefined} />
        <MetricRow label="Missing Data" value={missingData} color={missingData > 0 ? 'var(--color-warning)' : undefined} />
      </div>
    </Panel>
  )
}
