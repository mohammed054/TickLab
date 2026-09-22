import { useState } from 'react'
import { Panel, MetricRow } from '../shared/Panel'

const TEMPLATES = ['Market Making', 'Mean Reversion', 'Momentum', 'Order Book Imbalance', 'Statistical Arbitrage', 'Custom']
const DEFAULT_CODE = `# MOCK — illustrative only, not executed
class MarketMaker(Strategy):
    def on_book_update(self, book):
        mid = book.mid_price()
        skew = self.inventory / self.inventory_limit
        bid = mid - self.spread_ticks * self.tick_size * (1 + skew)
        ask = mid + self.spread_ticks * self.tick_size * (1 - skew)
        self.requote(bid, ask, size=self.order_size)
`

export function StrategyPanel() {
  const [template, setTemplate] = useState('Market Making')
  const [code, setCode] = useState(DEFAULT_CODE)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      <Panel title="STRATEGY (MOCK)" style={{ flex: '0 0 auto' }}>
        <MetricRow label="Name" value="MM_V18" />
        <MetricRow label="Version" value="v18.4" />
        <MetricRow label="Status" value="BACKTESTED" valueClass="warn" />
        <MetricRow label="Environment" value="RESEARCH" />
        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TEMPLATES.map((t) => (
            <button
              key={t}
              onClick={() => setTemplate(t)}
              style={{
                fontSize: 10,
                padding: '3px 7px',
                borderRadius: 3,
                border: '1px solid var(--border-1)',
                background: t === template ? 'var(--bg-3)' : 'transparent',
                color: t === template ? 'var(--text-0)' : 'var(--text-2)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="STRATEGY EDITOR (MOCK — NOT EXECUTED)" style={{ flex: '1 1 auto', minHeight: 0 }} bodyStyle={{ padding: 0 }}>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%',
            height: '100%',
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: 'var(--bg-0)',
            color: 'var(--text-0)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            padding: 10,
            lineHeight: 1.5,
          }}
        />
      </Panel>

      <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
        {['Validate', 'Run', 'Backtest', 'Paper'].map((b) => (
          <button
            key={b}
            style={{
              flex: 1,
              padding: '7px 0',
              background: b === 'Backtest' ? 'var(--accent)' : 'var(--bg-2)',
              color: b === 'Backtest' ? '#0d0f12' : 'var(--text-1)',
              border: '1px solid var(--border-1)',
              borderRadius: 4,
              fontWeight: 600,
              fontSize: 11.5,
            }}
          >
            {b.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}
