import { timestampMsToNs, timestampNsToMs } from '../../contracts'
import type { TimestampNs } from '../../contracts'
import { useSyncExternalStore } from 'react'

export const DATASET_DATA_TYPES = [
  { value: 'trades', label: 'Trades' },
  { value: 'l2_order_book', label: 'L2 Order Book' },
  { value: 'l3_order_book', label: 'L3 Order Book' },
  { value: 'snapshots', label: 'Snapshots' },
  { value: 'incremental_updates', label: 'Incremental Updates' },
  { value: 'ticker', label: 'Ticker' },
  { value: 'mark_price', label: 'Mark Price' },
  { value: 'funding', label: 'Funding' },
  { value: 'liquidation', label: 'Liquidation' },
] as const

export type DatasetDataType = (typeof DATASET_DATA_TYPES)[number]['value']
export type QualityStatus = 'green' | 'yellow' | 'red'
export type DatasetStatus = 'ready' | 'validating' | 'normalizing' | 'reconstructing' | 'aligning' | 'failed'
export type PipelineStageId = 'raw' | 'validation' | 'normalization' | 'reconstruction' | 'alignment' | 'timestamp' | 'format' | 'ready'
export type PipelineStageState = 'complete' | 'active' | 'pending' | 'failed'

export const PIPELINE_STAGES: readonly { id: PipelineStageId; label: string }[] = [
  { id: 'raw', label: 'RAW EXCHANGE DATA' },
  { id: 'validation', label: 'VALIDATION' },
  { id: 'normalization', label: 'NORMALIZATION' },
  { id: 'reconstruction', label: 'ORDER BOOK RECONSTRUCTION' },
  { id: 'alignment', label: 'TRADE ALIGNMENT' },
  { id: 'timestamp', label: 'TIMESTAMP VALIDATION' },
  { id: 'format', label: 'HFTBACKTEST-COMPATIBLE FORMAT' },
  { id: 'ready', label: 'READY' },
]

export const DATASET_EXCHANGES = [
  { value: 'binance-futures', label: 'Binance' },
  { value: 'bybit', label: 'Bybit' },
] as const

const MARKET_LABELS: Record<string, string> = {
  'usdt-futures': 'USDT Futures',
  'coinm-futures': 'COIN-M Futures',
  spot: 'Spot',
}

const MARKETS_BY_EXCHANGE: Record<string, readonly string[]> = {
  'binance-futures': ['usdt-futures', 'coinm-futures', 'spot'],
  bybit: ['usdt-futures', 'coinm-futures', 'spot'],
}

const SYMBOLS_BY_EXCHANGE_MARKET: Record<string, readonly string[]> = {
  'binance-futures:usdt-futures': ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  'binance-futures:coinm-futures': ['BTCUSD', 'ETHUSD'],
  'binance-futures:spot': ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  'bybit:usdt-futures': ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  'bybit:coinm-futures': ['BTCUSD', 'ETHUSD'],
  'bybit:spot': ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
}

const SUPPORTED_DATA_TYPES: Record<string, readonly DatasetDataType[]> = {
  'binance-futures:usdt-futures': ['trades', 'l2_order_book', 'snapshots', 'incremental_updates', 'ticker', 'mark_price', 'funding'],
  'binance-futures:coinm-futures': ['trades', 'l2_order_book', 'snapshots', 'incremental_updates', 'ticker', 'mark_price', 'funding'],
  'binance-futures:spot': ['trades', 'l2_order_book', 'snapshots', 'incremental_updates', 'ticker'],
  'bybit:usdt-futures': ['trades', 'l2_order_book', 'snapshots', 'incremental_updates', 'ticker', 'mark_price', 'funding', 'liquidation'],
  'bybit:coinm-futures': ['trades', 'l2_order_book', 'snapshots', 'incremental_updates', 'ticker', 'mark_price', 'funding'],
  'bybit:spot': ['trades', 'l2_order_book', 'snapshots', 'incremental_updates', 'ticker'],
}

