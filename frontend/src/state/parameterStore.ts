import { useSyncExternalStore } from 'react'

export interface StrategyParameters {
  spreadTicks: number
  orderSize: number
  requoteMs: number
  inventoryLimit: number
  inventorySkew: number
  makerFee: number
  takerFee: number
  latencyModel: string
  queueModel: string
  allowPartialFills: boolean
  preset: string
}

export const DEFAULT_STRATEGY_PARAMETERS: StrategyParameters = {
  spreadTicks: 5,
  orderSize: 0.01,
  requoteMs: 50,
  inventoryLimit: 2,
  inventorySkew: 0.35,
  makerFee: -0.005,
  takerFee: 0.02,
  latencyModel: 'empirical',
  queueModel: 'power-2.0',
  allowPartialFills: true,
  preset: 'baseline',
}

const STORAGE_KEY = 'ticklab.parameters.v1'
let state = loadState()
const listeners = new Set<() => void>()

function loadState(): StrategyParameters {
  if (typeof localStorage === 'undefined') return DEFAULT_STRATEGY_PARAMETERS
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return DEFAULT_STRATEGY_PARAMETERS
    return normalizeState(parsed as Partial<StrategyParameters>)
  } catch {
    return DEFAULT_STRATEGY_PARAMETERS
  }
}

function normalizeState(input: Partial<StrategyParameters>): StrategyParameters {
  return {
    spreadTicks: typeof input.spreadTicks === 'number' ? input.spreadTicks : DEFAULT_STRATEGY_PARAMETERS.spreadTicks,
    orderSize: typeof input.orderSize === 'number' ? input.orderSize : DEFAULT_STRATEGY_PARAMETERS.orderSize,
    requoteMs: typeof input.requoteMs === 'number' ? input.requoteMs : DEFAULT_STRATEGY_PARAMETERS.requoteMs,
    inventoryLimit: typeof input.inventoryLimit === 'number' ? input.inventoryLimit : DEFAULT_STRATEGY_PARAMETERS.inventoryLimit,
    inventorySkew: typeof input.inventorySkew === 'number' ? input.inventorySkew : DEFAULT_STRATEGY_PARAMETERS.inventorySkew,
    makerFee: typeof input.makerFee === 'number' ? input.makerFee : DEFAULT_STRATEGY_PARAMETERS.makerFee,
    takerFee: typeof input.takerFee === 'number' ? input.takerFee : DEFAULT_STRATEGY_PARAMETERS.takerFee,
    latencyModel: typeof input.latencyModel === 'string' ? input.latencyModel : DEFAULT_STRATEGY_PARAMETERS.latencyModel,
    queueModel: typeof input.queueModel === 'string' ? input.queueModel : DEFAULT_STRATEGY_PARAMETERS.queueModel,
    allowPartialFills: typeof input.allowPartialFills === 'boolean' ? input.allowPartialFills : DEFAULT_STRATEGY_PARAMETERS.allowPartialFills,
    preset: typeof input.preset === 'string' ? input.preset : DEFAULT_STRATEGY_PARAMETERS.preset,
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    return
  }
}

function emit(): void {
  state = { ...state }
  persist()
  listeners.forEach((listener) => listener())
}

export function useStrategyParameters(): [StrategyParameters, (patch: Partial<StrategyParameters>) => void] {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
  const update = (patch: Partial<StrategyParameters>) => {
    state = normalizeState({ ...state, ...patch })
    emit()
  }
  return [snapshot, update]
}

export function resetStrategyParameters(): void {
  state = { ...DEFAULT_STRATEGY_PARAMETERS }
  emit()
}
