import { useEffect, useState } from 'react'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'
import { Panel } from '../shared/Panel'

export function ComparePanel() {
  const { experiments } = useWorkbench()
  const [, updateWorkspace] = useWorkspace()
  const complete = experiments.filter((experiment) => experiment.results !== null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => { if (selected.size === 0 && complete.length > 0) setSelected(new Set(complete.slice(0, 3).map((experiment) => experiment.id))) }, [complete, selected.size])
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
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const metrics: [string, (result: NonNullable<typeof complete[number]['results']>) => string][] = [['Return', (result) => `${result.headline.returnPct >= 0 ? '+' : ''}${result.headline.returnPct}%`], ['Max drawdown', (result) => `${result.headline.maxDrawdownPct}%`], ['Sharpe', (result) => `${result.headline.sharpe}`], ['Fill rate', (result) => `${result.headline.fillRatePct}%`], ['Fees', (result) => `$${result.headline.fees}`], ['Slippage', (result) => `$${result.headline.slippage}`]]

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}><Panel title="SELECT EXPERIMENTS TO COMPARE (MOCK)"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{complete.map((experiment) => <button key={experiment.id} type="button" aria-pressed={selected.has(experiment.id)} onClick={() => toggle(experiment.id)} style={{ fontSize: 10.5, padding: '4px 8px', borderRadius: 3, border: '1px solid var(--border-1)', background: selected.has(experiment.id) ? 'var(--bg-3)' : 'transparent', color: selected.has(experiment.id) ? 'var(--text-0)' : 'var(--text-2)' }}>{experiment.strategyRef.id} · {experiment.id}</button>)}</div></Panel><Panel title="COMPARISON (MOCK — no winner badges)" bodyStyle={{ padding: 0, overflowX: 'auto' }}><table className="mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}><thead><tr><th style={thStyle}>Metric</th>{rows.map((experiment) => <th key={experiment.id} style={thStyle}>{experiment.strategyRef.id}<br /><span className="dim" style={{ fontSize: 9 }}>{experiment.id}</span></th>)}</tr></thead><tbody>{metrics.map(([label, render]) => <tr key={label}><td style={tdStyle} className="dim">{label}</td>{rows.map((experiment) => <td key={experiment.id} style={tdStyle}>{experiment.results ? render(experiment.results) : '—'}</td>)}</tr>)}</tbody></table><div style={{ padding: 8, display: 'flex', justifyContent: 'flex-end' }}><button type="button" disabled={rows.length < 2} onClick={() => updateWorkspace({ activeTab: { secondaryMonitor: 'analytics' } })} style={{ fontSize: 10, padding: '5px 8px', background: 'var(--color-info)', color: 'var(--color-bg-base)', border: 0, borderRadius: 3 }}>OPEN ANALYTICS</button></div></Panel></div>
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border-1)', color: 'var(--text-2)', fontWeight: 600 }
const tdStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid var(--border-1)' }