const NS_PER_MS = 1_000_000n
const PIPELINE_STEP_MS = 600
const PIPELINE_PROGRESS = [0, 12, 28, 46, 64, 80, 92, 100] as const
const PIPELINE_STATUS_BY_STAGE: Record<number, DatasetStatus> = {
  1: 'validating',
  2: 'normalizing',
  3: 'reconstructing',
  4: 'aligning',
  5: 'validating',
  6: 'normalizing',
  7: 'ready',
}
const AUDIT_EPOCH_MS = 1_723_065_600_000
const STORAGE_KEY = 'ticklab.mock-datasets.v1'

export interface DatasetSelection {
  exchange: string
  market: string
  symbol: string
  dataTypes: DatasetDataType[]
  startDate: string
  endDate: string
}

export interface DatasetDateRange {
  start: TimestampNs
  end: TimestampNs
}

export interface DataQualityReport {
  datasetId: string
  totalEvents: number
  trades: number
  orderBookUpdates: number
  snapshots: number
  missingIntervals: {
    count: number
    status: QualityStatus
    ranges: [TimestampNs, TimestampNs][]
  }
  duplicateEvents: {
    count: number
    status: QualityStatus
  }
  sequenceGaps: {
    count: number
    status: QualityStatus
  }
  timestampRange: [TimestampNs, TimestampNs]
  fileSizeBytes: number
  source: string
  normalizationVersion: string
  tickSize: number
  lotSize: number
}

export interface QualityCheck {
  id: 'missing-intervals' | 'duplicate-events' | 'sequence-gaps'
  label: string
  count: number
  status: QualityStatus
  detail: string
  overridden: boolean
  justification?: string
}

export interface DatasetOverrideRecord {
  id: string
  timestampNs: TimestampNs
  actor: { type: 'human' | 'system'; id: string }
  action: 'DATA_QUALITY_OVERRIDE'
  datasetId: string
  checkId: QualityCheck['id']
  checkLabel: string
  qualityStatus: QualityStatus
  justification: string
  value: 'RED'
}

export interface DatasetCatalogRecord {
  id: string
  selection: DatasetSelection
  dateRange: DatasetDateRange
  status: DatasetStatus
  progress: number
  activeStage: PipelineStageId
  pipelineStep: number
  processedEvents: number
  totalEvents: number
  errorMessage: string | null
  failureMode: 'reconstruction' | null
  quality: DataQualityReport
  overrides: DatasetOverrideRecord[]
}

export interface MockDatasetStoreSnapshot {
  selection: DatasetSelection
  records: DatasetCatalogRecord[]
  overrides: DatasetOverrideRecord[]
}

interface QualityProfile {
  totalEvents: number
  trades: number
  orderBookUpdates: number
  snapshots: number
  missingIntervals: { count: number; status: QualityStatus; offsetsMs: number[] }
  duplicateEvents: { count: number; status: QualityStatus }
  sequenceGaps: { count: number; status: QualityStatus }
  fileSizeBytes: number
  tickSize: number
  lotSize: number
}

interface SeedDefinition {
  id?: string
  selection: DatasetSelection
  profile: QualityProfile
  status: DatasetStatus
  failureMode?: 'reconstruction'
}

interface PersistedDatasetState {
  selection?: unknown
  overrides?: unknown
}

const GREEN_PROFILE: QualityProfile = {
  totalEvents: 48_291_204,
  trades: 6_182_003,
  orderBookUpdates: 41_882_110,
  snapshots: 227_091,
  missingIntervals: { count: 0, status: 'green', offsetsMs: [] },
  duplicateEvents: { count: 0, status: 'green' },
  sequenceGaps: { count: 0, status: 'green' },
  fileSizeBytes: 8_400_000_000,
  tickSize: 0.1,
  lotSize: 0.001,
}

const YELLOW_PROFILE: QualityProfile = {
  totalEvents: 29_572_342,
  trades: 3_981_220,
  orderBookUpdates: 25_441_118,
  snapshots: 150_004,
  missingIntervals: { count: 2, status: 'yellow', offsetsMs: [3_600_000, 7_200_000] },
  duplicateEvents: { count: 4, status: 'yellow' },
  sequenceGaps: { count: 0, status: 'green' },
  fileSizeBytes: 5_200_000_000,
  tickSize: 0.1,
  lotSize: 0.001,
}

