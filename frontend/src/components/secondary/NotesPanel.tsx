import { useState } from 'react'
import { Panel } from '../shared/Panel'
import { useWorkspace } from '../../state/useWorkspace'

// Research Notes per docs/08 §8.24: plain text + light markdown, timestamped,
// attributed, attachable to strategy / experiment / timestamp / trade / fill /
// chart view. Mock-local storage only.
type AttachTarget = 'strategy' | 'experiment' | 'timestamp' | 'trade' | 'fill' | 'chart'

interface Note {
  id: number
  author: string
  createdAt: string
  target: AttachTarget
  text: string
}

const TARGETS: AttachTarget[] = ['strategy', 'experiment', 'timestamp', 'trade', 'fill', 'chart']

const SEED_NOTES: Note[] = [
  {
    id: 1,
    author: 'executor-1 (mock)',
    createdAt: '2024-08-08 14:02',
    target: 'strategy',
    text: 'MM_V18 widens too slowly into the 14:00 volatility burst — try skew 0.45 next sweep.',
  },
  {
    id: 2,
    author: 'researcher (mock)',
    createdAt: '2024-08-08 15:31',
    target: 'trade',
    text: 'Fill MOCK-T-118 sat 4.8 BTC deep in queue for 220ms; queue model Power(2.0) looks right here.',
  },
]

export function NotesPanel() {
  const [ws] = useWorkspace()
  const [notes, setNotes] = useState<Note[]>(SEED_NOTES)
  const [target, setTarget] = useState<AttachTarget>('strategy')
  const [draft, setDraft] = useState('')

  const targetDetail =
    target === 'strategy'
      ? ws.activeStrategy
      : target === 'experiment'
        ? (ws.selectedExperimentId ?? 'no experiment selected')
        : target === 'timestamp'
          ? (ws.timestampMs ? new Date(ws.timestampMs).toISOString() : 'no timestamp committed')
          : target === 'trade' || target === 'fill'
            ? (ws.selectedTradeId ?? 'no trade selected')
            : 'current chart view (mock reference)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="RESEARCH NOTES (MOCK — LOCAL ONLY)">
        <div className="dim" style={{ fontSize: 11, marginBottom: 6 }}>
          Attach to: {target} ({targetDetail})
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {TARGETS.map((t) => (
            <button
              key={t}
              onClick={() => setTarget(t)}
              style={{
                fontSize: 10,
                padding: '3px 7px',
                borderRadius: 3,
                border: '1px solid var(--border-1)',
                background: t === target ? 'var(--bg-3)' : 'transparent',
                color: t === target ? 'var(--text-0)' : 'var(--text-2)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a note (plain text, light markdown)…"
          spellCheck={false}
          rows={3}
          style={{
            width: '100%',
            resize: 'vertical',
            background: 'var(--bg-0)',
            color: 'var(--text-0)',
            border: '1px solid var(--border-1)',
            borderRadius: 3,
            padding: 8,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        />
        <div style={{ marginTop: 6 }}>
          <button
            onClick={() => {
              const text = draft.trim()
              if (!text) return
              setNotes((prev) => [
                ...prev,
                {
                  id: prev.length + 1,
                  author: 'executor-4 (mock)',
                  createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
                  target,
                  text,
                },
              ])
              setDraft('')
            }}
            style={{
              fontSize: 11,
              padding: '6px 12px',
              background: 'var(--accent)',
              color: '#0d0f12',
              border: 'none',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            ADD NOTE
          </button>
        </div>
      </Panel>

      <Panel title={`SAVED NOTES (${notes.length}, MOCK)`}>
        {notes.map((n) => (
          <div
            key={n.id}
            style={{ marginBottom: 6, padding: 6, borderRadius: 3, border: '1px solid var(--border-1)' }}
          >
            <div className="mono dim" style={{ fontSize: 10, marginBottom: 3 }}>
              [{n.target}] {n.author} · {n.createdAt}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.5 }}>{n.text}</div>
          </div>
        ))}
      </Panel>
    </div>
  )
}
