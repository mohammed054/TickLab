import { useMemo, useState } from 'react'
import { timestampNsToMs } from '../../contracts'
import type { Trade } from '../../contracts'
import { fmtClock, fmtPrice, fmtSize } from '../../shared/format'
import { MMPanel, Seg } from './mm'

const SIDES = [
  { value: 'ALL', label: 'All' },
  { value: 'BUY', label: 'Buy' },
  { value: 'SELL', label: 'Sell' },
] as const
const MIN_SIZES = [
  { value: 0, label: 'Any size' },
  { value: 0.1, label: '≥ 0.1 BTC' },
  { value: 0.5, label: '≥ 0.5 BTC' },
  { value: 1, label: '≥ 1 BTC' },
]
const MAX_ROWS = 150
const BIG_TRADE_BTC = 1

/** Time & sales, newest first. Colour = aggressor side. */
export function TradeTape({ trades, onSelect }: { trades: Trade[]; onSelect: (trade: Trade) => void }) {
  const [side, setSide] = useState<(typeof SIDES)[number]['value']>('ALL')
  const [minSize, setMinSize] = useState(0)

  const rows = useMemo(() => {
    const out: Trade[] = []
    for (const trade of trades) {
      if ((side === 'ALL' || trade.side === side) && trade.size >= minSize) out.push(trade)
      if (out.length >= MAX_ROWS) break
    }
    return out
  }, [trades, side, minSize])

  return (
    <MMPanel
      title="Trades"
      flush
      right={
        <>
          <select className="mm-select" aria-label="Minimum trade size" value={minSize} onChange={(e) => setMinSize(Number(e.target.value))}>
            {MIN_SIZES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Seg options={SIDES} value={side} onChange={setSide} label="Aggressor side" />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="mm-tape-row mm-thead" style={{ height: 20, cursor: 'default', flex: '0 0 auto' }}>
          <span>Time (UTC)</span>
          <span>Price</span>
          <span>Size (BTC)</span>
        </div>
        <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
          {rows.length === 0 && <div className="mm-empty">No trades match this filter</div>}
          {rows.map((trade) => (
            <button
              type="button"
              key={trade.id}
              className={`mm-tape-row num${trade.size >= BIG_TRADE_BTC ? ' big' : ''}`}
              onClick={() => onSelect(trade)}
              title="Open this trade in Replay"
            >
              <span className="muted">{fmtClock(timestampNsToMs(trade.timestampNs), true)}</span>
              <span className={trade.side === 'BUY' ? 'pos' : 'neg'}>{fmtPrice(trade.price)}</span>
              <span>{fmtSize(trade.size)}</span>
            </button>
          ))}
        </div>
      </div>
    </MMPanel>
  )
}
