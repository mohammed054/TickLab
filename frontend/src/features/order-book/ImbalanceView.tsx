import { Panel } from '../../shared/design-system/Panel'

interface ImbalanceProps {
  bidVolumeInView: number
  askVolumeInView: number
  imbalanceRatio: number
}

export function ImbalanceView({ bidVolumeInView, askVolumeInView, imbalanceRatio }: ImbalanceProps) {
  const total = bidVolumeInView + askVolumeInView
  const bidPct = total > 0 ? (bidVolumeInView / total) * 100 : 50
  const askPct = total > 0 ? (askVolumeInView / total) * 100 : 50

  return (
    <Panel header="Imbalance">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', height: '20px', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${bidPct}%`, background: 'rgba(53,194,110,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="num" style={{ fontSize: 'var(--font-size-xs)', color: '#35c26e' }}>{bidPct.toFixed(0)}%</span>
          </div>
          <div style={{ width: `${askPct}%`, background: 'rgba(229,83,75,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="num" style={{ fontSize: 'var(--font-size-xs)', color: '#e5534b' }}>{askPct.toFixed(0)}%</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)' }}>
          <span style={{ color: '#35c26e' }}>BID {bidVolumeInView.toLocaleString()}</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>Ratio {imbalanceRatio.toFixed(2)}</span>
          <span style={{ color: '#e5534b' }}>ASK {askVolumeInView.toLocaleString()}</span>
        </div>
      </div>
    </Panel>
  )
}
