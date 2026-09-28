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
    mockWorkbench.addNote({
      targetType: target,
      targetId,
      body,
      authoredBy: { agentType: 'human', id: 'lead-quant' },
    })
    setDraft('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="QUANT RESEARCH LAB NOTEBOOK">
        <div className="dim" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 6 }}>
          Attaching context to: <span className="mono" style={{ color: 'var(--color-focus)' }}>{target}</span> ({targetDetail})
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {TARGETS.map((value) => {
            const isActive = target === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setTarget(value)}
                style={{
                  fontSize: 'var(--font-size-2xs)',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--color-border-accent)' : 'var(--color-border-subtle)',
                  background: isActive ? 'var(--color-bg-control-active)' : 'var(--color-bg-control)',
                  color: isActive ? 'var(--color-focus)' : 'var(--color-text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {value.toUpperCase()}
              </button>
            )
          })}
        </div>
        <textarea
          aria-label="Research note body"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Record alpha hypothesis, parameter rationale, microstructure observations…"
          spellCheck={false}
          rows={3}
          style={{
            width: '100%',
            resize: 'vertical',
            background: 'var(--color-bg-base)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-xs)',
            padding: 8,
            fontSize: 'var(--font-size-xs)',
            lineHeight: 1.5,
          }}
        />
        <button
          type="button"
          disabled={!draft.trim() || !targetId}
          onClick={addNote}
          style={{
            marginTop: 6,
            fontSize: 'var(--font-size-2xs)',
            padding: '5px 12px',
            background: 'var(--color-info)',
            color: 'var(--color-bg-base)',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            fontWeight: 700,
            cursor: !draft.trim() || !targetId ? 'not-allowed' : 'pointer',
          }}
        >
          SAVE RESEARCH NOTE
        </button>
      </Panel>

      <Panel title={`RESEARCH JOURNAL (${notes.length} ENTRIES)`}>
        {notes.map((note) => (
          <div
            key={note.id}
            style={{
              marginBottom: 6,
              padding: 8,
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-bg-raised)',
            }}
          >
            <div
              className="mono dim"
              style={{
                fontSize: '10px',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AttributionBadge kind={note.authoredBy.agentType === 'ai-assistant' ? 'ai' : 'human'} />
                <span>
                  [{note.targetType.toUpperCase()}] {note.targetId}
                </span>
              </div>
              <span>{new Date(note.createdAt).toISOString().slice(0, 16).replace('T', ' ')}</span>
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
              {note.body}
            </div>
          </div>
        ))}
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
