import { MockTrade } from '../../mock/mockData'
import { Panel } from '../shared/Panel'

export function TradeTape({ trades, onSelect }: { trades: MockTrade[]; onSelect: (t: MockTrade) => void }) {
  const list = [...trades].reverse()
  return (
    <Panel title="TRADE TAPE (SIMULATED)" style={{ flex: '1 1 240px', minWidth: 220 }} bodyStyle={{ padding: 0, overflowY: 'auto' }}>
      {list.map((t) => (
        <div
          key={t.id}
          onClick={() => onSelect(t)}
          style={{
            display: 'flex',
            gap: 8,
            padding: '2px 8px',
            fontSize: 11,
            cursor: 'pointer',
          }}
          className="mono"
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span className="dim">{new Date(t.t).toISOString().slice(11, 23)}</span>
          <span className={t.side === 'BUY' ? 'pos' : 'neg'} style={{ width: 34 }}>
            {t.side}
          </span>
          <span>{t.price.toFixed(1)}</span>
          <span className="dim">{t.size.toFixed(3)} BTC</span>
        </div>
      ))}
    </Panel>
  )
}
