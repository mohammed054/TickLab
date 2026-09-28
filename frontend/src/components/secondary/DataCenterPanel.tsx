import { useMemo } from 'react'
import {
  formatBytes,
  formatCount,
  getOverallQualityStatus,
  getPipelineStatusLabel,
  getQualityVisualState,
  getStatusVisualState,
  mockDatasetStore,
  useMockDatasetStore,
} from '../../mock/datasets/datasetCatalog'
import type { DatasetCatalogRecord } from '../../mock/datasets/datasetCatalog'
import { useWorkspace } from '../../state/useWorkspace'
import { DataTable, EmptyState, Panel, StatusDot } from '../shared/Panel'
import type { DataColumn } from '../shared/Panel'

export function DataCenterPanel() {
  const store = useMockDatasetStore()
  const [, updateWorkspace] = useWorkspace()

  const columns = useMemo<DataColumn<DatasetCatalogRecord>[]>(
    () => [
      {
        key: 'dataset',
        header: 'DATASET ID',
        render: (record) => (
          <div>
            <strong className="mono" style={{ color: 'var(--color-focus)' }}>
              {record.id}
            </strong>
            <div className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>
              {record.selection.exchange.toUpperCase()} · {record.selection.market} · {record.selection.symbol}
            </div>
          </div>
        ),
      },
      {
        key: 'range',
        header: 'DATE RANGE',
        render: (record) => (
          <span className="mono">
            {record.selection.startDate} → {record.selection.endDate}
          </span>
        ),
      },
      {
        key: 'size',
        header: 'SIZE',
        align: 'right',
        render: (record) => <span className="mono">{formatBytes(record.quality.fileSizeBytes)}</span>,
      },
      {
        key: 'status',
        header: 'PIPELINE',
        render: (record) => (
          <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <StatusDot state={getStatusVisualState(record.status)} pulse={record.status === 'ready'} />{' '}
            {getPipelineStatusLabel(record.status)}
          </span>
        ),
      },
      {
        key: 'quality',
        header: 'QUALITY GATE',
        render: (record) => (
          <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <StatusDot state={getQualityVisualState(getOverallQualityStatus(record))} />{' '}
            {getOverallQualityStatus(record).toUpperCase()}
          </span>
        ),
      },
      {
        key: 'progress',
        header: 'EVENTS',
        align: 'right',
        render: (record) => (
          <span className="mono">
            {formatCount(record.processedEvents)} ({record.progress}%)
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'ACTIONS',
        align: 'right',
        render: (record) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                mockDatasetStore.selectSelection(record.selection)
                updateWorkspace({ activeTab: { secondaryMonitor: 'data' } })
              }}
              style={actionStyle}
            >
              SELECT
            </button>
            <button
              type="button"
              disabled={record.status === 'ready'}
              onClick={() => mockDatasetStore.prepareDataset(record.id)}
              style={{
                ...actionStyle,
                color: record.status === 'ready' ? 'var(--color-text-disabled)' : 'var(--color-focus)',
              }}
            >
              PREPARE
            </button>
          </div>
        ),
      },
    ],
    [updateWorkspace]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="QUANT DATA CENTER & REPOSITORY" bodyStyle={{ padding: 0 }}>
        <DataTable
          rows={store.records}
          columns={columns}
          rowKey={(record) => record.id}
          ariaLabel="Dataset catalog"
          emptyState={
            <EmptyState
              icon="📁"
              title="NO DATASETS AVAILABLE"
              description="Prepare a dataset from the Data tab to populate the catalog."
            />
          }
        />
      </Panel>

      <Panel title="CATALOG STORAGE SUMMARY">
        <div className="mono dim" style={{ fontSize: 'var(--font-size-xs)' }}>
          {store.records.length} indexed records · active selection: {store.selection.exchange}/{store.selection.symbol} · L2/L3 Parquet storage engine ready
        </div>
      </Panel>

      <Panel title="ENGINE CAPABILITY & FEED MATRIX">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 'var(--font-size-xs)' }}>
          <span>L2 Order-Book Depth Reconstruction</span>
          <span className="pos mono" style={{ fontWeight: 600 }}>AVAILABLE · HARDWARE ACCELERATED</span>
          <span>L3 Market-By-Order (MBO) Replay</span>
          <span className="info mono" style={{ fontWeight: 600 }}>SUPPORTED · MEMORY MAPPED</span>
          <span>Ultra Low-Latency iceoryx2 IPC</span>
          <span className="pos mono" style={{ fontWeight: 600 }}>ENABLED · ZERO-COPY</span>
          <span>Live Binance Futures Connector</span>
          <span className="pos mono" style={{ fontWeight: 600 }}>CONNECTED (L2/L3 STREAM)</span>
        </div>
      </Panel>
    </div>
  )
}

const actionStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-2xs)',
  padding: '2px 7px',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-xs)',
  background: 'var(--color-bg-control)',
  color: 'var(--color-text-primary)',
  fontWeight: 600,
  cursor: 'pointer',
}
