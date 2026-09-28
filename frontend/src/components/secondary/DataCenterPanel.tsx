import { useMemo, useState } from 'react'
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
import { ImportDatasetModal } from './ImportDatasetModal'

export function DataCenterPanel() {
  const store = useMockDatasetStore()
  const [, updateWorkspace] = useWorkspace()
  const [importModalOpen, setImportModalOpen] = useState(false)

  const columns = useMemo<DataColumn<DatasetCatalogRecord>[]>(
    () => [
      {
        key: 'dataset',
        header: 'DATASET ID & INSTRUMENT',
        render: (record) => (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong className="mono" style={{ color: 'var(--color-brand-primary)', fontSize: 11 }}>
                {record.name || record.id}
              </strong>
              {record.isCustomImport && (
                <span style={{ fontSize: 8.5, background: 'rgba(56, 189, 248, 0.15)', color: 'var(--color-brand-primary)', padding: '1px 4px', borderRadius: 2, fontWeight: 700 }}>
                  CUSTOM
                </span>
              )}
            </div>
            <div className="dim mono" style={{ fontSize: 9.5, marginTop: 1 }}>
              {record.selection.exchange.toUpperCase()} · {record.selection.market} · {record.selection.symbol}
            </div>
          </div>
        ),
      },
      {
        key: 'range',
        header: 'DATE / TIME WINDOW',
        render: (record) => (
          <span className="mono" style={{ fontSize: 10.5 }}>
            {record.selection.startDate} {record.selection.startTime || '00:00'} → {record.selection.endDate} {record.selection.endTime || '23:59'}
          </span>
        ),
      },
      {
        key: 'size',
        header: 'FOOTPRINT',
        align: 'right',
        render: (record) => <span className="mono">{formatBytes(record.quality.fileSizeBytes)}</span>,
      },
      {
        key: 'status',
        header: 'PIPELINE STATE',
        render: (record) => (
          <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5 }}>
            <StatusDot state={getStatusVisualState(record.status)} pulse={record.status === 'ready'} />{' '}
            {getPipelineStatusLabel(record.status)}
          </span>
        ),
      },
      {
        key: 'quality',
        header: 'QUALITY GATE',
        render: (record) => (
          <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5 }}>
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
          <span className="mono" style={{ fontSize: 10.5 }}>
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
                color: record.status === 'ready' ? 'var(--text-2)' : 'var(--color-brand-primary)',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', overflow: 'auto' }}>
      <Panel
        title="QUANT DATA CENTER & DATASET REPOSITORY"
        bodyStyle={{ padding: 0 }}
        right={
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            style={{
              background: 'var(--color-brand-primary)',
              color: '#080a0d',
              border: 'none',
              borderRadius: 3,
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 800,
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            + IMPORT CUSTOM DATASET
          </button>
        }
      >
        <DataTable
          rows={store.records}
          columns={columns}
          rowKey={(record) => record.id}
          ariaLabel="Dataset catalog"
          emptyState={
            <EmptyState
              title="NO DATASETS AVAILABLE"
              description="Prepare or import a dataset to populate the data repository."
            />
          }
        />
      </Panel>

      <Panel title="CATALOG STORAGE & CAPACITY METRICS">
        <div className="mono dim" style={{ fontSize: 10.5 }}>
          {store.records.length} indexed datasets · Active selection: {store.selection.exchange}/{store.selection.symbol} · Zero-copy memory mapped Parquet storage
        </div>
      </Panel>

      <Panel title="ENGINE CONNECTOR & CAPABILITY MATRIX">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 10.5 }}>
          <span>L2 Order-Book Depth Reconstruction</span>
          <span className="pos mono" style={{ fontWeight: 600 }}>AVAILABLE · HARDWARE ACCELERATED</span>
          <span>L3 Market-By-Order (MBO) Tick Playback</span>
          <span className="info mono" style={{ fontWeight: 600 }}>SUPPORTED · ZERO-COPY IPC</span>
          <span>Ultra Low-Latency iceoryx2 Shared Memory Bus</span>
          <span className="pos mono" style={{ fontWeight: 600 }}>ACTIVE (380ns mean tick-to-trade)</span>
          <span>Live Binance & Bybit WebSocket Feeds</span>
          <span className="pos mono" style={{ fontWeight: 600 }}>CONNECTED & HEALTHY</span>
        </div>
      </Panel>

      <ImportDatasetModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportSuccess={(datasetId) => {
          const record = mockDatasetStore.getSnapshot().records.find((r) => r.id === datasetId)
          if (record) {
            mockDatasetStore.selectSelection(record.selection)
          }
        }}
      />
    </div>
  )
}

const actionStyle: React.CSSProperties = {
  fontSize: 10,
  padding: '2px 7px',
  border: '1px solid var(--border-1)',
  borderRadius: 3,
  background: 'var(--bg-2)',
  color: 'var(--text-0)',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
}
