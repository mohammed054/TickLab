import { Panel } from '../../shared/design-system/Panel'
import { MetricRow } from '../../shared/design-system/MetricRow'

type QualityStatus = 'green' | 'yellow' | 'red'

interface QualityField {
  label: string
  value: number | string
  status?: QualityStatus
}

interface DataQualityPanelProps {
  totalEvents: number
  trades: number
  orderBookUpdates: number
  snapshots: number
  missingIntervals: number
  missingStatus: QualityStatus
  duplicateEvents: number
  duplicateStatus: QualityStatus
  sequenceGaps: number
  sequenceStatus: QualityStatus
  timestampStart: string
  timestampEnd: string
  fileSize: string
  source: string
  normalizationVersion: string
  tickSize: number | null
  lotSize: number | null
}

function StatusDot({ status }: { status: QualityStatus }) {
  const color = status === 'green' ? 'var(--color-positive)' : status === 'yellow' ? 'var(--color-warning)' : 'var(--color-negative)'
  return <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color }} />
}

export function DataQualityPanel({
  totalEvents,
  trades,
  orderBookUpdates,
  snapshots,
  missingIntervals,
  missingStatus,
  duplicateEvents,
  duplicateStatus,
  sequenceGaps,
  sequenceStatus,
  timestampStart,
  timestampEnd,
  fileSize,
  source,
  normalizationVersion,
  tickSize,
  lotSize,
}: DataQualityPanelProps) {
  return (
    <Panel header="Data Quality">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <MetricRow label="Total Events" value={totalEvents.toLocaleString()} />
        <MetricRow label="Trades" value={trades.toLocaleString()} />
        <MetricRow label="Order-book Updates" value={orderBookUpdates.toLocaleString()} />
        <MetricRow label="Snapshots" value={snapshots.toLocaleString()} />
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Missing Intervals</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <StatusDot status={missingStatus} />
            <span className="num" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>{missingIntervals}</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Duplicate Events</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <StatusDot status={duplicateStatus} />
            <span className="num" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>{duplicateEvents}</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Sequence Gaps</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <StatusDot status={sequenceStatus} />
            <span className="num" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>{sequenceGaps}</span>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
        <MetricRow label="Timestamp Range" value={`${timestampStart} → ${timestampEnd}`} />
        <MetricRow label="File Size" value={fileSize} />
        <MetricRow label="Source" value={source} />
        <MetricRow label="Normalization" value={normalizationVersion} />
        {tickSize != null && <MetricRow label="Tick Size" value={tickSize} />}
        {lotSize != null && <MetricRow label="Lot Size" value={lotSize} />}
      </div>
    </Panel>
  )
}
