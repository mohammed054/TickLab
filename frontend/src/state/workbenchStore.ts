import { useSyncExternalStore } from 'react'
import { mockWorkbench } from '../mock/workbench'

export function useWorkbench() {
  return useSyncExternalStore(mockWorkbench.subscribe, mockWorkbench.getSnapshot, mockWorkbench.getSnapshot)
}
