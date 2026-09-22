import { useMemo } from 'react'
import { genMockWalkForward, genMockRobustness } from '../../mock/mockData'
import { Panel } from '../shared/Panel'

const ROLE_COLOR = { TRAIN: 'var(--info)', VALIDATION: 'var(--warn)', TEST: 'var(--pos)' } as const

export function WalkForwardPanel() {
  const splits = useMemo(() => genMockWalkForward(), [])
  const robustness = useMemo(() => genMockRobustness(), [])
  const min = Math.min(...robustness)
  const max = Math.max(...robustness)

  const groups = Array.from(new Set(splits.map((s) => s.label)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="WALK-FORWARD / OUT-OF-SAMPLE (MOCK)">
        <p className="dim" style={{ fontSize: 10.5, marginTop: 0 }}>
          Which data trained the strategy vs. which was never seen before testing.
        </p>
        {groups.map((g) => (
          <div key={g} style={{ marginBottom: 10 }}>
            <div className="mono" style={{ fontWeight: 600, marginBottom: 4, fontSize: 11 }}>
              {g}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {splits
                .filter((s) => s.label === g)
                .map((s) => (
                  <div
                    key={s.range}
                    style={{
                      flex: 1,
                      border: `1px solid ${ROLE_COLOR[s.role]}`,
                      borderRadius: 4,
                      padding: 6,
                      fontSize: 10.5,
                    }}
                  >
                    <div style={{ color: ROLE_COLOR[s.role], fontWeight: 700, fontSize: 9.5 }}>{s.role}</div>
                    <div className="mono dim">{s.range}</div>
                    <div className="mono">Sharpe {s.sharpe}</div>
                    <div className="mono pos">+{s.returnPct}%</div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </Panel>

      <Panel title="ROBUSTNESS — PARAMETER/LATENCY PERTURBATION (MOCK)">
        <p className="dim" style={{ fontSize: 10.5, marginTop: 0 }}>
          Distribution of net P&L across {robustness.length} simulated perturbed runs.
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 70 }}>
          {robustness.map((v, i) => (
            <div
              key={i}
              title={`$${v}`}
              style={{
                flex: 1,
                height: `${((v - min) / (max - min || 1)) * 100}%`,
                background: v >= 0 ? 'var(--pos)' : 'var(--neg)',
                opacity: 0.75,
                minHeight: 2,
              }}
            />
          ))}
        </div>
        <div className="dim mono" style={{ fontSize: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span>min ${min}</span>
          <span>max ${max}</span>
        </div>
      </Panel>
    </div>
  )
}
