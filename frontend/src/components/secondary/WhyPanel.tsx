import { useState } from 'react'
import { Panel } from '../shared/Panel'
import { SecondaryTabId, TAB_LABELS } from '../../state/syncBus'
import { useWorkspace } from '../../state/useWorkspace'
import type { AnalyticsViewId } from '../../analytics/analyticsTypes'

const QUESTIONS: { q: string; evidence: string; tab: SecondaryTabId; view?: AnalyticsViewId }[] = [
  {
    q: 'Why did the strategy experience a drawdown in this period?',
    evidence: 'P&L Attribution breakdown filtered to the time horizon, sorted by largest negative component.',
    tab: 'analytics',
    view: 'attribution',
  },
  {
    q: "Why didn't this quote order fill at top of book?",
    evidence: 'Queue Dynamics model analyzing queue-ahead depth, cancellation velocity, and consumed liquidity.',
    tab: 'analytics',
    view: 'queue',
  },
  {
    q: 'Why did net inventory skew beyond target threshold?',
    evidence: 'Inventory historical exposure cross-referenced with consecutive one-sided fills in Fill Analysis.',
    tab: 'analytics',
    view: 'fills',
  },
  {
    q: 'Why did passive fill rate collapse during market volatility?',
    evidence: 'Queue progression combined with Liquidity Depth analysis during regime transition.',
    tab: 'analytics',
    view: 'liquidity',
  },
  {
    q: 'Why did gateway decision latency experience a tail spike?',
    evidence: 'Hardware latency breakdown across Feed Ingress, Alpha Evaluation, and Exchange Round-Trip time.',
    tab: 'analytics',
    view: 'latency',
  },
  {
    q: 'Why did P&L sharply drop at this specific millisecond tick?',
    evidence: 'Nanosecond event replay and adverse selection post-fill markout curve analysis.',
    tab: 'replay',
  },
]

export function WhyPanel() {
  const [, updateWorkspace] = useWorkspace()
  const [selected, setSelected] = useState(QUESTIONS[0].q)

  const active = QUESTIONS.find((e) => e.q === selected) ?? QUESTIONS[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="QUANT FORENSICS & ROOT-CAUSE INVESTIGATION">
        <div className="dim" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 8 }}>
          Select a diagnostic question to trace the exact quantitative proof and evidence across the analytics suite.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {QUESTIONS.map((e) => {
            const isSelected = e.q === selected
            return (
              <button
                key={e.q}
                onClick={() => setSelected(e.q)}
                style={{
                  textAlign: 'left',
                  fontSize: 'var(--font-size-xs)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--color-border-accent)' : 'var(--color-border-subtle)',
                  background: isSelected ? 'var(--color-bg-control-active)' : 'var(--color-bg-control)',
                  color: isSelected ? 'var(--color-focus)' : 'var(--color-text-secondary)',
                  fontWeight: isSelected ? 600 : 400,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ color: isSelected ? 'var(--color-focus)' : 'var(--color-text-muted)' }}>
                  {isSelected ? '▶' : '○'}
                </span>
                <span>{e.q}</span>
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel title="DIAGNOSTIC EVIDENCE ROUTE">
        <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
          {active.evidence}
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => {
              updateWorkspace({ activeTab: { secondaryMonitor: active.tab } })
              if (active.view) {
                window.dispatchEvent(new CustomEvent('ticklab:analytics-view', { detail: active.view }))
              }
            }}
            style={{
              fontSize: 'var(--font-size-xs)',
              padding: '6px 14px',
              background: 'var(--color-info)',
              color: 'var(--color-bg-base)',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            NAVIGATE TO EVIDENCE: {TAB_LABELS[active.tab].toUpperCase()}
          </button>
        </div>
      </Panel>
    </div>
  )
}
