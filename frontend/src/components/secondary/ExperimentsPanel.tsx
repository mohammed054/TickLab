import { useState } from 'react'
import { genMockExperiments, MockExperiment } from '../../mock/mockData'
import { Panel, StatusDot } from '../shared/Panel'
import { useWorkspace } from '../../state/useWorkspace'

const STATUS_STATE: Record<MockExperiment['status'], 'ok' | 'warn' | 'bad' | 'off'> = {
  RUNNING: 'warn',
  QUEUED: 'off',
  COMPLETE: 'ok',
  FAILED: 'bad',
}

export function ExperimentsPanel() {
  const [experiments] = useState<MockExperiment[]>(() => genMockExperiments())
  const [, updateWorkspace] = useWorkspace()

  return (
    <Panel title="EXPERIMENTS (MOCK)" bodyStyle={{ padding: 0 }} style={{ height: '100%' }}>
      {experiments.map((e) => (
        <div
          key={e.id}
          onClick={() => updateWorkspace({ selectedExperimentId: e.id, secondaryTab: 'Results' })}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '7px 10px',
            borderBottom: '1px solid var(--border-1)',
            cursor: 'pointer',
          }}
          onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--bg-2)')}
          onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
        >
          <div>
            <div className="mono" style={{ fontWeight: 600 }}>
              {e.strategy}
            </div>
            <div className="dim" style={{ fontSize: 10.5 }}>
              {e.label}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 10.5 }}>
              <StatusDot state={STATUS_STATE[e.status]} /> {e.status}
            </div>
            {e.result && (
              <div className={`mono ${e.result.netPnl >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 10.5 }}>
                {e.result.netPnl >= 0 ? '+' : ''}${e.result.netPnl}
              </div>
            )}
          </div>
        </div>
      ))}
    </Panel>
  )
}