const RED_PROFILE: QualityProfile = {
  totalEvents: 29_572_342,
  trades: 3_981_220,
  orderBookUpdates: 25_441_118,
  snapshots: 150_004,
  missingIntervals: { count: 7, status: 'red', offsetsMs: [1_800_000, 3_600_000, 7_200_000, 10_800_000, 14_400_000, 18_000_000, 21_600_000] },
  duplicateEvents: { count: 14, status: 'yellow' },
  sequenceGaps: { count: 3, status: 'yellow' },
  fileSizeBytes: 5_200_000_000,
  tickSize: 0.1,
  lotSize: 0.001,
}

const FAILED_PROFILE: QualityProfile = {
  totalEvents: 18_204_118,
  trades: 2_110_441,
  orderBookUpdates: 15_903_670,
  snapshots: 190_007,
  missingIntervals: { count: 12, status: 'red', offsetsMs: [1_200_000, 2_400_000, 3_600_000, 4_800_000, 6_000_000, 7_200_000, 8_400_000, 9_600_000, 10_800_000, 12_000_000, 13_200_000, 14_400_000] },
  duplicateEvents: { count: 31, status: 'red' },
  sequenceGaps: { count: 6, status: 'red' },
  fileSizeBytes: 3_100_000_000,
  tickSize: 0.01,
  lotSize: 0.001,
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function dateToTimestampNs(value: string): TimestampNs {
  if (!isDateString(value)) {
    throw new Error('date must use YYYY-MM-DD')
  }
  const [year, month, day] = value.split('-').map(Number)
  return (BigInt(Date.UTC(year, month - 1, day)) * NS_PER_MS).toString()
}

export function timestampNsToDate(value: TimestampNs): string {
  const milliseconds = Number(BigInt(value) / NS_PER_MS)
  return new Date(milliseconds).toISOString().slice(0, 10)
}

export function formatTimestampNs(value: TimestampNs): string {
  const milliseconds = Number(BigInt(value) / NS_PER_MS)
  return new Date(milliseconds).toISOString().replace('T', ' ').replace('.000Z', 'Z')
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

export function formatBytes(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} GB`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} KB`
  return `${value} B`
}

export function getDefaultSelection(): DatasetSelection {
  return {
    exchange: 'binance-futures',
    market: 'usdt-futures',
    symbol: 'BTCUSDT',
    dataTypes: ['trades', 'l2_order_book'],
    startDate: '2024-08-08',
    endDate: '2024-08-09',
  }
}

export function getMarkets(exchange: string): readonly { value: string; label: string }[] {
  return (MARKETS_BY_EXCHANGE[exchange] ?? ['usdt-futures']).map((market) => ({ value: market, label: MARKET_LABELS[market] }))
}

export function getSymbols(exchange: string, market: string): readonly string[] {
  return SYMBOLS_BY_EXCHANGE_MARKET[`${exchange}:${market}`] ?? SYMBOLS_BY_EXCHANGE_MARKET['binance-futures:usdt-futures']
}

export function getDataTypeOptions(exchange: string, market: string): readonly { value: DatasetDataType; label: string; disabled: boolean; disabledReason: string }[] {
  const supported = new Set(SUPPORTED_DATA_TYPES[`${exchange}:${market}`] ?? ['trades'])
  return DATASET_DATA_TYPES.map((item) => {
    const disabled = !supported.has(item.value)
    return {
      ...item,
      disabled,
      disabledReason: disabled ? 'This data type is not available in the mock catalog for this exchange and market.' : '',
    }
  })
}

function normalizeDataTypes(value: unknown, exchange: string, market: string): DatasetDataType[] {
  const allowed = new Set(getDataTypeOptions(exchange, market).filter((item) => !item.disabled).map((item) => item.value))
  const input = Array.isArray(value) ? value : []
  const selected = input.filter((item): item is DatasetDataType => typeof item === 'string' && allowed.has(item as DatasetDataType))
  const unique = new Set(selected)
  const ordered = DATASET_DATA_TYPES.map((item) => item.value).filter((item) => unique.has(item))
  return ordered.length > 0 ? ordered : ['trades']
}

export function normalizeSelection(input: DatasetSelection): DatasetSelection {
  const fallback = getDefaultSelection()
  const exchange = DATASET_EXCHANGES.some((item) => item.value === input.exchange) ? input.exchange : fallback.exchange
  const markets = getMarkets(exchange)
  const market = markets.some((item) => item.value === input.market) ? input.market : markets[0]?.value ?? fallback.market
  const symbols = getSymbols(exchange, market)
  const symbol = symbols.includes(input.symbol) ? input.symbol : symbols[0] ?? fallback.symbol
  const requestedStart = isDateString(input.startDate) ? input.startDate : fallback.startDate
  const requestedEnd = isDateString(input.endDate) ? input.endDate : fallback.endDate
  const startDate = requestedStart > requestedEnd ? requestedEnd : requestedStart
  const endDate = requestedStart > requestedEnd ? requestedStart : requestedEnd
  return {
    exchange,
    market,
    symbol,
    dataTypes: normalizeDataTypes(input.dataTypes, exchange, market),
    startDate,
    endDate,
  }
}

export function selectionKey(selection: DatasetSelection): string {
  const normalized = normalizeSelection(selection)
  return [normalized.exchange, normalized.market, normalized.symbol, normalized.dataTypes.join('+'), normalized.startDate, normalized.endDate].join('|')
}

export function datasetIdForSelection(selection: DatasetSelection): string {
  const normalized = normalizeSelection(selection)
  if (normalized.exchange === 'binance-futures' && normalized.market === 'usdt-futures' && normalized.symbol === 'BTCUSDT' && normalized.startDate === '2024-08-08' && normalized.endDate === '2024-08-09' && normalized.dataTypes.join('+') === 'trades+l2_order_book') return 'mock-dataset-btcusdt-2024-08-08'
  return `mock-dataset-${normalized.exchange}-${normalized.market}-${normalized.symbol.toLowerCase()}-${normalized.startDate}-${normalized.endDate}-${normalized.dataTypes.join('+')}`
}

export function dateRangeForSelection(selection: DatasetSelection): DatasetDateRange {
  const normalized = normalizeSelection(selection)
  return { start: dateToTimestampNs(normalized.startDate), end: dateToTimestampNs(normalized.endDate) }
}

function createQualityProfile(selection: DatasetSelection): QualityProfile {
  if (selection.symbol === 'SOLUSDT') return FAILED_PROFILE
  if (selection.symbol === 'ETHUSDT') return RED_PROFILE
  if (selection.exchange === 'bybit') return YELLOW_PROFILE
  return GREEN_PROFILE
}

function createQualityReport(datasetId: string, selection: DatasetSelection, profile: QualityProfile): DataQualityReport {
  const dateRange = dateRangeForSelection(selection)
  const hasTrades = selection.dataTypes.includes('trades')
  const hasBook = selection.dataTypes.includes('l2_order_book') || selection.dataTypes.includes('l3_order_book') || selection.dataTypes.includes('incremental_updates')
  const hasSnapshots = selection.dataTypes.includes('snapshots') || hasBook
  const trades = hasTrades ? profile.trades : 0
  const orderBookUpdates = hasBook ? profile.orderBookUpdates : 0
  const snapshots = hasSnapshots ? profile.snapshots : 0
  const totalEvents = Math.max(1, profile.totalEvents - (hasTrades ? 0 : profile.trades) - (hasBook ? 0 : profile.orderBookUpdates) - (hasSnapshots ? 0 : profile.snapshots))
  const ranges = profile.missingIntervals.offsetsMs.map((offsetMs) => {
    const start = timestampMsToNs(timestampNsToMs(dateRange.start) + offsetMs)
    const end = timestampMsToNs(timestampNsToMs(dateRange.start) + offsetMs + 1_000)
    return [start, end] as [TimestampNs, TimestampNs]
  })
  const exchangeLabel = DATASET_EXCHANGES.find((item) => item.value === selection.exchange)?.label ?? selection.exchange
  const marketLabel = MARKET_LABELS[selection.market] ?? selection.market
  return {
    datasetId,
    totalEvents,
    trades,
    orderBookUpdates,
    snapshots,
    missingIntervals: { count: profile.missingIntervals.count, status: profile.missingIntervals.status, ranges },
    duplicateEvents: { ...profile.duplicateEvents },
    sequenceGaps: { ...profile.sequenceGaps },
    timestampRange: [dateRange.start, dateRange.end],
    fileSizeBytes: profile.fileSizeBytes,
    source: `${exchangeLabel} ${marketLabel}`,
    normalizationVersion: 'mock-pipeline-v3',
    tickSize: profile.tickSize,
    lotSize: profile.lotSize,
  }
}

function createRecord(selectionInput: DatasetSelection, status: DatasetStatus, failureMode: 'reconstruction' | null = null, id?: string): DatasetCatalogRecord {
  const selection = normalizeSelection(selectionInput)
  const datasetId = id ?? datasetIdForSelection(selection)
  const profile = createQualityProfile(selection)
  const quality = createQualityReport(datasetId, selection, profile)
  const progress = status === 'ready' ? 100 : status === 'failed' ? PIPELINE_PROGRESS[3] : 0
  return {
    id: datasetId,
    selection,
    dateRange: dateRangeForSelection(selection),
    status,
    progress,
    activeStage: status === 'failed' ? 'reconstruction' : status === 'ready' ? 'ready' : 'validation',
    pipelineStep: status === 'ready' ? PIPELINE_STAGES.length - 1 : status === 'failed' ? 3 : 0,
    processedEvents: Math.round(quality.totalEvents * (progress / 100)),
    totalEvents: quality.totalEvents,
    errorMessage: status === 'failed' ? 'Mock reconstruction stopped at a non-contiguous snapshot sequence.' : null,
    failureMode,
    quality,
    overrides: [],
  }
}

function createSeedRecords(): DatasetCatalogRecord[] {
  const definitions: SeedDefinition[] = [
    {
      id: 'mock-dataset-btcusdt-2024-08-08',
      selection: getDefaultSelection(),
      profile: GREEN_PROFILE,
      status: 'ready',
    },
    {
      selection: { exchange: 'binance-futures', market: 'usdt-futures', symbol: 'ETHUSDT', dataTypes: ['trades', 'l2_order_book'], startDate: '2024-08-08', endDate: '2024-08-09' },
      profile: RED_PROFILE,
      status: 'ready',
    },
    {
      selection: { exchange: 'bybit', market: 'usdt-futures', symbol: 'BTCUSDT', dataTypes: ['trades', 'l2_order_book'], startDate: '2024-08-08', endDate: '2024-08-09' },
      profile: YELLOW_PROFILE,
      status: 'ready',
    },
    {
      selection: { exchange: 'binance-futures', market: 'usdt-futures', symbol: 'SOLUSDT', dataTypes: ['trades', 'l2_order_book'], startDate: '2024-08-08', endDate: '2024-08-09' },
      profile: FAILED_PROFILE,
      status: 'failed',
      failureMode: 'reconstruction',
    },
    {
      selection: { exchange: 'binance-futures', market: 'spot', symbol: 'BTCUSDT', dataTypes: ['trades'], startDate: '2024-08-08', endDate: '2024-08-09' },
      profile: GREEN_PROFILE,
      status: 'ready',
    },
  ]
  return definitions.map((definition) => {
    const record = createRecord(definition.selection, definition.status, definition.failureMode ?? null, definition.id)
    const quality = createQualityReport(record.id, record.selection, definition.profile)
    return { ...record, quality, totalEvents: quality.totalEvents, processedEvents: Math.round(quality.totalEvents * (record.progress / 100)) }
  })
}

function isOverrideRecord(value: unknown): value is DatasetOverrideRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DatasetOverrideRecord>
  return typeof candidate.id === 'string'
    && typeof candidate.timestampNs === 'string'
    && candidate.action === 'DATA_QUALITY_OVERRIDE'
    && typeof candidate.datasetId === 'string'
    && typeof candidate.checkId === 'string'
    && typeof candidate.checkLabel === 'string'
    && typeof candidate.justification === 'string'
    && candidate.value === 'RED'
}

