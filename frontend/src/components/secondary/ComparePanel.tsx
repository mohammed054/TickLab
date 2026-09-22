import { useState } from 'react'
import { genMockExperiments, MockExperiment } from '../../mock/mockData'
import { Panel } from '../shared/Panel'

export function ComparePanel() {
  const [experiments] = useState<MockExperiment[]>(() => genMockExperiments().filter((e) => e.result))
  const [selected, setSelected] = useState<Set<string>>(new Set(experiments.slice(0, 3).map((e) => e.id)))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const rows = experiments.filter((e) => selected.has(e.id))
  const metrics: [string, (r: NonNullable<MockExperiment['result']>) => string, boolean?][] = [
    ['Return', (r) => `${r.returnPct >= 0 ? '+' : ''}${r.returnPct}%`, true],
    ['Max drawdown', (r) => `${r.maxDrawdownPct}%`],
    ['Sharpe', (r) => `${r.sharpe}`],
    ['Fill rate', (r) => `${r.fillRate}%`],
    ['Fees', (r) => `$${r.fees}`],
    ['Slippage', (r) => `$${r.slippage}`],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="SELECT EXPERIMENTS TO COMPARE (MOCK)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {experiments.map((e) => (
            <button
              key={e.id}
              onClick={() => toggle(e.id)}
              style={{
                fontSize: 10.5,
                padding: '4px 8px',
                borderRadius: 3,
                border: '1px solid var(--border-1)',
                background: selected.has(e.id) ? 'var(--bg-3)' : 'transparent',
                color: selected.has(e.id) ? 'var(--text-0)' : 'var(--text-2)',
              }}
            >
              {e.strategy}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="COMPARISON (MOCK — no winner badges, analyze the trade-offs)" bodyStyle={{ padding: 0, overflowX: 'auto' }}>
        <table className="mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={thStyle}>Metric</th>
              {rows.map((r) => (
                <th key={r.id} style={thStyle}>
                  {r.strategy}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(([label, fn]) => (
              <tr key={label}>
                <td style={tdStyle} className="dim">
                  {label}
                </td>
                {rows.map((r) => (
                  <td key={r.id} style={tdStyle}>
                    {fn(r.result!)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border-1)', color: 'var(--text-2)', fontWeight: 600 }
const tdStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid var(--border-1)' }
