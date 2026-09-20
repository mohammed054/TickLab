import { useState } from 'react'
import { Panel } from '../../shared/design-system/Panel'

const EXCHANGES = ['Binance', 'Bybit', 'OKX'] as const
const MARKETS = ['USDT Futures', 'COIN-M Futures', 'Spot'] as const
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT'] as const
const DATA_TYPES = ['Trades', 'L2 Order Book', 'L3 Order Book'] as const

interface DatasetSelectorProps {
  exchange: string
  market: string
  symbol: string
  dataTypes: string[]
  startDate: string
  endDate: string
  onChange: (patch: Partial<DatasetSelectorProps>) => void
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
        {select('Symbol', symbol, SYMBOLS, 'symbol')}
        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Data Type</span>
          <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
            {DATA_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => toggleType(t)}
                style={{
                  padding: '3px 8px',
                  background: dataTypes.includes(t) ? 'var(--color-info)' : 'var(--color-bg-base)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '4px',
                  color: dataTypes.includes(t) ? '#fff' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-xs)',
                }}
              >
                {t}
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