function readPersistedState(): PersistedDatasetState | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as PersistedDatasetState
  } catch {
    return null
  }
}

function normalizePersistedSelection(value: unknown): DatasetSelection | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<DatasetSelection>
  if (typeof candidate.exchange !== 'string' || typeof candidate.market !== 'string' || typeof candidate.symbol !== 'string' || !Array.isArray(candidate.dataTypes) || typeof candidate.startDate !== 'string' || typeof candidate.endDate !== 'string') return null
  try {
    return normalizeSelection(candidate as DatasetSelection)
  } catch {
    return null
  }
}

function getSelectedRecordFromSnapshot(snapshot: MockDatasetStoreSnapshot): DatasetCatalogRecord | undefined {
  return snapshot.records.find((record) => selectionKey(record.selection) === selectionKey(snapshot.selection))
}

export function getSelectedRecord(snapshot: MockDatasetStoreSnapshot): DatasetCatalogRecord | undefined {
  return getSelectedRecordFromSnapshot(snapshot)
}

export function getQualityChecks(record: DatasetCatalogRecord): QualityCheck[] {
  const overrides = new Map(record.overrides.map((entry) => [entry.checkId, entry]))
  const missing = record.quality.missingIntervals
  const duplicate = record.quality.duplicateEvents
  const sequence = record.quality.sequenceGaps
  const definitions: Array<Omit<QualityCheck, 'overridden' | 'justification'>> = [
    { id: 'missing-intervals', label: 'Missing intervals', count: missing.count, status: missing.status, detail: missing.ranges.length > 0 ? `${missing.ranges.length} recorded interval${missing.ranges.length === 1 ? '' : 's'}` : 'No missing intervals detected.' },
    { id: 'duplicate-events', label: 'Duplicate events', count: duplicate.count, status: duplicate.status, detail: duplicate.count === 0 ? 'No duplicate events detected.' : `${formatCount(duplicate.count)} duplicate rows require review.` },
    { id: 'sequence-gaps', label: 'Sequence gaps', count: sequence.count, status: sequence.status, detail: sequence.count === 0 ? 'Sequence numbers are contiguous.' : `${formatCount(sequence.count)} sequence gaps require review.` },
  ]
  return definitions.map((definition) => {
    const override = overrides.get(definition.id)
    return { ...definition, overridden: override !== undefined, justification: override?.justification }
  })
}

