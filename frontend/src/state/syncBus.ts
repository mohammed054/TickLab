import { Environment, StrategyRef, timestampMsToNs, timestampNsToMs } from '../contracts'

export type SecondaryTabId =
  | 'strategy'
  | 'parameters'
  | 'data'
  | 'data-center'
  | 'realtime-monitor'
  | 'market-overview'
  | 'backtest'
  | 'results'
  | 'compare'
  | 'sweeps'
  | 'walk-forward'
  | 'experiments'
  | 'replay'
  | 'analytics'
  | 'risk'
  | 'report'
  | 'logs'
  | 'data-quality'
  | 'event-inspector'
  | 'why-investigation'
  | 'research-notes'
  | 'ai-research'

export interface DatasetRef {
  id: string
  exchange: string
  symbol: string
  market: string
  startNs: string
  endNs: string
}

export interface ExperimentRef {
  id: string
}

export type WorkspacePresetId = 'MARKET' | 'RESEARCH' | 'BACKTEST' | 'REPLAY' | 'EXECUTION' | 'PAPER' | 'LIVE'

export interface ReplayState {
  isPlaying: boolean
  speed: number
  rangeStart: string
  rangeEnd: string
  currentEventId: string | null
  currentTimestampNs: string | null
}

export interface WorkspaceContext {
  symbol: string
  exchange: string
  environment: Environment
  dataset: DatasetRef | null
  strategy: StrategyRef | null
  experiment: ExperimentRef | null
  timestamp: string | null
  previewTimestampNs: string | null
  selectedOrderId: string | null
  selectedFillId: string | null
  selectedTradeId: string | null
  replay: ReplayState | null
  activeTab: {
    secondaryMonitor: SecondaryTabId
  }
  preset: WorkspacePresetId
}

export interface WorkspaceSelection extends WorkspaceContext {
  timestampMs: number | null
  selectedExperimentId: string | null
  activeStrategy: string
  secondaryTab: string
}

export interface LegacyWorkspacePatch {
  timestampMs?: number | null
  selectedExperimentId?: string | null
  activeStrategy?: string
  secondaryTab?: string
}

export type WorkspacePatch = Partial<Omit<WorkspaceContext, 'activeTab'>> & {
  activeTab?: Partial<WorkspaceContext['activeTab']>
} & LegacyWorkspacePatch

type Listener = (state: WorkspaceSelection) => void

type SyncMessage =
  | { kind: 'request'; origin: string }
  | { kind: 'state'; origin: string; revision: number; state: WorkspaceContext }
  | { kind: 'patch'; origin: string; revision: number; state: WorkspaceContext }

const CHANNEL_NAME = 'btc-workstation-sync-v2'
const TAB_LABELS: Record<SecondaryTabId, string> = {
  strategy: 'Strategy',
  parameters: 'Parameters',
  data: 'Data',
  'data-center': 'Data Center',
  'realtime-monitor': 'Realtime Monitor',
  'market-overview': 'Market Overview',
  backtest: 'Backtest',
  results: 'Results',
  compare: 'Compare',
  sweeps: 'Sweeps',
  'walk-forward': 'Walk-Forward',
  experiments: 'Experiments',
  replay: 'Replay',
  analytics: 'Analytics',
  risk: 'Risk',
  report: 'Report',
  logs: 'Logs',
  'data-quality': 'Data Quality',
  'event-inspector': 'Event Inspector',
  'why-investigation': 'Why Investigation',
  'research-notes': 'Research Notes',
  'ai-research': 'AI Research',
}

let originCounter = 0

function formatRevisionKey(revision: number, origin: string): string {
  return `${revision.toString().padStart(12, '0')}:${origin}`
}

function createOrigin(): string {
  originCounter += 1
  const cryptoApi = globalThis.crypto
  if (cryptoApi && 'randomUUID' in cryptoApi) {
    return cryptoApi.randomUUID()
  }
  return `window-${originCounter}-${globalThis.performance?.now?.() ?? 0}`
}

function isTabId(value: unknown): value is SecondaryTabId {
  return typeof value === 'string' && value in TAB_LABELS
}

