import { useEffect, useState } from 'react'
import { useWorkspace } from '../../state/useWorkspace'
import {
  DATASET_DATA_TYPES,
  DATASET_EXCHANGES,
  PIPELINE_STAGES,
  canRunBacktest,
  dateRangeForSelection,
  formatBytes,
  formatCount,
  getBacktestBlockers,
  getDataTypeOptions,
  getMarkets,
  getOverallQualityStatus,
  getPipelineStageState,
  getPipelineStatusLabel,
  getQualityVisualState,
  getSelectedRecord,
  getStatusVisualState,
  getSymbols,
  mockDatasetStore,
  selectionKey,
  toDatasetRef,
  useMockDatasetStore,
} from '../../mock/datasets/datasetCatalog'
import type { DatasetDataType, DatasetSelection, PipelineStageState } from '../../mock/datasets/datasetCatalog'
import { EmptyState, LoadingState, MetricRow, Panel, SelectField, StatusDot, Tooltip } from '../shared/Panel'
import { ImportDatasetModal } from './ImportDatasetModal'

export function DatasetPanel() {
  const store = useMockDatasetStore()
  const [workspace, updateWorkspace] = useWorkspace()
  const [selection, setSelection] = useState<DatasetSelection>(() => store.selection)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const storeSelectionKey = selectionKey(store.selection)

  useEffect(() => {
    setSelection((current) => (selectionKey(current) === storeSelectionKey ? current : store.selection))
  }, [storeSelectionKey])

  const activeRecord = getSelectedRecord(store)
  const activeId = activeRecord?.id
  const activeStart = activeRecord?.dateRange.start
  const activeEnd = activeRecord?.dateRange.end

  useEffect(() => {
    if (!activeRecord) return
    const dataset = toDatasetRef(activeRecord)
    if (
      workspace.dataset?.id === dataset.id &&
      workspace.dataset.exchange === dataset.exchange &&
      workspace.dataset.market === dataset.market &&
      workspace.dataset.symbol === dataset.symbol &&
      workspace.dataset.startNs === dataset.startNs &&
      workspace.dataset.endNs === dataset.endNs &&
      workspace.exchange === dataset.exchange &&
      workspace.symbol === dataset.symbol
    )
      return
    updateWorkspace({ exchange: dataset.exchange, symbol: dataset.symbol, dataset })
  }, [
    activeEnd,
    activeId,
    activeRecord,
    activeStart,
    updateWorkspace,
    workspace.dataset,
    workspace.exchange,
    workspace.symbol,
  ])

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
    const supported = new Set(
      getDataTypeOptions(exchange, market)
        .filter((option) => !option.disabled)
        .map((option) => option.value)
    )
    const dataTypes = selection.dataTypes.filter((dataType) => supported.has(dataType))
    commitSelection({ ...selection, exchange, market, symbol, dataTypes: dataTypes.length > 0 ? dataTypes : ['trades'] })
  }

  const updateMarket = (market: string) => {
    const symbols = getSymbols(selection.exchange, market)
    const symbol = symbols.includes(selection.symbol) ? selection.symbol : symbols[0] ?? 'BTCUSDT'
    const supported = new Set(
      getDataTypeOptions(selection.exchange, market)
        .filter((option) => !option.disabled)
        .map((option) => option.value)
    )
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

  const updateTime = (field: 'startTime' | 'endTime', value: string) => {
    commitSelection({ ...selection, [field]: value })
  }

  const updateDataType = (dataType: DatasetDataType, checked: boolean) => {
    const dataTypes = checked
      ? Array.from(new Set([...selection.dataTypes, dataType]))
      : selection.dataTypes.filter((value) => value !== dataType)
    if (dataTypes.length === 0) return
    commitSelection({ ...selection, dataTypes })
  }

  const selectedDataTypeLabels = selection.dataTypes.map(
    (dataType) => DATASET_DATA_TYPES.find((option) => option.value === dataType)?.label ?? dataType
  )
  const selectedDateRange = dateRangeForSelection(selection)
  const pipelineStatus = activeRecord?.status ?? 'no-dataset'
  const qualityStatus = activeRecord ? getOverallQualityStatus(activeRecord) : 'red'
  const canRun = activeRecord ? canRunBacktest(activeRecord) : false
  const blockers = activeRecord ? getBacktestBlockers(activeRecord) : ['No dataset is selected.']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', overflow: 'auto' }}>
      <Panel
        title="HISTORICAL & REALTIME DATASET REPOSITORY"
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <SelectField
            label="Exchange Connector"
            value={selection.exchange}
            options={DATASET_EXCHANGES}
            onChange={updateExchange}
            description="Source trading venue gateway."
          />
          <SelectField
            label="Market Instrument"
            value={selection.market}
            options={getMarkets(selection.exchange)}
            onChange={updateMarket}
            description="Contract type (Perpetual, Inverse, Spot)."
          />
          <SelectField
            label="Symbol"
            value={selection.symbol}
            options={getSymbols(selection.exchange, selection.market).map((symbol) => ({ value: symbol, label: symbol }))}
            onChange={(symbol) => commitSelection({ ...selection, symbol })}
            description="Target asset pair."
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <DateTimeInput
              label="Start Time (UTC)"
              dateValue={selection.startDate}
              timeValue={selection.startTime || '00:00:00'}
              onDateChange={(v) => updateDate('startDate', v)}
              onTimeChange={(v) => updateTime('startTime', v)}
            />
            <DateTimeInput
              label="End Time (UTC)"
              dateValue={selection.endDate}
              timeValue={selection.endTime || '23:59:59'}
              onDateChange={(v) => updateDate('endDate', v)}
              onTimeChange={(v) => updateTime('endTime', v)}
            />
          </div>
        </div>

        <fieldset
          style={{
            border: '1px solid var(--border-1)',
            borderRadius: 4,
            padding: '8px 12px',
            margin: '8px 0',
            background: 'var(--bg-1)',
          }}
        >
          <legend style={{ color: 'var(--text-1)', fontSize: 10, padding: '0 4px', fontWeight: 700 }}>
            DEPTH & FEED SUBSCRIPTIONS
          </legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '4px 12px' }}>
            {getDataTypeOptions(selection.exchange, selection.market).map((option) => {
              const checked = selection.dataTypes.includes(option.value)
              return (
                <Tooltip
                  key={option.value}
                  label={option.disabled ? option.disabledReason : `${option.label} stream enabled`}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                      fontSize: 10.5,
                      cursor: option.disabled ? 'not-allowed' : 'pointer',
                      color: option.disabled ? 'var(--text-2)' : checked ? 'var(--text-0)' : 'var(--text-1)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={option.disabled}
                      onChange={(event) => updateDataType(option.value, event.target.checked)}
                    />
                    {option.label}
                  </label>
                </Tooltip>
              )
            })}
          </div>
        </fieldset>

        <MetricRow label="Included Stream Channels" value={selectedDataTypeLabels.join(' · ')} />
        <MetricRow
          label="Timestamp Boundary"
          value={
            <span className="mono" style={{ fontSize: 10.5 }}>
              {selectedDateRange.start} → {selectedDateRange.end}
            </span>
          }
        />
        <MetricRow label="Active Dataset Identifier" value={activeRecord?.id ?? 'No matching dataset'} />
        {activeRecord && (
          <MetricRow label="Storage Footprint" value={`${formatBytes(activeRecord.quality.fileSizeBytes)} (${formatCount(activeRecord.totalEvents)} events)`} />
        )}
      </Panel>

      <Panel
        title="FEED INGESTION & RECONSTRUCTION PIPELINE"
        right={
          <span className="mono" style={{ fontSize: 10.5 }}>
            <StatusDot state={getStatusVisualState(pipelineStatus)} />{' '}
            {pipelineStatus === 'no-dataset' ? 'NO DATASET' : getPipelineStatusLabel(pipelineStatus)}
          </span>
        }
      >
        {activeRecord ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
              {PIPELINE_STAGES.map((stage, index) => {
                const stageState = getPipelineStageState(activeRecord, stage.id)
                return <PipelineStage key={stage.id} label={stage.label} state={stageState} last={index === PIPELINE_STAGES.length - 1} />
              })}
            </div>
            <LoadingState
              label={`${getPipelineStatusLabel(activeRecord.status)} · ${formatCount(
                activeRecord.processedEvents
              )} / ${formatCount(activeRecord.totalEvents)} events`}
              progress={activeRecord.progress}
            />
            <MetricRow
              label="Current Pipeline Stage"
              value={PIPELINE_STAGES.find((stage) => stage.id === activeRecord.activeStage)?.label ?? activeRecord.activeStage}
            />
            <MetricRow label="Reconstruction Progress" value={`${activeRecord.progress.toFixed(0)}%`} />
            {activeRecord.status === 'failed' && (
              <div role="alert" style={{ color: 'var(--color-negative)', fontSize: 11, marginTop: 6 }}>
                {activeRecord.errorMessage}
              </div>
            )}
            <button
              type="button"
              onClick={() => mockDatasetStore.prepareDataset(activeRecord.id)}
              disabled={
                activeRecord.status === 'ready' ||
                activeRecord.status === 'validating' ||
                activeRecord.status === 'normalizing' ||
                activeRecord.status === 'reconstructing' ||
                activeRecord.status === 'aligning'
              }
              style={{
                marginTop: 10,
                width: '100%',
                padding: '7px 10px',
                borderRadius: 4,
                border: '1px solid var(--color-brand-primary)',
                background: 'var(--color-brand-primary)',
                color: '#080a0d',
                fontWeight: 700,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {activeRecord.status === 'failed' ? 'RETRY PIPELINE' : 'PREPARE DATASET'}
            </button>
          </>
        ) : (
          <EmptyState
            title="NO DATASET SELECTED"
            description="Choose an exchange, market, symbol, and date range, or import your own dataset."
          />
        )}
      </Panel>

      <Panel title="QUALITY GATE & BACKTEST ELIGIBILITY">
        <MetricRow
          label="Data Quality Status"
          value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <StatusDot state={getQualityVisualState(qualityStatus)} /> {qualityStatus.toUpperCase()}
            </span>
          }
        />
        <MetricRow label="Backtest Eligibility" value={canRun ? 'VERIFIED & ELIGIBLE' : 'GATE BLOCKED'} valueClass={canRun ? 'pos' : 'neg'} />
        {blockers.map((blocker) => (
          <div key={blocker} style={{ color: 'var(--text-2)', fontSize: 10.5, marginTop: 4 }}>
            {blocker}
          </div>
        ))}
        <button
          type="button"
          disabled={!canRun}
          onClick={() => updateWorkspace({ activeTab: { secondaryMonitor: 'backtest' } })}
          style={{
            marginTop: 10,
            width: '100%',
            padding: '9px 12px',
            borderRadius: 4,
            border: 'none',
            background: canRun ? 'var(--color-brand-primary)' : 'var(--bg-2)',
            color: canRun ? '#080a0d' : 'var(--text-2)',
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: '0.04em',
            cursor: canRun ? 'pointer' : 'not-allowed',
          }}
        >
          {canRun ? '▶ PROCEED TO BACKTEST WITH THIS DATASET' : 'BACKTEST BLOCKED BY DATA GATE'}
        </button>
      </Panel>

      <ImportDatasetModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportSuccess={(datasetId) => {
          const record = mockDatasetStore.getSnapshot().records.find((r) => r.id === datasetId)
          if (record) {
            const dataset = toDatasetRef(record)
            updateWorkspace({ exchange: dataset.exchange, symbol: dataset.symbol, dataset })
          }
        }}
      />
    </div>
  )
}

