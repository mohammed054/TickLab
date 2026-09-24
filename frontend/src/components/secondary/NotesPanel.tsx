import { useState } from 'react'
import { Note } from '../../contracts'
import { mockWorkbench } from '../../mock/workbench'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'
import { AttributionBadge } from '../../shared/design-system/primitives'
import { Panel } from '../shared/Panel'

type AttachTarget = Note['targetType']

const TARGETS: AttachTarget[] = ['strategy', 'experiment', 'timestamp', 'trade', 'fill', 'chart_view']

export function NotesPanel() {
  const { notes } = useWorkbench()
  const [workspace] = useWorkspace()
  const [target, setTarget] = useState<AttachTarget>('strategy')
  const [draft, setDraft] = useState('')

  const targetId = getTargetId(target, workspace)
  const targetDetail = targetId || 'no target selected'

  const addNote = () => {
    const body = draft.trim()
    if (!body || !targetId) return
    mockWorkbench.addNote({ targetType: target, targetId, body, authoredBy: { agentType: 'human', id: 'local-user' } })
    setDraft('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="RESEARCH NOTES (MOCK — PERSISTED LOCALLY)">
        <div className="dim" style={{ fontSize: 11, marginBottom: 6 }}>Attach to: {target} ({targetDetail})</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {TARGETS.map((value) => <button key={value} type="button" aria-pressed={target === value} onClick={() => setTarget(value)} style={{ fontSize: 10, padding: '3px 7px', borderRadius: 3, border: '1px solid var(--border-1)', background: value === target ? 'var(--bg-3)' : 'transparent', color: value === target ? 'var(--text-0)' : 'var(--text-2)' }}>{value}</button>)}
        </div>
        <textarea aria-label="Research note body" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a note (plain text, light markdown)…" spellCheck={false} rows={3} style={{ width: '100%', resize: 'vertical', background: 'var(--bg-0)', color: 'var(--text-0)', border: '1px solid var(--border-1)', borderRadius: 3, padding: 8, fontSize: 12, lineHeight: 1.5 }} />
        <button type="button" disabled={!draft.trim() || !targetId} onClick={addNote} style={{ marginTop: 6, fontSize: 11, padding: '6px 12px', background: 'var(--color-info)', color: 'var(--color-bg-base)', border: 'none', borderRadius: 4, fontWeight: 600 }}>ADD NOTE</button>
      </Panel>

      <Panel title={`SAVED NOTES (${notes.length}, MOCK)`}>
        {notes.map((note) => <div key={note.id} style={{ marginBottom: 6, padding: 6, borderRadius: 3, border: '1px solid var(--border-1)' }}><div className="mono dim" style={{ fontSize: 10, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}><AttributionBadge kind={note.authoredBy.agentType === 'ai-assistant' ? 'ai' : 'human'} /> [{note.targetType}] {note.targetId} · {new Date(note.createdAt).toISOString().slice(0, 16).replace('T', ' ')}</div><div style={{ fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.5 }}>{note.body}</div></div>)}
      </Panel>
    </div>
  )
}

function getTargetId(target: AttachTarget, workspace: ReturnType<typeof useWorkspace>[0]): string {
  if (target === 'strategy') return workspace.strategy?.id ?? ''
  if (target === 'experiment') return workspace.experiment?.id ?? ''
  if (target === 'timestamp') return workspace.timestamp ?? ''
  if (target === 'trade' || target === 'fill') return workspace.selectedTradeId ?? workspace.selectedFillId ?? ''
  return `${workspace.symbol}:${workspace.timestamp ?? 'current'}:${workspace.activeTab.secondaryMonitor}`
}
