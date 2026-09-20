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

let ws: WebSocket | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_DELAY = 1000

function connectWebSocket(set: (partial: WorkspaceStore | ((state: WorkspaceStore) => WorkspaceStore)) => void) {
  const wsUrl = `ws://localhost:8080/api/v1/ws?session=dev-session`
  
  ws = new WebSocket(wsUrl)
  
  ws.onopen = () => {
    console.log('[SyncBus] WebSocket connected')
    set({ isConnected: true })
    reconnectAttempts = 0
    
    ws!.send(JSON.stringify({
      type: 'subscribe',
      topic: 'workspace.sync'
    }))
  }
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      
      if (message.type === 'workspace.sync' && message.payload) {
        set((state) => ({
          ...state,
          ...message.payload
        }))
      }
    } catch (e) {
      console.error('[SyncBus] Failed to parse message:', e)
    }
  }
  
  ws.onclose = () => {
    console.log('[SyncBus] WebSocket disconnected')
    set({ isConnected: false })
    
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts)
      reconnectAttempts++
      console.log(`[SyncBus] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
      setTimeout(() => connectWebSocket(set), delay)
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
  const store = useWorkspaceContext.getState()
  connectWebSocket(store.setConnected as any)
  
  const originalSet = store
  return () => {
    if (ws) {
      ws.close()
      ws = null
    }
  }
}

export function publishWorkspaceChange(patch: Partial<WorkspaceContext>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'publish',
      topic: 'workspace.sync',
      payload: patch
    }))
  }
}