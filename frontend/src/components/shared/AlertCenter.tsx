import { useState } from 'react'
import { genMockAlerts } from '../../mock/mockData'
import { StatusDot } from './Panel'

const SEV_STATE = { info: 'ok', warn: 'warn', bad: 'bad' } as const

export function AlertCenter() {
  const [alerts] = useState(() => genMockAlerts(5))
  const [open, setOpen] = useState(false)
  const badCount = alerts.filter((a) => a.severity !== 'info').length

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mono"
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border-1)',
          borderRadius: 4,
          padding: '4px 8px',
          color: 'var(--text-1)',
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        ALERTS
        {badCount > 0 && (
          <span style={{ background: 'var(--warn)', color: '#2a1c0b', borderRadius: 8, padding: '0 5px', fontWeight: 700 }}>
            {badCount}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '110%',
            width: 300,
            background: 'var(--bg-1)',
            border: '1px solid var(--border-2)',
            borderRadius: 5,
            zIndex: 40,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-2)', borderBottom: '1px solid var(--border-1)' }}>
            ALERT CENTER (mock — simulated events)
          </div>
          {alerts.map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: 8, padding: '7px 10px', borderBottom: '1px solid var(--border-1)', fontSize: 11 }}>
              <StatusDot state={SEV_STATE[a.severity]} />
              <div>
                <div>{a.message}</div>
                <div className="dim mono" style={{ fontSize: 9.5 }}>
                  {new Date(a.t).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
