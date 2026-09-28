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
    setAuditMessage(`EMERGENCY KILL SWITCH ENGAGED: Recorded for ${workspace.exchange}/${workspace.symbol} in ${workspace.environment}`)
    updateWorkspace({ environment: 'RESEARCH' })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, height: '100%', overflow: 'auto' }}>
      <Panel title="HARD RISK LIMITS & GOVERNANCE">
        <NumericField label="Max Position Size" value={maxPosition} min={0.1} max={20} step={0.1} unit="BTC" onChange={setMaxPosition} />
        <NumericField label="Daily Loss Circuit-Breaker" value={maxDailyLoss} min={1} max={100_000} step={1} unit="USD" onChange={setMaxDailyLoss} />
        <NumericField label="Trailing Drawdown Kill-Threshold" value={maxDrawdown} min={0.1} max={100} step={0.1} unit="%" onChange={setMaxDrawdown} />
        
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-1)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 8, fontWeight: 600 }}>EMERGENCY ENGINE INTERRUPT</div>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={stopped}
              style={{
                width: '100%',
                padding: '9px 0',
                background: stopped ? 'var(--bg-2)' : 'rgba(244, 63, 94, 0.12)',
                color: stopped ? 'var(--text-2)' : 'var(--color-negative)',
                border: '1px solid var(--color-negative)',
                borderRadius: 4,
                fontWeight: 700,
                cursor: stopped ? 'not-allowed' : 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              {stopped ? 'STRATEGY HALTED (SAFE STATE)' : 'TRIGGER KILL SWITCH (STOP STRATEGY)'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={stop}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  background: 'var(--color-negative)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 4,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                CONFIRM EMERGENCY STOP
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  background: 'var(--bg-2)',
                  color: 'var(--text-1)',
                  border: '1px solid var(--border-1)',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                CANCEL
              </button>
            </div>
          )}
          {auditMessage && (
            <div role="status" style={{ marginTop: 8, color: 'var(--color-warning)', fontSize: '10px', background: 'rgba(245, 158, 11, 0.1)', padding: '6px 8px', borderRadius: 4, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              {auditMessage}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="REALTIME RISK TELEMETRY">
        <MetricRow label="Active Net Exposure" value={`${strategy.inventory.toFixed(3)} BTC`} valueClass={strategy.inventory !== 0 ? 'pos' : 'dim'} />
        <MetricRow label="Current Environment" value={workspace.environment} valueClass={workspace.environment === 'LIVE' ? 'neg' : workspace.environment === 'PAPER' ? 'info' : 'dim'} />
        <MetricRow label="Risk Engine State" value={stopped ? 'HALTED' : 'NOMINAL (ALL CONSTRAINTS CLEAR)'} valueClass={stopped ? 'neg' : 'pos'} />
        <MetricRow label="Intraday Max Drawdown" value="1.42%" valueClass="pos" />
        <MetricRow label="VaR (99% 1-Min Horizon)" value="$34.12 USD" />
        <MetricRow label="Pre-Trade Fat-Finger Filter" value="ACTIVE (Max 5.0 BTC / ord)" />
        <MetricRow label="Stale Order Purge Policy" value="ENABLED (500ms timeout)" />
        <MetricRow label="Cross-Exchange Basis Drift" value="0.04 bps" />
      </Panel>
    </div>
  )
}
