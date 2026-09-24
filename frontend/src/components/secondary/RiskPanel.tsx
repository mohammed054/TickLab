import { useState } from 'react'
import { mockRuntime } from '../../mock/runtime/runtime'
import { mockWorkbench } from '../../mock/workbench'
import { useMarketRuntime } from '../../state/appStore'
import { useWorkspace } from '../../state/useWorkspace'
import { NumericField, Panel, MetricRow } from '../shared/Panel'

export function RiskPanel() {
  const { strategy } = useMarketRuntime()
  const [workspace, updateWorkspace] = useWorkspace()
  const [maxPosition, setMaxPosition] = useState(2)
  const [maxDailyLoss, setMaxDailyLoss] = useState(500)
  const [maxDrawdown, setMaxDrawdown] = useState(8)
  const [confirming, setConfirming] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [auditMessage, setAuditMessage] = useState('')

  const stop = () => {
    mockWorkbench.getSnapshot().jobs.filter((job) => job.progress.status === 'running' || job.progress.status === 'queued').forEach((job) => mockWorkbench.cancelJob(job.id))
    setStopped(true)
    setConfirming(false)
    mockRuntime.setStrategyStatus('STOPPED')
    mockRuntime.setEnvironment('RESEARCH')
    mockWorkbench.appendAudit('STOP_STRATEGY', 'strategy', workspace.strategy?.id ?? 'MM_V18', `${workspace.exchange}/${workspace.symbol}`)
    setAuditMessage(`STOP STRATEGY recorded for ${workspace.exchange}/${workspace.symbol} in ${workspace.environment}`)
    updateWorkspace({ environment: 'RESEARCH' })
  }

  return (
    <Panel title="RISK CONTROLS (MOCK)">
      <NumericField label="Max position" value={maxPosition} min={0.1} max={20} step={0.1} unit="BTC" onChange={setMaxPosition} />
      <NumericField label="Max daily loss" value={maxDailyLoss} min={1} max={100_000} step={1} unit="USD" onChange={setMaxDailyLoss} />
      <NumericField label="Max drawdown" value={maxDrawdown} min={0.1} max={100} step={0.1} unit="%" onChange={setMaxDrawdown} />
      <MetricRow label="Current exposure" value={`${strategy.inventory.toFixed(2)} BTC`} />
      <MetricRow label="Environment" value={workspace.environment} />
      <MetricRow label="Risk state" value={stopped ? 'STOPPED' : 'WITHIN LIMITS'} valueClass={stopped ? 'neg' : 'pos'} />
      {auditMessage && <div role="status" style={{ marginTop: 8, color: 'var(--color-warning)', fontSize: 'var(--font-size-xs)' }}>{auditMessage}</div>}
      <div style={{ marginTop: 10 }}>
        {!confirming ? <button type="button" onClick={() => setConfirming(true)} disabled={stopped} style={{ width: '100%', padding: '9px 0', background: 'var(--color-negative-dim)', color: 'var(--color-negative)', border: '1px solid var(--color-negative)', borderRadius: 4, fontWeight: 700 }}>STOP STRATEGY</button> : <div style={{ display: 'flex', gap: 6 }}><button type="button" onClick={stop} style={{ flex: 1, padding: '9px 0', background: 'var(--color-negative)', color: 'var(--color-text-primary)', border: 'none', borderRadius: 4, fontWeight: 700 }}>CONFIRM STOP</button><button type="button" onClick={() => setConfirming(false)} style={{ flex: 1, padding: '9px 0', background: 'var(--color-bg-control)', color: 'var(--color-text-primary)', border: '1px solid var(--border-1)', borderRadius: 4 }}>CANCEL</button></div>}
      </div>
    </Panel>
  )
}