export function getOverallQualityStatus(record: DatasetCatalogRecord): QualityStatus {
  const checks = getQualityChecks(record)
  if (checks.some((check) => check.status === 'red' && !check.overridden)) return 'red'
  if (checks.some((check) => check.status === 'yellow' || (check.status === 'red' && check.overridden))) return 'yellow'
  return 'green'
}

export function canRunBacktest(record: DatasetCatalogRecord): boolean {
  return record.status === 'ready' && !getQualityChecks(record).some((check) => check.status === 'red' && !check.overridden)
}

export function getBacktestBlockers(record: DatasetCatalogRecord): string[] {
  const blockers: string[] = []
  if (record.status !== 'ready') {
    blockers.push(`Pipeline is ${getPipelineStatusLabel(record.status)}; wait for READY.`)
  }
  for (const check of getQualityChecks(record)) {
    if (check.status === 'red' && !check.overridden) {
      blockers.push(`${check.label} is RED (${formatCount(check.count)}). Override individually or resolve the data.`)
    }
  }
  return blockers
}

export function getStatusVisualState(status: DatasetStatus | 'no-dataset'): 'ok' | 'warn' | 'bad' | 'off' {
  if (status === 'ready') return 'ok'
  if (status === 'failed') return 'bad'
  if (status === 'no-dataset') return 'off'
  return 'warn'
}