function isPresetId(value: unknown): value is WorkspacePresetId {
  return value === 'MARKET' || value === 'RESEARCH' || value === 'BACKTEST' || value === 'REPLAY' || value === 'EXECUTION' || value === 'PAPER' || value === 'LIVE'
}

function normalizeTabId(value: string): SecondaryTabId {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-')
  if (isTabId(normalized)) {
    return normalized
  }
  const match = Object.entries(TAB_LABELS).find(([, label]) => label.toLowerCase() === value.trim().toLowerCase())
  return match ? (match[0] as SecondaryTabId) : 'strategy'
}

function nullableTimestampToMs(timestamp: string | null): number | null {
  if (timestamp === null) {
    return null
  }
  try {
    return timestampNsToMs(timestamp)
  } catch {
    return null
  }
}

function createInitialContext(): WorkspaceContext {
  return {
    symbol: 'BTCUSDT',
    exchange: 'binance-futures',
    environment: 'RESEARCH',
    dataset: {
      id: 'mock-dataset-btcusdt-2024-08-08',
      exchange: 'binance-futures',
      symbol: 'BTCUSDT',
      market: 'usdt-futures',
      startNs: '1723065600000000000',
      endNs: '1723152000000000000',
    },
    strategy: {
      id: 'MM_V18',
      version: 'v18.4',
      codeHash: 'mock:mm-v18',
    },
    experiment: null,
    timestamp: null,
    previewTimestampNs: null,
    selectedOrderId: null,
    selectedFillId: null,
    selectedTradeId: null,
    replay: null,
    activeTab: {
      secondaryMonitor: 'strategy',
    },
    preset: 'MARKET',
  }
}

function withAliases(context: WorkspaceContext): WorkspaceSelection {
  return {
    ...context,
    timestampMs: nullableTimestampToMs(context.timestamp),
    selectedExperimentId: context.experiment?.id ?? null,
    activeStrategy: context.strategy?.id ?? 'No strategy loaded',
    secondaryTab: TAB_LABELS[context.activeTab.secondaryMonitor],
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isReplayState(value: unknown): value is ReplayState {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<ReplayState>
  return typeof candidate.isPlaying === 'boolean' && typeof candidate.speed === 'number' && typeof candidate.rangeStart === 'string' && typeof candidate.rangeEnd === 'string'
}

function applyContextPatch(current: WorkspaceContext, patch: Partial<WorkspaceContext>): WorkspaceContext {
  const next: WorkspaceContext = { ...current }
  if (typeof patch.symbol === 'string') next.symbol = patch.symbol
  if (typeof patch.exchange === 'string') next.exchange = patch.exchange
  if (patch.environment === 'RESEARCH' || patch.environment === 'PAPER' || patch.environment === 'LIVE') next.environment = patch.environment
  if (patch.dataset === null || (typeof patch.dataset === 'object' && patch.dataset !== null)) next.dataset = patch.dataset ?? null
  if (patch.strategy === null || (typeof patch.strategy === 'object' && patch.strategy !== null)) next.strategy = patch.strategy ?? null
  if (patch.experiment === null || (typeof patch.experiment === 'object' && patch.experiment !== null)) next.experiment = patch.experiment ?? null
  if (isNullableString(patch.timestamp)) next.timestamp = patch.timestamp
  if (isNullableString(patch.previewTimestampNs)) next.previewTimestampNs = patch.previewTimestampNs
  if (isNullableString(patch.selectedOrderId)) next.selectedOrderId = patch.selectedOrderId
  if (isNullableString(patch.selectedFillId)) next.selectedFillId = patch.selectedFillId
  if (isNullableString(patch.selectedTradeId)) next.selectedTradeId = patch.selectedTradeId
  if (patch.replay === null || isReplayState(patch.replay)) next.replay = patch.replay ?? null
  if (patch.activeTab && typeof patch.activeTab === 'object' && isTabId(patch.activeTab.secondaryMonitor)) {
    next.activeTab = { secondaryMonitor: patch.activeTab.secondaryMonitor }
  }
  if (isPresetId(patch.preset)) next.preset = patch.preset
  return next
}

function loadPersistedContext(): WorkspaceContext | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem('ticklab.workspace.context.v1')
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return applyContextPatch(createInitialContext(), parsed as Partial<WorkspaceContext>)
  } catch {
    return null
  }
}

