import { Fragment, useMemo } from 'react'
import { generateParameterSweep } from '../../mock/mockData'
import { Panel } from '../shared/Panel'

export function SweepsPanel() {
  const cells = useMemo(() => generateParameterSweep(), [])
  const spreads = Array.from(new Set(cells.map((c) => c.spread)))
  const skews = Array.from(new Set(cells.map((c) => c.skew)))
  const maxAbs = Math.max(...cells.map((c) => Math.abs(c.pnl)))

  function colorFor(pnl: number) {
    const t = Math.min(1, Math.abs(pnl) / maxAbs)
    return pnl >= 0 ? `rgba(16, 185, 129, ${0.12 + t * 0.55})` : `rgba(244, 63, 94, ${0.12 + t * 0.55})`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', overflow: 'auto' }}>
      <Panel title="2D PARAMETER OPTIMIZATION MATRIX — QUOTING SPREAD × INVENTORY SKEW">
        <div className="dim" style={{ fontSize: 10.5, marginBottom: 12 }}>
          Grid optimization response surface evaluating simulated net P&L across discrete Avellaneda-Stoikov half-spreads and gamma inventory penalties.
        </div>
        
        <div style={{ background: 'var(--bg-1)', padding: 12, borderRadius: 6, border: '1px solid var(--border-1)', overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `70px repeat(${skews.length}, minmax(48px, 1fr))`, gap: 4, fontSize: 10 }} className="mono">
            <div style={{ color: 'var(--text-2)', fontWeight: 600, padding: 4 }}>SPREAD \ SKEW</div>
            {skews.map((s) => (
              <div key={s} style={{ textAlign: 'center', color: 'var(--text-2)', padding: 4, fontWeight: 600 }}>
                γ={s.toFixed(1)}
              </div>
            ))}
            {spreads.map((sp) => (
              <Fragment key={`row-${sp}`}>
                <div style={{ color: 'var(--text-2)', alignSelf: 'center', padding: '4px 6px', fontWeight: 600 }}>
                  {sp} ticks
                </div>
                {skews.map((sk) => {
                  const cell = cells.find((c) => c.spread === sp && c.skew === sk)!
                  return (
                    <div
                      key={`${sp}-${sk}`}
                      title={`Half-Spread: ${sp} ticks | Skew Gamma: ${sk} | Net P&L: $${cell.pnl} | Fill Rate: ${cell.fillRate}%`}
                      style={{
                        background: colorFor(cell.pnl),
                        textAlign: 'center',
                        padding: '8px 0',
                        borderRadius: 3,
                        color: cell.pnl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
                        fontWeight: 600,
                        border: '1px solid rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                        transition: 'transform 0.1s ease',
                      }}
                    >
                      ${cell.pnl}
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
        
        <div className="dim" style={{ fontSize: 10, marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span>Y-Axis: Half-Spread (Ticks) · X-Axis: Inventory Skew γ · Cell: Simulated Net P&L (USD)</span>
          <span className="mono">Optimal Point: 3.0 ticks / γ=0.4 (+$842.50)</span>
        </div>
      </Panel>
    </div>
  )
}