export function getQualityVisualState(status: QualityStatus): 'ok' | 'warn' | 'bad' {
  if (status === 'green') return 'ok'
  if (status === 'yellow') return 'warn'
  return 'bad'
}

export function getPipelineStatusLabel(status: DatasetStatus): string {
  return status.toUpperCase()
}

export function getPipelineStageState(record: DatasetCatalogRecord, stage: PipelineStageId): PipelineStageState {
  const activeIndex = PIPELINE_STAGES.findIndex((item) => item.id === record.activeStage)
  const stageIndex = PIPELINE_STAGES.findIndex((item) => item.id === stage)
  if (record.status === 'ready') return 'complete'
  if (record.status === 'failed') {
    if (stage === record.activeStage) return 'failed'
    return stageIndex < activeIndex ? 'complete' : 'pending'
  }
  if (stageIndex < activeIndex) return 'complete'
  if (stageIndex === activeIndex) return 'active'
  return 'pending'
}

export function getAuditRecords(snapshot: MockDatasetStoreSnapshot, datasetId?: string): DatasetOverrideRecord[] {
  return snapshot.overrides.filter((entry) => datasetId === undefined || entry.datasetId === datasetId)
}

export function toDatasetRef(record: DatasetCatalogRecord) {
  return {
    id: record.id,
    exchange: record.selection.exchange,
    symbol: record.selection.symbol,
    market: record.selection.market,
    startNs: record.dateRange.start,
    endNs: record.dateRange.end,
  }
}

