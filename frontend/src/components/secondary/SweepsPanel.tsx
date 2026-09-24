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
    return pnl >= 0 ? `rgba(62,207,142,${0.15 + t * 0.65})` : `rgba(239,91,91,${0.15 + t * 0.65})`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="PARAMETER SWEEP — SPREAD × INVENTORY SKEW → P&L (MOCK)">
        <p className="dim" style={{ fontSize: 10.5, marginTop: 0 }}>
          Synthetic surface for layout purposes only — not derived from any real backtest.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: `50px repeat(${skews.length}, 1fr)`, gap: 2, fontSize: 10 }} className="mono">
          <div />
          {skews.map((s) => (
            <div key={s} style={{ textAlign: 'center', color: 'var(--text-2)' }}>
              {s.toFixed(1)}
            </div>
          ))}
          {spreads.map((sp) => (
            <Fragment key={`row-${sp}`}>
              <div style={{ color: 'var(--text-2)', alignSelf: 'center' }}>{sp}t</div>
              {skews.map((sk) => {
                const cell = cells.find((c) => c.spread === sp && c.skew === sk)!
                return (
                  <div
                    key={`${sp}-${sk}`}
                    title={`spread ${sp} ticks, skew ${sk}: pnl ${cell.pnl}, fill ${cell.fillRate}%`}
                    style={{
                      background: colorFor(cell.pnl),
                      textAlign: 'center',
                      padding: '6px 0',
                      borderRadius: 2,
                      color: 'var(--text-0)',
                    }}
                  >
                    {cell.pnl}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 10, marginTop: 8 }}>
          rows = spread (ticks) · columns = inventory skew · cell = simulated net P&L ($)
        </div>
      </Panel>
    </div>
  )
}
