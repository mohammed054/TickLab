import { useEffect, useState } from 'react'
import { useWorkspace } from '../../state/useWorkspace'
import { DATASET_DATA_TYPES, DATASET_EXCHANGES, PIPELINE_STAGES, canRunBacktest, dateRangeForSelection, formatCount, getBacktestBlockers, getDataTypeOptions, getMarkets, getOverallQualityStatus, getPipelineStageState, getPipelineStatusLabel, getQualityVisualState, getSelectedRecord, getStatusVisualState, getSymbols, mockDatasetStore, selectionKey, toDatasetRef, useMockDatasetStore } from '../../mock/datasets/datasetCatalog'
import type { DatasetDataType, DatasetSelection, PipelineStageState } from '../../mock/datasets/datasetCatalog'
import { EmptyState, LoadingState, MetricRow, Panel, SelectField, StatusDot, Tooltip } from '../shared/Panel'

export function DatasetPanel() {
  const store = useMockDatasetStore()
  const [workspace, updateWorkspace] = useWorkspace()
  const [selection, setSelection] = useState<DatasetSelection>(() => store.selection)
  const storeSelectionKey = selectionKey(store.selection)

  useEffect(() => {
    setSelection((current) => selectionKey(current) === storeSelectionKey ? current : store.selection)
  }, [storeSelectionKey])

  const activeRecord = getSelectedRecord(store)
  const activeId = activeRecord?.id
  const activeStart = activeRecord?.dateRange.start
  const activeEnd = activeRecord?.dateRange.end

  useEffect(() => {
    if (!activeRecord) return
    const dataset = toDatasetRef(activeRecord)
    if (workspace.dataset?.id === dataset.id && workspace.dataset.exchange === dataset.exchange && workspace.dataset.market === dataset.market && workspace.dataset.symbol === dataset.symbol && workspace.dataset.startNs === dataset.startNs && workspace.dataset.endNs === dataset.endNs && workspace.exchange === dataset.exchange && workspace.symbol === dataset.symbol) return
    updateWorkspace({ exchange: dataset.exchange, symbol: dataset.symbol, dataset })
  }, [activeEnd, activeId, activeRecord, activeStart, updateWorkspace, workspace.dataset, workspace.exchange, workspace.symbol])

  const commitSelection = (next: DatasetSelection) => {
    const record = mockDatasetStore.selectSelection(next)
    setSelection(mockDatasetStore.getSnapshot().selection)
    const dataset = toDatasetRef(record)
    updateWorkspace({ exchange: dataset.exchange, symbol: dataset.symbol, dataset })
  }

  const updateExchange = (exchange: string) => {
    const market = getMarkets(exchange)[0]?.value ?? 'usdt-futures'
    const symbols = getSymbols(exchange, market)
    const symbol = symbols.includes(selection.symbol) ? selection.symbol : symbols[0] ?? 'BTCUSDT'
    const supported = new Set(getDataTypeOptions(exchange, market).filter((option) => !option.disabled).map((option) => option.value))
    const dataTypes = selection.dataTypes.filter((dataType) => supported.has(dataType))
    commitSelection({ ...selection, exchange, market, symbol, dataTypes: dataTypes.length > 0 ? dataTypes : ['trades'] })
  }

  const updateMarket = (market: string) => {
    const symbols = getSymbols(selection.exchange, market)
    const symbol = symbols.includes(selection.symbol) ? selection.symbol : symbols[0] ?? 'BTCUSDT'
    const supported = new Set(getDataTypeOptions(selection.exchange, market).filter((option) => !option.disabled).map((option) => option.value))
    const dataTypes = selection.dataTypes.filter((dataType) => supported.has(dataType))
    commitSelection({ ...selection, market, symbol, dataTypes: dataTypes.length > 0 ? dataTypes : ['trades'] })
  }

  const updateDate = (field: 'startDate' | 'endDate', value: string) => {
    if (!value) return
    const next = { ...selection, [field]: value }
    if (next.startDate > next.endDate) {
      if (field === 'startDate') next.endDate = value
      else next.startDate = value
    }
    commitSelection(next)
  }

  const updateDataType = (dataType: DatasetDataType, checked: boolean) => {
    const dataTypes = checked
      ? Array.from(new Set([...selection.dataTypes, dataType]))
      : selection.dataTypes.filter((value) => value !== dataType)
    if (dataTypes.length === 0) return
    commitSelection({ ...selection, dataTypes })
  }

  const selectedDataTypeLabels = selection.dataTypes.map((dataType) => DATASET_DATA_TYPES.find((option) => option.value === dataType)?.label ?? dataType)
  const selectedDateRange = dateRangeForSelection(selection)
  const pipelineStatus = activeRecord?.status ?? 'no-dataset'
  const qualityStatus = activeRecord ? getOverallQualityStatus(activeRecord) : 'red'
  const canRun = activeRecord ? canRunBacktest(activeRecord) : false
  const blockers = activeRecord ? getBacktestBlockers(activeRecord) : ['No dataset is selected.']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', height: '100%', overflow: 'auto' }}>
      <Panel title="DATASET SELECTOR (MOCK — LOCAL CATALOG)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
          <SelectField label="Exchange" value={selection.exchange} options={DATASET_EXCHANGES} onChange={updateExchange} description="Deterministic local exchange catalog." />
          <SelectField label="Market" value={selection.market} options={getMarkets(selection.exchange)} onChange={updateMarket} description="Market metadata filters the available symbols and feeds." />
          <SelectField label="Symbol" value={selection.symbol} options={getSymbols(selection.exchange, selection.market).map((symbol) => ({ value: symbol, label: symbol }))} onChange={(symbol) => commitSelection({ ...selection, symbol })} description="Symbols are filtered by exchange and market." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
            <DateInput label="Start date" value={selection.startDate} onChange={(value) => updateDate('startDate', value)} />
            <DateInput label="End date" value={selection.endDate} onChange={(value) => updateDate('endDate', value)} />
          </div>
        </div>
        <fieldset style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)', margin: '0 0 var(--space-3)' }}>
          <legend style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', padding: '0 var(--space-1)' }}>Data types</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 'var(--space-1) var(--space-3)' }}>
            {getDataTypeOptions(selection.exchange, selection.market).map((option) => {
              const checked = selection.dataTypes.includes(option.value)
              const label = <span style={{ color: option.disabled ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)' }}>{option.label}{option.disabled ? ' · unavailable' : ''}</span>
              return (
                <Tooltip key={option.value} label={option.disabled ? option.disabledReason : `${option.label} included in the local dataset selection`}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minWidth: 0, fontSize: 'var(--font-size-xs)' }}>
                    <input type="checkbox" checked={checked} disabled={option.disabled} onChange={(event) => updateDataType(option.value, event.target.checked)} />
                    {label}
                  </label>
                </Tooltip>
              )
            })}
          </div>
        </fieldset>
        <MetricRow label="Selected data" value={selectedDataTypeLabels.join(' · ')} />
        <MetricRow label="Timestamp range" value={<span className="mono">{selectedDateRange.start} → {selectedDateRange.end}</span>} />
        <MetricRow label="Catalog record" value={activeRecord?.id ?? 'No matching record'} />
      </Panel>

      <Panel title="RAW DATA PIPELINE (MOCK)" right={<span className="mono" style={{ fontSize: 'var(--font-size-xs)' }}><StatusDot state={getStatusVisualState(pipelineStatus)} /> {pipelineStatus === 'no-dataset' ? 'NO DATASET' : getPipelineStatusLabel(pipelineStatus)}</span>}>
        {activeRecord ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
              {PIPELINE_STAGES.map((stage, index) => {
                const stageState = getPipelineStageState(activeRecord, stage.id)
                return <PipelineStage key={stage.id} label={stage.label} state={stageState} last={index === PIPELINE_STAGES.length - 1} />
              })}
            </div>
            <LoadingState label={`${getPipelineStatusLabel(activeRecord.status)} · ${formatCount(activeRecord.processedEvents)} / ${formatCount(activeRecord.totalEvents)} events`} progress={activeRecord.progress} />
            <MetricRow label="Current stage" value={PIPELINE_STAGES.find((stage) => stage.id === activeRecord.activeStage)?.label ?? activeRecord.activeStage} />
            <MetricRow label="Progress" value={`${activeRecord.progress.toFixed(0)}%`} />
            {activeRecord.status === 'failed' && <div role="alert" style={{ color: 'var(--color-negative)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-2)' }}>{activeRecord.errorMessage}</div>}
            <button type="button" onClick={() => mockDatasetStore.prepareDataset(activeRecord.id)} disabled={activeRecord.status === 'ready' || activeRecord.status === 'validating' || activeRecord.status === 'normalizing' || activeRecord.status === 'reconstructing' || activeRecord.status === 'aligning'} style={{ marginTop: 'var(--space-3)', width: '100%', padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-info)', background: 'var(--color-info)', color: 'var(--color-bg-base)', fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
              {activeRecord.status === 'failed' ? 'RETRY PIPELINE' : 'PREPARE DATASET'}
            </button>
          </>
        ) : <EmptyState title="NO DATASET SELECTED" description="Choose an exchange, market, symbol, data type, and date range." />}
      </Panel>

      <Panel title="QUALITY GATE PREVIEW (MOCK)">
        <MetricRow label="Quality report" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}><StatusDot state={getQualityVisualState(qualityStatus)} /> {qualityStatus.toUpperCase()}</span>} />
        <MetricRow label="Backtest gate" value={canRun ? 'OPEN' : 'BLOCKED'} />
        {blockers.map((blocker) => <div key={blocker} style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-1)' }}>{blocker}</div>)}
        <button type="button" disabled={!canRun} onClick={() => updateWorkspace({ activeTab: { secondaryMonitor: 'backtest' } })} style={{ marginTop: 'var(--space-3)', width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-info)', background: canRun ? 'var(--color-info)' : 'var(--color-bg-control)', color: canRun ? 'var(--color-bg-base)' : 'var(--color-text-disabled)', fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
          {canRun ? 'OPEN BACKTEST' : 'BACKTEST BLOCKED'}
        </button>
      </Panel>
    </div>
  )
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
      {label}
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '3px', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: '5px' }} />
    </label>
  )
}

function PipelineStage({ label, state, last }: { label: string; state: PipelineStageState; last: boolean }) {
  const visualState = state === 'complete' ? 'ok' : state === 'active' ? 'warn' : state === 'failed' ? 'bad' : 'off'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: state === 'pending' ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
      <StatusDot state={visualState} />
      <span>{label}</span>
      {!last && <span aria-hidden="true" style={{ color: 'var(--color-text-disabled)' }}>↓</span>}
    </div>
  )
}
