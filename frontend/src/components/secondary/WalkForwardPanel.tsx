import { useMemo } from 'react'
import { generateRobustness, generateWalkForward } from '../../mock/mockData'
import { Panel } from '../shared/Panel'

const ROLE_STYLE = {
  TRAIN: { color: 'var(--color-brand-primary)', bg: 'rgba(56, 189, 248, 0.08)', border: 'rgba(56, 189, 248, 0.3)' },
  VALIDATION: { color: 'var(--color-warning)', bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.3)' },
  TEST: { color: 'var(--color-positive)', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.3)' },
} as const

export function WalkForwardPanel() {
  const splits = useMemo(() => generateWalkForward(), [])
  const robustness = useMemo(() => generateRobustness(), [])
  const min = Math.min(...robustness)
  const max = Math.max(...robustness)

  const groups = Array.from(new Set(splits.map((s) => s.label)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', overflow: 'auto' }}>
      <Panel title="WALK-FORWARD CROSS-VALIDATION MATRIX">
        <div className="dim" style={{ fontSize: 10.5, marginBottom: 10 }}>
          Rolling in-sample calibration vs. anchored out-of-sample execution to verify parameter stability and prevent overfitting.
        </div>
        {groups.map((g) => (
          <div key={g} style={{ marginBottom: 12, background: 'var(--bg-1)', padding: 10, borderRadius: 6, border: '1px solid var(--border-1)' }}>
            <div className="mono" style={{ fontWeight: 600, marginBottom: 6, fontSize: 11, color: 'var(--text-0)' }}>
              {g}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {splits
                .filter((s) => s.label === g)
                .map((s) => {
                  const style = ROLE_STYLE[s.role]
                  return (
                    <div
                      key={s.range}
                      style={{
                        flex: 1,
                        border: `1px solid ${style.border}`,
                        background: style.bg,
                        borderRadius: 4,
                        padding: '8px 10px',
                        fontSize: 11,
                      }}
                    >
                      <div style={{ color: style.color, fontWeight: 700, fontSize: 10, letterSpacing: '0.05em' }}>{s.role}</div>
                      <div className="mono dim" style={{ fontSize: 10, marginTop: 2 }}>{s.range}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span className="mono" style={{ fontSize: 10.5 }}>Sharpe: {s.sharpe}</span>
                        <span className="mono pos" style={{ fontSize: 10.5, fontWeight: 600 }}>+{s.returnPct}%</span>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        ))}
      </Panel>

      <Panel title="MONTE CARLO LATENCY & PARAMETER ROBUSTNESS">
        <div className="dim" style={{ fontSize: 10.5, marginBottom: 8 }}>
          Empirical distribution of strategy net P&L across {robustness.length} randomized latency jitter and queue displacement permutations.
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, background: 'var(--bg-1)', padding: '10px 8px 4px 8px', borderRadius: 4, border: '1px solid var(--border-1)' }}>
          {robustness.map((v, i) => (
            <div
              key={i}
              title={`Trial #${i + 1}: $${v}`}
              style={{
                flex: 1,
                height: `${Math.max(4, ((v - min) / (max - min || 1)) * 100)}%`,
                background: v >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
                opacity: 0.8,
                borderRadius: '1px 1px 0 0',
                transition: 'opacity 0.15s ease',
              }}
            />
          ))}
        </div>
        <div className="dim mono" style={{ fontSize: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span>95% CI MIN: ${min.toFixed(0)}</span>
          <span className="pos">MEDIAN: +${((min + max) / 2).toFixed(0)}</span>
          <span>95% CI MAX: ${max.toFixed(0)}</span>
        </div>
      </Panel>
    </div>
  )
}
