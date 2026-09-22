import { useEffect, useState } from 'react'
import { syncBus, WorkspaceSelection } from './syncBus'

export function useWorkspace(): [WorkspaceSelection, (p: Partial<WorkspaceSelection>) => void] {
  const [state, setState] = useState(syncBus.getState())
  useEffect(() => {
    const unsubscribe = syncBus.subscribe(setState)
    return () => {
      unsubscribe()
    }
  }, [])
  return [state, (p) => syncBus.update(p)]
}
