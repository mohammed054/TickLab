/**
 * Shared workspace sync bus (spec section 75/76 — "Linked Workspace").
 *
 * When run as a single window, this is just an in-memory pub/sub.
 * When the Main Monitor and Secondary Monitor are opened as two separate
 * browser windows (see the "Open Secondary Monitor" button), BroadcastChannel
 * mirrors state across them so both stay on the same symbol / timestamp /
 * selected trade / experiment.
 */

export interface WorkspaceSelection {
  symbol: string
  timestampMs: number | null // synchronized crosshair / replay timestamp
  selectedTradeId: string | null
  selectedExperimentId: string | null
  activeStrategy: string
  secondaryTab: string
}

type Listener = (state: WorkspaceSelection) => void

const CHANNEL_NAME = 'btc-workstation-sync-v1'

class SyncBus {
  private state: WorkspaceSelection = {
    symbol: 'BTC/USDT',
    timestampMs: null,
    selectedTradeId: null,
    selectedExperimentId: null,
    activeStrategy: 'MM_V18',
    secondaryTab: 'Strategy',
  }
  private listeners = new Set<Listener>()
  private channel: BroadcastChannel | null = null

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (ev) => {
        this.state = { ...this.state, ...ev.data }
        this.listeners.forEach((l) => l(this.state))
      }
    }
  }

  getState() {
    return this.state
  }

  update(partial: Partial<WorkspaceSelection>) {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((l) => l(this.state))
    this.channel?.postMessage(partial)
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
}

export const syncBus = new SyncBus()
