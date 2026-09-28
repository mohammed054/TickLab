import { useEffect, useState } from 'react'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'
import { Panel } from '../shared/Panel'

export function ComparePanel() {
  const { experiments } = useWorkbench()
  const [, updateWorkspace] = useWorkspace()
  const complete = experiments.filter((experiment) => experiment.results !== null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (selected.size === 0 && complete.length > 0) {
      setSelected(new Set(complete.slice(0, 3).map((experiment) => experiment.id)))
    }
  }, [complete, selected.size])

  useEffect(() => {
    const onSelection = (event: Event) => {
      const ids = (event as CustomEvent<unknown>).detail
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) return
      setSelected(new Set(ids.filter((id) => complete.some((experiment) => experiment.id === id))))
    }
    window.addEventListener('ticklab:compare-selection', onSelection)
    return () => window.removeEventListener('ticklab:compare-selection', onSelection)
  }, [complete])

  const rows = complete.filter((experiment) => selected.has(experiment.id))
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const metrics: [string, (result: NonNullable<(typeof complete)[number]['results']>) => string][] = [
    ['Net Return', (result) => `${result.headline.returnPct >= 0 ? '+' : ''}${result.headline.returnPct}%`],
    ['Max Drawdown', (result) => `${result.headline.maxDrawdownPct}%`],
    ['Sharpe Ratio', (result) => `${result.headline.sharpe}`],
    ['Sortino Ratio', (result) => `${result.headline.sortino}`],
    ['Total Trades', (result) => `${result.headline.trades.toLocaleString()}`],
    ['Fill Rate', (result) => `${result.headline.fillRatePct}%`],
    ['Execution Fees', (result) => `$${result.headline.fees}`],
    ['Modeled Slippage', (result) => `$${result.headline.slippage}`],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="SELECT EXPERIMENTS TO COMPARE">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {complete.map((experiment) => {
            const isSelected = selected.has(experiment.id)
            return (
              <button
                key={experiment.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(experiment.id)}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--color-border-accent)' : 'var(--color-border-subtle)',
                  background: isSelected ? 'var(--color-bg-control-active)' : 'var(--color-bg-control)',
                  color: isSelected ? 'var(--color-focus)' : 'var(--color-text-secondary)',
                  fontWeight: isSelected ? 600 : 400,
                }}
              >
                {experiment.strategyRef.id} · {experiment.id}
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel title="SIDE-BY-SIDE STRATEGY MATRIX" bodyStyle={{ padding: 0, overflowX: 'auto' }}>
        <table className="mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-raised)' }}>
              <th style={thStyle}>METRIC</th>
              {rows.map((experiment) => (
                <th key={experiment.id} style={thStyle}>
                  {experiment.strategyRef.id}
                  <br />
                  <span className="dim" style={{ fontSize: '9px' }}>
                    {experiment.id}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(([label, render]) => (
              <tr key={label} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <td style={tdStyle} className="dim">
                  {label}
                </td>
                {rows.map((experiment) => (
                  <td key={experiment.id} style={tdStyle}>
                    {experiment.results ? render(experiment.results) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ padding: 8, display: 'flex', justifyContent: 'flex-end', background: 'var(--color-bg-raised)' }}>
          <button
            type="button"
            disabled={rows.length < 2}
            onClick={() => updateWorkspace({ activeTab: { secondaryMonitor: 'analytics' } })}
            style={{
              fontSize: 'var(--font-size-2xs)',
              padding: '4px 10px',
              background: 'var(--color-info)',
              color: 'var(--color-bg-base)',
              border: 0,
              borderRadius: 'var(--radius-xs)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            OPEN IN ANALYTICS SUITE
          </button>
        </div>
      </Panel>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  borderBottom: '1px solid var(--color-border-subtle)',
  color: 'var(--color-text-muted)',
  fontWeight: 600,
  fontSize: 'var(--font-size-2xs)',
  letterSpacing: '0.04em',
}

const tdStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderBottom: '1px solid rgba(28, 36, 48, 0.4)',
  color: 'var(--color-text-primary)',
}