class MockDatasetStore {
  private readonly records = new Map<string, DatasetCatalogRecord>()
  private readonly listeners = new Set<() => void>()
  private readonly timers = new Map<string, number>()
  private selection: DatasetSelection
  private overrides: DatasetOverrideRecord[]
  private snapshot: MockDatasetStoreSnapshot

  constructor() {
    const persisted = readPersistedState()
    this.selection = normalizePersistedSelection(persisted?.selection) ?? getDefaultSelection()
    this.overrides = Array.isArray(persisted?.overrides) ? persisted.overrides.filter(isOverrideRecord) : []
    const seedRecords = createSeedRecords()
    seedRecords.forEach((record) => this.records.set(record.id, record))
    this.overrides.forEach((override) => {
      const record = this.records.get(override.datasetId)
      if (record) record.overrides = this.overrides.filter((entry) => entry.datasetId === record.id)
    })
    if (!this.records.has(datasetIdForSelection(this.selection))) {
      const record = createRecord(this.selection, 'validating')
      this.records.set(record.id, record)
    }
    this.snapshot = this.createSnapshot()
    const selected = this.getSelectedRecord()
    if (selected?.status === 'validating') this.beginPipeline(selected.id, false)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): MockDatasetStoreSnapshot => this.snapshot

  getSelectedRecord(): DatasetCatalogRecord | undefined {
    return this.snapshot.records.find((record) => selectionKey(record.selection) === selectionKey(this.selection))
  }

  selectSelection(input: DatasetSelection): DatasetCatalogRecord {
    const selection = normalizeSelection(input)
    const id = datasetIdForSelection(selection)
    this.selection = selection
    let record = this.records.get(id)
    let created = false
    if (!record) {
      record = createRecord(selection, 'validating')
      this.records.set(id, record)
      created = true
    }
    this.applyOverrides(record)
    this.notify()
    if (created) this.beginPipeline(id, false)
    return this.getRecord(id) as DatasetCatalogRecord
  }

  prepareDataset(datasetId: string): void {
    const record = this.records.get(datasetId)
    if (!record || record.status === 'ready') return
    this.beginPipeline(datasetId, record.status === 'failed')
  }

  retryPipeline(datasetId: string): void {
    this.beginPipeline(datasetId, true)
  }

  advancePipeline(datasetId: string): void {
    const record = this.records.get(datasetId)
    if (!record || record.status === 'ready' || record.status === 'failed') return
    const nextStep = record.pipelineStep + 1
    if (record.failureMode === 'reconstruction' && nextStep >= 3) {
      this.clearTimer(datasetId)
      this.records.set(datasetId, { ...record, status: 'failed', progress: PIPELINE_PROGRESS[3], activeStage: 'reconstruction', pipelineStep: 3, processedEvents: Math.round(record.totalEvents * 0.46), errorMessage: 'Mock reconstruction stopped at a non-contiguous snapshot sequence.' })
      this.notify()
      return
    }
    if (nextStep >= PIPELINE_STAGES.length - 1) {
      this.clearTimer(datasetId)
      this.records.set(datasetId, { ...record, status: 'ready', progress: 100, activeStage: 'ready', pipelineStep: PIPELINE_STAGES.length - 1, processedEvents: record.totalEvents, errorMessage: null })
      this.notify()
      return
    }
    const stage = PIPELINE_STAGES[nextStep]
    const progress = PIPELINE_PROGRESS[nextStep] ?? 0
    this.records.set(datasetId, { ...record, status: PIPELINE_STATUS_BY_STAGE[nextStep] ?? 'validating', progress, activeStage: stage.id, pipelineStep: nextStep, processedEvents: Math.round(record.totalEvents * (progress / 100)), errorMessage: null })
    this.notify()
    this.schedule(datasetId)
  }

