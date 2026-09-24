import { useMemo } from 'react'
import { formatBytes, formatCount, getOverallQualityStatus, getPipelineStatusLabel, getQualityVisualState, getStatusVisualState, mockDatasetStore, useMockDatasetStore } from '../../mock/datasets/datasetCatalog'
import type { DatasetCatalogRecord } from '../../mock/datasets/datasetCatalog'
import { useWorkspace } from '../../state/useWorkspace'
import { DataTable, EmptyState, Panel, StatusDot } from '../shared/Panel'
import type { DataColumn } from '../shared/Panel'

export function DataCenterPanel() {
  const store = useMockDatasetStore()
  const [, updateWorkspace] = useWorkspace()
  const columns = useMemo<DataColumn<DatasetCatalogRecord>[]>(() => [
    { key: 'dataset', header: 'DATASET', render: (record) => <div><strong className="mono">{record.id}</strong><div className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>{record.selection.exchange} · {record.selection.market} · {record.selection.symbol}</div></div> },
    { key: 'range', header: 'DATE RANGE', render: (record) => <span className="mono">{record.selection.startDate} → {record.selection.endDate}</span> },
    { key: 'size', header: 'SIZE', align: 'right', render: (record) => <span className="mono">{formatBytes(record.quality.fileSizeBytes)}</span> },
    { key: 'status', header: 'STATUS', render: (record) => <span className="mono"><StatusDot state={getStatusVisualState(record.status)} /> {getPipelineStatusLabel(record.status)}</span> },
    { key: 'quality', header: 'QUALITY', render: (record) => <span className="mono"><StatusDot state={getQualityVisualState(getOverallQualityStatus(record))} /> {getOverallQualityStatus(record).toUpperCase()}</span> },
    { key: 'progress', header: 'PROGRESS', align: 'right', render: (record) => <span className="mono">{record.progress}% · {formatCount(record.processedEvents)}</span> },
    { key: 'actions', header: 'ACTIONS', align: 'right', render: (record) => <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}><button type="button" onClick={() => { mockDatasetStore.selectSelection(record.selection); updateWorkspace({ activeTab: { secondaryMonitor: 'data' } }) }} style={actionStyle}>OPEN</button><button type="button" disabled={record.status === 'ready'} onClick={() => mockDatasetStore.prepareDataset(record.id)} style={actionStyle}>PREPARE</button></div> },
  ], [updateWorkspace])
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}><Panel title="DATA CENTER (MOCK CATALOG)" bodyStyle={{ padding: 0 }}><DataTable rows={store.records} columns={columns} rowKey={(record) => record.id} ariaLabel="Dataset catalog" emptyState={<EmptyState title="NO DATASETS" description="Prepare a dataset from the Data tab to populate the catalog." />} /></Panel><Panel title="DATASET CATALOG SUMMARY"><div className="mono dim" style={{ fontSize: 'var(--font-size-xs)' }}>{store.records.length} records · selection: {store.selection.exchange}/{store.selection.symbol} · local mock persistence enabled</div></Panel><Panel title="CAPABILITY MATRIX (MOCK)"><div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 5, fontSize: 'var(--font-size-xs)' }}><span>L2 order-book reconstruction</span><span className="pos">SUPPORTED IN LOCAL CATALOG</span><span>L3 market-by-order replay</span><span className="warn">UNAVAILABLE — REQUIRES CONNECTOR/ENGINE</span><span>Live exchange feed</span><span className="dim">DISABLED — MOCK ONLY</span></div></Panel></div>
}

const actionStyle: React.CSSProperties = { fontSize: 9, padding: '3px 5px', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-control)', color: 'var(--color-text-secondary)' }
