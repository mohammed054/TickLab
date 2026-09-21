import { useState } from 'react'
import { Panel } from '../../shared/design-system/Panel'

const EXCHANGES = ['Binance', 'Bybit', 'OKX'] as const
const MARKETS = ['USDT Futures', 'COIN-M Futures', 'Spot'] as const
const DATA_TYPES = ['Trades', 'L2 Order Book', 'L3 Order Book'] as const

// L3 (Market-By-Order) is backtest-only per docs/04 §4.10/§4.5 — live L3 not yet supported upstream
const L3_BACKTEST_ONLY = true

interface DatasetSelectorProps {
  exchange: string
  market: string
  symbol: string
  dataTypes: string[]
  startDate: string
  endDate: string
  onChange: (patch: Partial<DatasetSelectorProps>) => void
  symbols?: readonly string[]
}

export function DatasetSelector({
  exchange,
  market,
  symbol,
  dataTypes,
  startDate,
  endDate,
  onChange,
}: DatasetSelectorProps) {
  const toggleType = (t: string) => {
    const next = dataTypes.includes(t) ? dataTypes.filter((x) => x !== t) : [...dataTypes, t]
    onChange({ dataTypes: next })
  }

  const select = (label: string, value: string, options: readonly string[], key: keyof DatasetSelectorProps) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange({ [key]: e.target.value } as Partial<DatasetSelectorProps>)}
        style={{
          background: 'var(--color-bg-base)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '4px',
          color: 'var(--color-text-primary)',
          padding: '4px 6px',
          fontSize: 'var(--font-size-xs)',
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  )

  return (
    <Panel header="Dataset Selector">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {select('Exchange', exchange, EXCHANGES, 'exchange')}
        {select('Market', market, MARKETS, 'market')}
        {select('Symbol', symbol, symbols, 'symbol')}
        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Data Type</span>
          <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
            {DATA_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => toggleType(t)}
                style={{
                  padding: '3px 8px',
                  background: dataTypes.includes(t) && t !== 'L3 Order Book' ? 'var(--color-info)' : t === 'L3 Order Book' && dataTypes.includes(t) ? 'var(--color-warning)' : 'var(--color-bg-base)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '4px',
                  color: dataTypes.includes(t) && t !== 'L3 Order Book' ? '#fff' : t === 'L3 Order Book' && dataTypes.includes(t) ? '#000' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-xs)',
                }}
              >
                {t}
                title={t === 'L3 Order Book' && dataTypes.includes(t) ? 'L3 (Market-By-Order) — backtest-only: live L3 not yet supported upstream (docs/04 §4.10/§4.5)' : undefined}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Start Date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
              style={{
                background: 'var(--color-bg-base)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '4px',
                color: 'var(--color-text-primary)',
                padding: '4px 6px',
                fontSize: 'var(--font-size-xs)',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>End Date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
              style={{
                background: 'var(--color-bg-base)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '4px',
                color: 'var(--color-text-primary)',
                padding: '4px 6px',
                fontSize: 'var(--font-size-xs)',
              }}
            />
          </label>
        </div>
      </div>
    </Panel>
  )
}