  overrideQualityCheck(datasetId: string, checkId: QualityCheck['id'], justification: string): boolean {
    const record = this.records.get(datasetId)
    if (!record) return false
    const check = getQualityChecks({ ...record, overrides: this.overrides.filter((entry) => entry.datasetId === datasetId) }).find((candidate) => candidate.id === checkId)
    const trimmed = justification.trim()
    if (!check || check.status !== 'red' || check.overridden || !trimmed) return false
    const entry: DatasetOverrideRecord = {
      id: `mock-audit-${(this.overrides.length + 1).toString().padStart(4, '0')}`,
      timestampNs: timestampMsToNs(AUDIT_EPOCH_MS + this.overrides.length * 60_000),
      actor: { type: 'human', id: 'local-user' },
      action: 'DATA_QUALITY_OVERRIDE',
      datasetId,
      checkId,
      checkLabel: check.label,
      qualityStatus: 'red',
      justification: trimmed,
      value: 'RED',
    }
    this.overrides = [entry, ...this.overrides]
    this.applyOverrides(record)
    this.notify()
    return true
  }

  dispose(): void {
    if (typeof window !== 'undefined') this.timers.forEach((timer) => window.clearTimeout(timer))
    this.timers.clear()
    this.listeners.clear()
  }

  private beginPipeline(datasetId: string, force: boolean): void {
    const record = this.records.get(datasetId)
    if (!record) return
    if (record.status === 'ready') return
    if (record.status === 'failed' && !force) return
    this.clearTimer(datasetId)
    this.records.set(datasetId, { ...record, status: 'validating', progress: 0, activeStage: 'validation', pipelineStep: 0, processedEvents: 0, errorMessage: null })
    this.notify()
    this.schedule(datasetId)
  }

  private schedule(datasetId: string): void {
    if (typeof window === 'undefined') return
    const timer = window.setTimeout(() => {
      this.timers.delete(datasetId)
      this.advancePipeline(datasetId)
    }, PIPELINE_STEP_MS)
    this.timers.set(datasetId, timer)
  }

  private clearTimer(datasetId: string): void {
    const timer = this.timers.get(datasetId)
    if (timer !== undefined && typeof window !== 'undefined') window.clearTimeout(timer)
    this.timers.delete(datasetId)
  }

  private getRecord(datasetId: string): DatasetCatalogRecord | undefined {
    return this.snapshot.records.find((record) => record.id === datasetId)
  }

  private applyOverrides(record: DatasetCatalogRecord): void {
    record.overrides = this.overrides.filter((entry) => entry.datasetId === record.id)
  }

  private createSnapshot(): MockDatasetStoreSnapshot {
    const records = Array.from(this.records.values()).map((record) => ({
      ...record,
      selection: { ...record.selection, dataTypes: [...record.selection.dataTypes] },
      dateRange: { ...record.dateRange },
      quality: {
        ...record.quality,
        missingIntervals: { ...record.quality.missingIntervals, ranges: record.quality.missingIntervals.ranges.map(([start, end]) => [start, end] as [TimestampNs, TimestampNs]) },
        duplicateEvents: { ...record.quality.duplicateEvents },
        sequenceGaps: { ...record.quality.sequenceGaps },
        timestampRange: [...record.quality.timestampRange] as [TimestampNs, TimestampNs],
      },
      overrides: this.overrides.filter((entry) => entry.datasetId === record.id).map((entry) => ({ ...entry })),
    }))
    return {
      selection: { ...this.selection, dataTypes: [...this.selection.dataTypes] },
      records,
      overrides: this.overrides.map((entry) => ({ ...entry })),
    }
  }

  private notify(): void {
    this.snapshot = this.createSnapshot()
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ selection: this.snapshot.selection, overrides: this.snapshot.overrides }))
      } catch {
      }
    }
    this.listeners.forEach((listener) => listener())
  }
}

export const mockDatasetStore = new MockDatasetStore()

export function useMockDatasetStore(): MockDatasetStoreSnapshot {
  return useSyncExternalStore(mockDatasetStore.subscribe, mockDatasetStore.getSnapshot, mockDatasetStore.getSnapshot)
}