function DateTimeInput({
  label,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
}: {
  label: string
  dateValue: string
  timeValue: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
}) {
  return (
    <div>
      <label style={{ display: 'block', color: 'var(--text-2)', fontSize: 10, marginBottom: 2 }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          type="date"
          value={dateValue}
          onChange={(event) => onDateChange(event.target.value)}
          style={{
            flex: 2,
            background: 'var(--bg-0)',
            color: 'var(--text-0)',
            border: '1px solid var(--border-1)',
            borderRadius: 3,
            padding: '4px 6px',
            fontSize: 10.5,
            fontFamily: 'var(--font-mono)',
          }}
        />
        <input
          type="time"
          step="1"
          value={timeValue}
          onChange={(event) => onTimeChange(event.target.value)}
          style={{
            flex: 1,
            background: 'var(--bg-0)',
            color: 'var(--text-0)',
            border: '1px solid var(--border-1)',
            borderRadius: 3,
            padding: '4px 6px',
            fontSize: 10.5,
            fontFamily: 'var(--font-mono)',
          }}
        />
      </div>
    </div>
  )
}

function PipelineStage({ label, state, last }: { label: string; state: PipelineStageState; last: boolean }) {
  const visualState = state === 'complete' ? 'ok' : state === 'active' ? 'warn' : state === 'failed' ? 'bad' : 'off'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: state === 'pending' ? 'var(--text-2)' : 'var(--text-0)',
        fontSize: 10.5,
      }}
    >
      <StatusDot state={visualState} pulse={state === 'active'} />
      <span>{label}</span>
      {!last && (
        <span aria-hidden="true" style={{ color: 'var(--text-2)', fontSize: 9 }}>
          →
        </span>
      )}
    </div>
  )
}