function persistContext(context: WorkspaceContext): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem('ticklab.workspace.context.v1', JSON.stringify(context))
  } catch {
    return
  }
}

function legacyPatchToContext(current: WorkspaceContext, patch: WorkspacePatch): Partial<WorkspaceContext> {
  const canonical: Partial<WorkspaceContext> = {}
  if (patch.timestamp !== undefined) canonical.timestamp = patch.timestamp
  if (patch.timestampMs !== undefined) canonical.timestamp = patch.timestampMs === null ? null : timestampMsToNs(patch.timestampMs)
  if (patch.experiment !== undefined) canonical.experiment = patch.experiment
  if (patch.selectedExperimentId !== undefined) canonical.experiment = patch.selectedExperimentId === null ? null : { id: patch.selectedExperimentId }
  if (patch.strategy !== undefined) canonical.strategy = patch.strategy
  if (patch.activeStrategy !== undefined) {
    canonical.strategy = patch.activeStrategy === 'No strategy loaded'
      ? null
      : {
          id: patch.activeStrategy,
          version: current.strategy?.version ?? 'draft',
          codeHash: current.strategy?.codeHash ?? `mock:${patch.activeStrategy}`,
        }
  }
  if (patch.secondaryTab !== undefined) canonical.activeTab = { secondaryMonitor: normalizeTabId(patch.secondaryTab) }
  if (patch.activeTab?.secondaryMonitor !== undefined && isTabId(patch.activeTab.secondaryMonitor)) {
    canonical.activeTab = { secondaryMonitor: patch.activeTab.secondaryMonitor }
  }
  for (const key of ['symbol', 'exchange', 'environment', 'dataset', 'previewTimestampNs', 'selectedOrderId', 'selectedFillId', 'selectedTradeId', 'replay', 'preset'] as const) {
    if (patch[key] !== undefined) {
      ;(canonical as Record<string, unknown>)[key] = patch[key]
    }
  }
  return canonical
}

export class SyncBus {
  private context: WorkspaceContext
  private state: WorkspaceSelection
  private revision = 0
  private revisionKey = ''
  private readonly listeners = new Set<Listener>()
  private readonly origin = createOrigin()
  private channel: BroadcastChannel | null = null

  constructor() {
    this.context = loadPersistedContext() ?? createInitialContext()
    this.revisionKey = formatRevisionKey(0, '')
    this.state = withAliases(this.context)
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (event: MessageEvent<SyncMessage>) => this.receive(event.data)
      this.channel.postMessage({ kind: 'request', origin: this.origin } satisfies SyncMessage)
    }
  }

  getState(): WorkspaceSelection {
    return this.state
  }

  update(patch: WorkspacePatch): void {
    const contextPatch = legacyPatchToContext(this.context, patch)
    const nextContext = applyContextPatch(this.context, contextPatch)
    if (nextContext === this.context) {
      return
    }
    this.context = nextContext
    this.revision += 1
    this.revisionKey = formatRevisionKey(this.revision, this.origin)
    this.state = withAliases(this.context)
    persistContext(this.context)
    this.listeners.forEach((listener) => listener(this.state))
    this.channel?.postMessage({ kind: 'patch', origin: this.origin, revision: this.revision, state: this.context } satisfies SyncMessage)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    this.channel?.close()
    this.channel = null
    this.listeners.clear()
  }

  private receive(message: SyncMessage): void {
    if (!message || message.origin === this.origin) {
      return
    }
    if (message.kind === 'request') {
      this.channel?.postMessage({ kind: 'state', origin: this.origin, revision: this.revision, state: this.context } satisfies SyncMessage)
      return
    }
    const incomingKey = formatRevisionKey(message.revision, message.origin)
    if (incomingKey <= this.revisionKey) {
      return
    }
    this.context = applyContextPatch(this.context, message.state)
    this.revision = Math.max(this.revision, message.revision)
    this.revisionKey = incomingKey
    this.state = withAliases(this.context)
    persistContext(this.context)
    this.listeners.forEach((listener) => listener(this.state))
  }
}

export const syncBus = new SyncBus()
export { TAB_LABELS }
