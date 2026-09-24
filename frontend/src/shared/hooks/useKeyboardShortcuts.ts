import { useEffect } from 'react'
import { mockWorkbench } from '../../mock/workbench'
import { useWorkspace } from '../../state/useWorkspace'

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.tagName === 'SELECT' || element?.isContentEditable === true
}

export function useKeyboardShortcuts(): void {
  const [, updateWorkspace] = useWorkspace()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) && event.key !== 'Escape') return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); const jobId = mockWorkbench.startBacktest(); const job = mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === jobId); if (job) updateWorkspace({ experiment: { id: job.experimentId }, activeTab: { secondaryMonitor: 'backtest' } }); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') { event.preventDefault(); updateWorkspace({ activeTab: { secondaryMonitor: 'replay' } }); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); window.dispatchEvent(new CustomEvent('ticklab:save-strategy')); mockWorkbench.appendAudit('SAVE_STRATEGY', 'strategy', 'active', 'keyboard shortcut'); updateWorkspace({ activeTab: { secondaryMonitor: 'strategy' } }); return }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'e') { event.preventDefault(); updateWorkspace({ activeTab: { secondaryMonitor: 'experiments' } }); return }
      if (event.code === 'Space' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); window.dispatchEvent(new CustomEvent('ticklab:replay-toggle')); return }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); window.dispatchEvent(new CustomEvent('ticklab:replay-step', { detail: event.key === 'ArrowLeft' ? -1 : 1 })); return }
      if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); window.dispatchEvent(new CustomEvent('ticklab:chart-fit')); return }
      if (event.key === 'Escape') updateWorkspace({ timestamp: null, previewTimestampNs: null })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [updateWorkspace])
}
