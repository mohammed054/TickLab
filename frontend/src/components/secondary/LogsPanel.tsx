import { useState } from 'react'
import { genMockLogs, MockLogEntry } from '../../mock/mockData'
import { Panel } from '../shared/Panel'

const LEVEL_COLOR: Record<MockLogEntry['level'], string> = {
  DEBUG: 'var(--text-3)',
  INFO: 'var(--text-1)',
  WARNING: 'var(--warn)',
  ERROR: 'var(--neg)',
  CRITICAL: 'var(--neg)',
}

export function LogsPanel() {
  const [logs] = useState(() => genMockLogs(40))
  return (
    <Panel title="STRUCTURED LOGS (MOCK)" bodyStyle={{ padding: 0 }} style={{ height: '100%' }}>
      {logs.map((l, i) => (
        <div key={i} className="mono" style={{ display: 'flex', gap: 8, padding: '2px 8px', fontSize: 10.5, borderBottom: '1px solid var(--border-1)' }}>
          <span className="dim">{new Date(l.t).toISOString().slice(11, 19)}</span>
          <span style={{ color: LEVEL_COLOR[l.level], width: 62 }}>{l.level}</span>
          <span className="dim" style={{ width: 70 }}>
            {l.category}
          </span>
          <span>{l.message}</span>
        </div>
      ))}
    </Panel>
  )
}
