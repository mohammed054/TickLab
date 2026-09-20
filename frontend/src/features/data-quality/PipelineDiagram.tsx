import { Panel } from '../../shared/design-system/Panel'

const PIPELINE_STAGES = [
  'RAW EXCHANGE DATA',
  'VALIDATION',
  'NORMALIZATION',
  'ORDER BOOK RECONSTRUCTION',
  'TRADE ALIGNMENT',
  'TIMESTAMP VALIDATION',
  'HFTBACKTEST FORMAT',
  'READY',
] as const

type StageStatus = 'complete' | 'current' | 'pending'

interface PipelineDiagramProps {
  currentStage: number
  progressPct: number | null
}

export function PipelineDiagram({ currentStage, progressPct }: PipelineDiagramProps) {
  return (
    <Panel header="Pipeline">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', alignItems: 'center' }}>
        {PIPELINE_STAGES.map((stage, i) => {
          const status: StageStatus = i < currentStage ? 'complete' : i === currentStage ? 'current' : 'pending'
          const bg = status === 'complete' ? 'var(--color-positive)' : status === 'current' ? 'var(--color-info)' : 'var(--color-bg-base)'
          const textColor = status === 'pending' ? 'var(--color-text-secondary)' : '#fff'
          const border = status === 'current' ? '1px solid var(--color-info)' : '1px solid var(--color-border-subtle)'

          return (
            <div key={stage} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              <div
                style={{
                  padding: '4px 12px',
                  background: bg,
                  border,
                  borderRadius: '4px',
                  fontSize: 'var(--font-size-xs)',
                  color: textColor,
                  fontWeight: status === 'current' ? 600 : 400,
                  width: '100%',
                  textAlign: 'center',
                }}
              >
                {stage}
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <div style={{ width: '1px', height: '12px', background: 'var(--color-border-subtle)' }} />
              )}
            </div>
          )
        })}
        {progressPct != null && (
          <div style={{ marginTop: '8px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
              <span>Progress</span>
              <span className="num">{progressPct.toFixed(0)}%</span>
            </div>
            <div style={{ height: '4px', background: 'var(--color-bg-base)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--color-info)', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}
