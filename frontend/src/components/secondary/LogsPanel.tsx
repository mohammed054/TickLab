import { useMemo, useState } from 'react'
import { timestampNsToMs } from '../../contracts'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'
import { EmptyState } from '../../shared/design-system/primitives'
import { Panel } from '../shared/Panel'

const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const
const CATEGORIES = ['Market', 'Strategy', 'Orders', 'Execution', 'Risk', 'Data', 'System', 'Errors'] as const

export function LogsPanel() {
  const { logs, audit } = useWorkbench()
  const [, updateWorkspace] = useWorkspace()
  const [level, setLevel] = useState<(typeof LEVELS)[number] | 'ALL'>('ALL')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | 'ALL'>('ALL')
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => logs.filter((log) => (level === 'ALL' || log.level === level) && (category === 'ALL' || log.category === category) && `${log.message} ${log.service} ${JSON.stringify(log.context)}`.toLowerCase().includes(query.toLowerCase())), [category, level, logs, query])

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}><Panel title="STRUCTURED LOGS (MOCK)" bodyStyle={{ padding: 0 }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: 8, borderBottom: '1px solid var(--color-border-subtle)' }}><select aria-label="Filter log level" value={level} onChange={(event) => setLevel(event.target.value as typeof level)} style={filterStyle}><option value="ALL">All levels</option>{LEVELS.map((value) => <option key={value} value={value}>{value}</option>)}</select><select aria-label="Filter log category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} style={filterStyle}><option value="ALL">All categories</option>{CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select><input aria-label="Search logs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search logs" style={{ ...filterStyle, flex: 1, minWidth: 140 }} /></div>{filtered.length === 0 ? <EmptyState title="NO LOGS MATCH" description="Change the filters or search text to inspect another log stream." /> : filtered.map((log) => <button key={log.id} type="button" onClick={() => updateWorkspace({ timestamp: log.timestampNs, activeTab: { secondaryMonitor: 'event-inspector' } })} style={{ display: 'grid', gridTemplateColumns: '92px 78px 1fr', gap: 6, width: '100%', textAlign: 'left', padding: '4px 8px', border: 0, borderBottom: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'inherit', fontSize: 10.5, cursor: 'pointer' }}><span className="dim mono">{new Date(timestampNsToMs(log.timestampNs)).toISOString().slice(11, 19)}</span><span className={`mono ${log.level === 'ERROR' || log.level === 'CRITICAL' ? 'neg' : log.level === 'WARNING' ? 'warn' : 'info'}`}>{log.level}</span><span className="mono"><span className="dim">[{log.category}/{log.service}]</span> {log.message}</span></button>)}</Panel><Panel title={`AUDIT LOG (${audit.length}, APPEND-ONLY MOCK)`} bodyStyle={{ padding: 0 }}>{audit.length === 0 ? <EmptyState title="NO AUDIT EVENTS" description="Security and configuration actions will appear here." /> : audit.map((record) => <div key={record.id} className="mono" style={{ display: 'grid', gridTemplateColumns: '150px 1fr 90px', gap: 8, padding: '5px 8px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 10 }}><span className="dim">{new Date(timestampNsToMs(record.timestampNs)).toISOString().slice(11, 19)}</span><span>{record.action} · {record.objectType}/{record.objectId}<br /><span className="dim">{record.value}</span></span><span className="dim">{record.actor.type}</span></div>)}</Panel></div>
}

const filterStyle: React.CSSProperties = { background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: '4px 6px', fontSize: 'var(--font-size-xs)' }
