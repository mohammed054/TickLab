import { useEffect, useMemo, useRef, useState } from 'react'
import { timestampNsToMs, Trade } from '../../contracts'
import { Panel } from '../shared/Panel'

type SideFilter = 'ALL' | 'BUY' | 'SELL'
type SizePreset = 'ALL' | 'large' | 'whale' | 'block' | 'million'

export function TradeTape({ trades, onSelect }: { trades: Trade[]; onSelect: (trade: Trade) => void }) {
  const [side, setSide] = useState<SideFilter>('ALL')
  const [preset, setPreset] = useState<SizePreset>('ALL')
  const [minSize, setMinSize] = useState(0)
  const [maxSize, setMaxSize] = useState(10)
  const [following, setFollowing] = useState(true)
  const previousCount = useRef(trades.length)
  const filtered = useMemo(() => trades.filter((trade) => (side === 'ALL' || trade.side === side) && trade.size >= minSize && trade.size <= maxSize && matchesPreset(trade.notional, preset)), [maxSize, minSize, preset, side, trades])
  const newCount = Math.max(0, trades.length - previousCount.current)
  useEffect(() => { previousCount.current = trades.length }, [trades.length])
  const list = [...filtered].reverse()

  return (
    <Panel title="TRADE TAPE (SIMULATED)" style={{ flex: '1 1 240px', minWidth: 220 }} bodyStyle={{ padding: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', gap: 3, padding: '4px 6px', borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap' }}>
        {(['ALL', 'BUY', 'SELL'] as SideFilter[]).map((value) => <button key={value} type="button" aria-pressed={side === value} onClick={() => setSide(value)} style={filterButtonStyle(side === value)}>{value}</button>)}
        {(['ALL', 'large', 'whale', 'block', 'million'] as SizePreset[]).map((value) => <button key={value} type="button" aria-pressed={preset === value} onClick={() => { setPreset(value); if (value === 'large') { setMinSize(0.01); setMaxSize(10) } }} style={filterButtonStyle(preset === value)}>{value === 'million' ? '$1M+' : value.toUpperCase()}</button>)}
        <input aria-label="Minimum trade size" type="number" min={0} step={0.001} value={minSize} onChange={(event) => setMinSize(Number(event.target.value))} style={numberStyle} />
        <input aria-label="Maximum trade size" type="number" min={0} step={0.001} value={maxSize} onChange={(event) => setMaxSize(Number(event.target.value))} style={numberStyle} />
      </div>
      {newCount > 0 && !following && <button type="button" onClick={() => setFollowing(true)} style={{ width: '100%', padding: '3px', border: 0, borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-info)', color: 'var(--color-bg-base)', fontSize: 9 }}>{newCount} NEW TRADES · JUMP TO LATEST</button>}
      <div onScroll={(event) => { const target = event.currentTarget; setFollowing(target.scrollTop < 8) }}>
        {list.map((trade) => <button type="button" key={trade.id} onClick={() => onSelect(trade)} className="mono" style={{ display: 'flex', gap: 8, width: '100%', padding: '2px 8px', border: 0, borderBottom: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'inherit', textAlign: 'left', fontSize: 11, cursor: 'pointer' }} onMouseEnter={(event) => (event.currentTarget.style.background = 'var(--color-bg-raised)')} onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}><span className="dim">{new Date(timestampNsToMs(trade.timestampNs)).toISOString().slice(11, 23)}</span><span className={trade.side === 'BUY' ? 'pos' : 'neg'} style={{ width: 34 }}>{trade.side}</span><span>{trade.price.toFixed(1)}</span><span className="dim">{trade.size.toFixed(3)} BTC</span><span className="dim" style={{ marginLeft: 'auto' }}>{trade.id}</span></button>)}
      </div>
    </Panel>
  )
}

function matchesPreset(notional: number, preset: SizePreset): boolean {
  if (preset === 'large') return notional >= 10_000
  if (preset === 'whale') return notional >= 50_000
  if (preset === 'block') return notional >= 100_000
  if (preset === 'million') return notional >= 1_000_000
  return true
}

const filterButtonStyle = (active: boolean): React.CSSProperties => ({ fontSize: 8, padding: '2px 4px', borderRadius: 3, border: '1px solid var(--color-border-subtle)', background: active ? 'var(--color-bg-control)' : 'transparent', color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)' })
const numberStyle: React.CSSProperties = { width: 62, background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 3, padding: '2px 4px', fontSize: 9 }
