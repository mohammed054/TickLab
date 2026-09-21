import { useExperimentStore } from "../../shared/experiment-sync-bus"
import { useCallback } from "react"

export function ResearchNotes() {
  const { experiments, addNote, selectedExperimentId } = useExperimentStore()

  const handleAddNote = useCallback(
    (targetType: NoteTargetType, content: string, authoredBy: 'human' | 'ai-assistant' = 'human') => {
      addNote({
        id: Date.now().toString(),
        targetType,
        content,
        authoredBy,
        createdAt: new Date().toISOString(),
      })
    },
    [addExperiment]
  )

  if (!experiments || experiments.length === 0) {
    return <div style={{ padding: '16px', color: '#888' }}>No experiments loaded. Select an experiment to add notes.</div>
  }

  const currentExperiment = experiments.find((exp) => exp.id === selectedExperimentId)

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <h3 style={{ padding: '8px 12px', borderBottom: '1px solid #333', margin: '-8px -12px -4px', color: '#fff' }}>Research Notes</h3>
      <div style={{ background: '#1a1a1a', borderRadius: '4px', border: '1px solid #333', margin: '4px 12px', padding: '8px', color: '#888' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontWeight: '600' }}>Notes for:</span>
          <span style={{ color: '#666' }}>{currentExperiment?.strategyRefVersion || 'Unknown'}</span>
        </div>
        <textarea
          placeholder="Add a research note..."
          style={{
            width: '100%',
            height: '120px',
            background: '#0d0d0d',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '12px',
            resize: 'vertical',
            marginBottom: '8px',
          }}
        ></textarea>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleAddNote('experiment', 'Auto-generated observation', 'ai-assistant')}
            style={{
              flex: 1,
              padding: '6px 12px',
              background: '#3a3a3a',
              border: '1px solid #555',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            AI Observation
          </button>
          <button
            onClick={() => handleAddNote('experiment', 'Manual note', 'human')}
            style={{
              flex: 1,
              padding: '6px 12px',
              background: '#0d0d0d',
              border: '1px solid #555',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Add Note
          </button>
        </div>
      </div>
      <div style={{ marginTop: '24px', maxHeight: '300px', overflow: 'auto' }}>
        <h4 style={{ padding: '4px 8px', background: '#333', color: '#fff', fontSize: '12px', borderRadius: '3px', margin: '-4px' }}>
          Notes History
        </h4>
        <div style={{ background: '#0d0d0d', borderRadius: '4px', border: '1px solid #333', margin: '4px' }}>
          {currentExperiment?.notes?.map((note) => (
            <div
              key={note.id}
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '11px',
                color: note.authoredBy === 'human' ? '#ccc' : '#ff6b6b',
              }}
            >
              <span style={{ color: note.authoredBy === 'human' ? '#aaa' : '#f88' }}>
                {note.authoredBy}: {note.content.substring(0, 80)}{note.content.length > 80 && '...'}
              </span>
              <span style={{ fontSize: '10px', color: '#555' }}>{note.createdAt.substring(0, 16)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

type NoteTargetType = 'strategy' | 'experiment' | 'timestamp' | 'trade' | 'fill' | 'chart_view'