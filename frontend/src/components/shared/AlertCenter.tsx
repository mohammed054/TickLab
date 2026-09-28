import { useState } from 'react'
import { AlertRecord } from '../../contracts'
import { mockWorkbench } from '../../mock/workbench'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'
import { EmptyState } from '../../shared/design-system/primitives'
import { StatusDot } from './Panel'

const SEVERITY_STATE = { info: 'ok', warning: 'warn', critical: 'bad' } as const

export function AlertCenter() {
  const { alerts } = useWorkbench()
  const [, updateWorkspace] = useWorkspace()
  const [open, setOpen] = useState(false)
  const unreadCount = alerts.filter((alert) => !alert.acknowledged).length

  const openAlert = (alert: AlertRecord) => {
    mockWorkbench.acknowledgeAlert(alert.id)
    if (alert.linkedView) updateWorkspace({ activeTab: { secondaryMonitor: 'analytics' } })
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="mono"
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border-1)',
          borderRadius: 4,
          padding: '3px 8px',
          color: unreadCount > 0 ? 'var(--color-warning)' : 'var(--text-1)',
          fontSize: 10.5,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
        }}
      >
        ALERTS
        {unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} unread alerts`}
            style={{
              background: 'var(--color-warning)',
              color: '#080a0d',
              borderRadius: 3,
              padding: '0 4px',
              fontSize: 9,
              fontWeight: 800,
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Alert Center"
          style={{
            position: 'absolute',
            right: 0,
            top: '120%',
            width: 360,
            maxHeight: 440,
            overflow: 'auto',
            background: 'var(--bg-1)',
            border: '1px solid var(--border-focus)',
            borderRadius: 6,
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.7)',
            zIndex: 9999,
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-0)' }}>
              SYSTEM & TRADING ALERTS
            </span>
            <span className="mono dim" style={{ fontSize: 10 }}>{alerts.length} EVENTS</span>
          </div>

          {alerts.length === 0 ? (
            <EmptyState title="NO ACTIVE ALERTS" description="All execution parameters and data feeds operating normally." />
          ) : (
            alerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                onClick={() => openAlert(alert)}
                style={{
                  display: 'flex',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  border: 0,
                  borderBottom: '1px solid var(--border-1)',
                  background: alert.acknowledged ? 'transparent' : 'rgba(56, 189, 248, 0.04)',
                  color: 'inherit',
                  cursor: 'pointer',
                  transition: 'background 0.1s ease',
                }}
              >
                <div style={{ marginTop: 2 }}>
                  <StatusDot state={SEVERITY_STATE[alert.severity]} label={alert.severity} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: alert.acknowledged ? 400 : 600, color: 'var(--text-0)' }}>
                    {alert.message}
                  </div>
                  <div className="dim mono" style={{ fontSize: 9.5, marginTop: 3 }}>
                    {alert.type.toUpperCase()} · {new Date(alert.createdAt).toLocaleTimeString()} {alert.acknowledged ? '· ACK' : ''}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
