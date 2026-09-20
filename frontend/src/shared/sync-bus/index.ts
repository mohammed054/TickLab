import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface DatasetRef {
  id: string
  symbol: string
  exchange: string
  dateRangeStart: number
  dateRangeEnd: number
}

export interface StrategyRef {
  id: string
  name: string
  description?: string
}

export interface ExperimentRef {
  id: string
  name: string
}

export type SecondaryTabId =
  | 'strategy'
  | 'parameters'
  | 'dataset'
  | 'backtest'
  | 'results'
  | 'analytics'
  | 'experiments'
  | 'replay'
  | 'events'
  | 'why'
  | 'notes'
  | 'ai'
  | 'logs'
  | 'alerts'
  | 'export'

export interface WorkspaceContext {
  symbol: string
  exchange: string
  environment: 'RESEARCH' | 'PAPER' | 'LIVE'
  dataset: DatasetRef | null
  strategy: StrategyRef | null
  experiment: ExperimentRef | null
  timestamp: number | null
  selectedOrderId: string | null
  selectedFillId: string | null
  selectedTradeId: string | null
  replay: {
    isPlaying: boolean
    speed: number
    rangeStart: number
    rangeEnd: number
  } | null
  activeTab: {
    secondaryMonitor: SecondaryTabId
  }
  isConnected: boolean
}

const initialContext: WorkspaceContext = {
  symbol: 'BTCUSDT',
  exchange: 'binance-futures',
  environment: 'RESEARCH',
  dataset: null,
  strategy: null,
  experiment: null,
  timestamp: null,
  selectedOrderId: null,
  selectedFillId: null,
  selectedTradeId: null,
  replay: null,
  activeTab: {
    secondaryMonitor: 'strategy'
  },
  isConnected: false
}

type WorkspaceStore = WorkspaceContext & {
  setSymbol: (symbol: string) => void
  setExchange: (exchange: string) => void
  setEnvironment: (environment: WorkspaceContext['environment']) => void
  setDataset: (dataset: DatasetRef | null) => void
  setStrategy: (strategy: StrategyRef | null) => void
  setExperiment: (experiment: ExperimentRef | null) => void
  setTimestamp: (timestamp: number | null) => void
  setSelectedOrderId: (id: string | null) => void
  setSelectedFillId: (id: string | null) => void
  setSelectedTradeId: (id: string | null) => void
  setReplay: (replay: WorkspaceContext['replay']) => void
  setActiveTab: (tab: SecondaryTabId) => void
  setConnected: (connected: boolean) => void
  reset: () => void
  syncFromServer: (patch: Partial<WorkspaceContext>) => void
}

/** Gateway WebSocket URL (docs/15 §15.3: single connection per client session). */
export const GATEWAY_WS_URL = 'ws://localhost:8080/api/v1/ws?session=dev-session'

/** Originating window for workspace.sync patches (docs/15 §15.3.4). */
export type ShellOrigin = 'main' | 'secondary'

export function getShellOrigin(): ShellOrigin {
  try {
    return new URLSearchParams(window.location.search).get('shell') === 'secondary'
      ? 'secondary'
      : 'main'
  } catch {
    return 'main'
  }
}

let ws: WebSocket | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_DELAY = 1000

function connectWebSocket() {
  // NOTE: use the store's setState directly (not a single action creator) so both
  // object patches and functional updates behave like a normal zustand set.
  const setState = useWorkspaceContext.setState

  ws = new WebSocket(GATEWAY_WS_URL)

  ws.onopen = () => {
    console.log('[SyncBus] WebSocket connected')
    setState({ isConnected: true })
    reconnectAttempts = 0

    // Wire shape per backend/gateway protocol.rs + docs/15 §15.3:
    // {"action":"subscribe","topic":"..."} (action-tagged, not {"type":...}).
    ws!.send(JSON.stringify({ action: 'subscribe', topic: 'workspace.sync' }))
  }

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)

      // Fanned-out patch per docs/15 §15.3.4: {topic, origin, patch}.
      if (message && message.topic === 'workspace.sync' && message.patch && typeof message.patch === 'object') {
        setState((state) => ({
          ...state,
          ...message.patch
        }))
      } else if (message && message.error) {
        // Typed wire error (docs/14 §14.9) — logged, connection stays open.
        console.warn('[SyncBus] gateway error:', message.error)
      }
      // Subscribe acks ({type:'subscribed'|'unsubscribed', topic}) need no action.
    } catch (e) {
      console.error('[SyncBus] Failed to parse message:', e)
    }
  }

  ws.onclose = () => {
    console.log('[SyncBus] WebSocket disconnected')
    setState({ isConnected: false })

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts)
      reconnectAttempts++
      console.log(`[SyncBus] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
      setTimeout(() => connectWebSocket(), delay)
    }
  }

  ws.onerror = (error) => {
    console.error('[SyncBus] WebSocket error:', error)
  }
}

export const useWorkspaceContext = create<WorkspaceStore>()(
  devtools(
    (set) => ({
      ...initialContext,

      setSymbol: (symbol) => set({ symbol }),
      setExchange: (exchange) => set({ exchange }),
      setEnvironment: (environment) => set({ environment }),
      setDataset: (dataset) => set({ dataset }),
      setStrategy: (strategy) => set({ strategy }),
      setExperiment: (experiment) => set({ experiment }),
      setTimestamp: (timestamp) => set({ timestamp }),
      setSelectedOrderId: (selectedOrderId) => set({ selectedOrderId }),
      setSelectedFillId: (selectedFillId) => set({ selectedFillId }),
      setSelectedTradeId: (selectedTradeId) => set({ selectedTradeId }),
      setReplay: (replay) => set({ replay }),
      setActiveTab: (activeTab) => set({ activeTab: { secondaryMonitor: activeTab } }),
      setConnected: (isConnected) => set({ isConnected }),

      reset: () => set(initialContext),

      syncFromServer: (patch) => set((state) => ({ ...state, ...patch }))
    }),
    { name: 'WorkspaceContext' }
  )
)

export function initSyncBus() {
  connectWebSocket()

  return () => {
    if (ws) {
      ws.close()
      ws = null
    }
  }
}

/**
 * Publish a partial WorkspaceContext patch to the other window(s) in the session.
 * Wire shape per docs/15 §15.3.4 + backend/gateway protocol.rs:
 * {action:'publish', topic:'workspace.sync', origin, patch}.
 * The gateway fans out to every OTHER connection in-session (sender excluded),
 * so callers must also apply the change locally via a store action.
 */
export function publishWorkspaceChange(patch: Partial<WorkspaceContext>, origin: ShellOrigin = getShellOrigin()) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      action: 'publish',
      topic: 'workspace.sync',
      origin,
      patch
    }))
  }
}
