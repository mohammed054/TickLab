import { useEffect, useMemo, useRef, useState } from 'react'
import { timestampNsToMs, Trade } from '../../contracts'
import { Panel } from '../shared/Panel'

type SideFilter = 'ALL' | 'BUY' | 'SELL'
type SizePreset = 'ALL' | 'large' | 'whale' | 'block' | 'million'

export function TradeTape({
  trades,
  onSelect,
}: {
  trades: Trade[]
  onSelect: (trade: Trade) => void
}) {
  const [side, setSide] = useState<SideFilter>('ALL')
  const [preset, setPreset] = useState<SizePreset>('ALL')
  const [minSize, setMinSize] = useState(0)
  const [maxSize, setMaxSize] = useState(50)
  const [following, setFollowing] = useState(true)
  const previousCount = useRef(trades.length)

  const filtered = useMemo(
    () =>
      trades.filter(
        (trade) =>
          (side === 'ALL' || trade.side === side) &&
          trade.size >= minSize &&
          trade.size <= maxSize &&
          matchesPreset(trade.notional, preset)
      ),
    [maxSize, minSize, preset, side, trades]
  )

  const newCount = Math.max(0, trades.length - previousCount.current)
  useEffect(() => {
    previousCount.current = trades.length
  }, [trades.length])

  const list = [...filtered].reverse()
  const maxVolumeInView = Math.max(...list.map((t) => t.size), 1)

  return (
    <Panel
      title="TIME & SALES (TRADE TAPE)"
      style={{ flex: '1 1 240px', minWidth: 220, height: '100%' }}
      bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column' }}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono dim" style={{ fontSize: '9px' }}>
            {filtered.length} TRADES
          </span>
        </div>
      }
    >
      {/* Tape Filter Controls */}
      <div
        style={{
          display: 'flex',
          gap: 3,
          padding: '3px 6px',
          borderBottom: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-raised)',
          flexWrap: 'wrap',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        {(['ALL', 'BUY', 'SELL'] as SideFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={side === value}
            onClick={() => setSide(value)}
            style={filterButtonStyle(side === value)}
          >
            {value}
          </button>
        ))}

        {(['ALL', 'large', 'whale', 'block'] as SizePreset[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={preset === value}
            onClick={() => {
              setPreset(value)
              if (value === 'large') {
                setMinSize(0.1)
                setMaxSize(50)
              } else if (value === 'whale') {
                setMinSize(1.0)
                setMaxSize(50)
              } else if (value === 'block') {
                setMinSize(5.0)
                setMaxSize(100)
              } else {
                setMinSize(0)
                setMaxSize(50)
              }
            }}
            style={filterButtonStyle(preset === value)}
          >
            {value.toUpperCase()}
          </button>
        ))}
      </div>

      {newCount > 0 && !following && (
        <button
          type="button"
          onClick={() => setFollowing(true)}
          style={{
            width: '100%',
            padding: '2px',
            background: 'var(--color-info-dim)',
            color: 'var(--color-info)',
            borderBottom: '1px solid rgba(56, 189, 248, 0.3)',
            fontSize: '9px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ▲ {newCount} NEW TRADES · JUMP TO LATEST
        </button>
      )}

      {/* Trade Column Headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '55px 32px 1fr 1fr',
          padding: '2px 8px',
          fontSize: '8.5px',
          fontWeight: 600,
          color: 'var(--color-text-muted)',
          borderBottom: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-panel)',
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
      >
        <span>TIME</span>
        <span>SIDE</span>
        <span style={{ textAlign: 'right' }}>PRICE</span>
        <span style={{ textAlign: 'right' }}>SIZE (BTC)</span>
      </div>

      {/* Streaming List */}
      <div
        style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0 }}
        onScroll={(event) => {
          const target = event.currentTarget
          setFollowing(target.scrollTop < 8)
        }}
      >
        {list.map((trade) => {
          const isBuy = trade.side === 'BUY'
          const volumePct = Math.min(100, (trade.size / maxVolumeInView) * 100)
          return (
            <button
              type="button"
              key={trade.id}
              onClick={() => onSelect(trade)}
              className="mono"
              style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: '55px 32px 1fr 1fr',
                gap: 4,
                width: '100%',
                padding: '2px 8px',
                border: 0,
                borderBottom: '1px solid rgba(28, 36, 48, 0.4)',
                background: 'transparent',
                color: 'inherit',
                textAlign: 'left',
                fontSize: '10.5px',
                cursor: 'pointer',
                transition: 'background 0.08s ease',
              }}
              onMouseEnter={(event) => (event.currentTarget.style.background = 'rgba(56, 189, 248, 0.08)')}
              onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
            >
              {/* Volume bar highlight */}
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: `${volumePct}%`,
                  background: isBuy ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
                  pointerEvents: 'none',
                }}
              />

              <span className="dim" style={{ fontSize: '9.5px' }}>
                {new Date(timestampNsToMs(trade.timestampNs)).toISOString().slice(14, 23)}
              </span>

              <span
                style={{
                  fontWeight: 700,
                  fontSize: '9px',
                  color: isBuy ? 'var(--color-positive)' : 'var(--color-negative)',
                }}
              >
                {trade.side}
              </span>

              <span
                style={{
                  textAlign: 'right',
                  color: isBuy ? 'var(--color-positive)' : 'var(--color-negative)',
                  fontWeight: 600,
                }}
              >
                {trade.price.toFixed(1)}
              </span>

              <span
                style={{
                  textAlign: 'right',
                  color: trade.size >= 1.0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  fontWeight: trade.size >= 1.0 ? 700 : 400,
                }}
              >
                {trade.size.toFixed(3)}
              </span>
            </button>
          )
        })}
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

const filterButtonStyle = (active: boolean): React.CSSProperties => ({
  fontSize: '8.5px',
  padding: '1px 5px',
  borderRadius: '2px',
  border: '1px solid',
  borderColor: active ? 'var(--color-border-accent)' : 'var(--color-border-subtle)',
  background: active ? 'var(--color-bg-control-active)' : 'transparent',
  color: active ? 'var(--color-focus)' : 'var(--color-text-muted)',
  fontWeight: active ? 700 : 400,
})
