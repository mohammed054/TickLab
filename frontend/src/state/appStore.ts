import { useSyncExternalStore } from 'react'
import { RuntimeSnapshot } from '../contracts'
import { mockRuntime } from '../mock/runtime/runtime'

export function useMarketRuntime(): RuntimeSnapshot {
  return useSyncExternalStore(mockRuntime.subscribe, mockRuntime.getSnapshot, mockRuntime.getSnapshot)
}
