import { useEffect, useState } from 'react'
import { useWorkspace } from '../../state/useWorkspace'

const COMMANDS = [
  { label: 'Run backtest', tab: 'Backtest' },
  { label: 'Open BTC order book', tab: null },
  { label: 'Open strategy editor', tab: 'Strategy' },
  { label: 'Replay last timestamp', tab: 'Replay' },
  { label: 'Compare experiments', tab: 'Experiments' },
  { label: 'Show latest results', tab: 'Results' },
  { label: 'Show risk / kill switch', tab: 'Risk' },
  { label: 'Show logs', tab: 'Logs' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [, updateWorkspace] = useWorkspace()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh', zIndex: 50 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-1)', fontSize: 11, color: 'var(--text-2)' }}>
          Command Palette — Ctrl/Cmd+K · mock commands, no backend
        </div>
        {COMMANDS.map((c) => (
          <div
            key={c.label}
            onClick={() => {
              if (c.tab) updateWorkspace({ secondaryTab: c.tab })
              setOpen(false)
            }}
            style={{ padding: '9px 12px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid var(--border-1)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {c.label}
          </div>
        ))}
      </div>
    </div>
  )
}
