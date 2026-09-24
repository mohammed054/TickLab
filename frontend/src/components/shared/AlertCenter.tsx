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
      <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)} className="mono" style={{ background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, padding: '4px 8px', color: 'var(--color-text-secondary)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
        ALERTS
        {unreadCount > 0 && <span aria-label={`${unreadCount} unread alerts`} style={{ background: 'var(--color-warning)', color: 'var(--color-bg-base)', borderRadius: 8, padding: '0 5px', fontWeight: 700 }}>{unreadCount}</span>}
      </button>
      {open && <div role="dialog" aria-label="Alert Center" style={{ position: 'absolute', right: 0, top: '110%', width: 340, maxHeight: 420, overflow: 'auto', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border-strong)', borderRadius: 5, zIndex: 40 }}>
        <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 10, color: 'var(--color-text-muted)' }}>ALERT CENTER · {alerts.length} records</div>
        {alerts.length === 0 ? <EmptyState title="NO ALERTS" description="No alert events have been recorded in this scenario." /> : alerts.map((alert) => <button key={alert.id} type="button" onClick={() => openAlert(alert)} style={{ display: 'flex', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', border: 0, borderBottom: '1px solid var(--color-border-subtle)', background: alert.acknowledged ? 'transparent' : 'var(--color-bg-raised)', color: 'inherit', cursor: 'pointer' }}>
          <StatusDot state={SEVERITY_STATE[alert.severity]} label={alert.severity} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 11 }}>{alert.message}</div><div className="dim mono" style={{ fontSize: 9.5, marginTop: 2 }}>{alert.type} · {new Date(alert.createdAt).toLocaleTimeString()} {alert.acknowledged ? '· acknowledged' : ''}</div></div>
        </button>)}
      </div>}
    </div>
  )
}
