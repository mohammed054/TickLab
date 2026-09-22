import { useState } from 'react'
import { Panel } from '../shared/Panel'
import { useWorkspace } from '../../state/useWorkspace'

// "Why?" Investigation navigation shell per docs/08 §8.22. Question list
// matches docs/09 §9.14's methodology table exactly; each entry routes to the
// evidence view via the Sync Bus (mock: switches the Secondary tab).
const QUESTIONS: { q: string; evidence: string; tab: string }[] = [
  {
    q: 'Why did the strategy lose (in this period)?',
    evidence: 'P&L Attribution (§9.4) filtered to the period, sorted by magnitude of negative contribution.',
    tab: 'Analytics',
  },
  {
    q: "Why didn't this order fill?",
    evidence: 'Queue Analysis (§9.8) for that specific order — queue-ahead progression and what consumed it.',
    tab: 'Analytics',
  },
  {
    q: 'Why did inventory increase?',
    evidence: 'Inventory history (§7.13) for the period, cross-referenced with Fill Analysis (§9.5) one-sided fill run.',
    tab: 'Analytics',
  },
  {
    q: 'Why did fill rate collapse?',
    evidence: 'Queue Analysis (§9.8) aggregate view, cross-referenced with Liquidity Analysis (§9.12) for regime change.',
    tab: 'Analytics',
  },
  {
    q: 'Why did latency spike?',
    evidence: 'Latency Analysis (§9.9) for the period, cross-referenced with the Execution/System Monitor connection log (§7.15).',
    tab: 'Analytics',
  },
  {
    q: 'Why did P&L drop (at this specific instant)?',
    evidence: 'Trade Investigation (§8.20) for the nearest fill(s) — markout / adverse-selection (§9.6).',
    tab: 'Replay',
  },
]

export function WhyPanel() {
  const [, updateWorkspace] = useWorkspace()
  const [selected, setSelected] = useState(QUESTIONS[0].q)

  const active = QUESTIONS.find((e) => e.q === selected) ?? QUESTIONS[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="WHY INVESTIGATION (MOCK — NAVIGATION SHELL)">
        <div className="dim" style={{ fontSize: 11, marginBottom: 6 }}>
          Select a framed question — the workspace jumps to the evidence that answers it, not to a canned explanation.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {QUESTIONS.map((e) => (
            <button
              key={e.q}
              onClick={() => setSelected(e.q)}
              style={{
                textAlign: 'left',
                fontSize: 11,
                padding: '6px 8px',
                borderRadius: 3,
                border: '1px solid var(--border-1)',
                background: e.q === selected ? 'var(--bg-3)' : 'transparent',
                color: e.q === selected ? 'var(--text-0)' : 'var(--text-2)',
                fontWeight: e.q === selected ? 600 : 400,
              }}
            >
              {e.q}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="EVIDENCE ROUTE (MOCK)">
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-1)' }}>{active.evidence}</div>
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => updateWorkspace({ secondaryTab: active.tab })}
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
            JUMP TO EVIDENCE: {active.tab.toUpperCase()} (mock)
          </button>
        </div>
      </Panel>
    </div>
  )
}
