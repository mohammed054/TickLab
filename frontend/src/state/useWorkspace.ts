import { useCallback, useEffect, useState } from 'react'
import { syncBus, WorkspacePatch, WorkspaceSelection } from './syncBus'

export function useWorkspace(): [WorkspaceSelection, (patch: WorkspacePatch) => void] {
  const [state, setState] = useState(syncBus.getState())
  useEffect(() => syncBus.subscribe(setState), [])
  const update = useCallback((patch: WorkspacePatch) => syncBus.update(patch), [])
  return [state, update]
}
