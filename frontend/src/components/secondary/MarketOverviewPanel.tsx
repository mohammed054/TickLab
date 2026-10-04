import { useMarketRuntime } from '../../state/appStore'
import { useWorkspace } from '../../state/useWorkspace'
import { DataTable, Panel } from '../shared/Panel'
import type { DataColumn } from '../shared/Panel'

interface MarketRow {
  symbol: string
  price: number
  change: number
  volume: number
  volatility: number
  funding: number
  basis: number
}

export function MarketOverviewPanel() {
  const runtime = useMarketRuntime()
  const [workspace, updateWorkspace] = useWorkspace()
  const base = runtime.candles[runtime.candles.length - 1]?.close ?? 0

  const rows: MarketRow[] = [
    { symbol: 'BTCUSDT', price: base, change: runtime.changePctSession, volume: runtime.volumeSessionUsd, volatility: 0.42, funding: 0.0001, basis: 14.50 },
    { symbol: 'ETHUSDT', price: base * 0.042, change: runtime.changePctSession * 0.8, volume: runtime.volumeSessionUsd * 0.62, volatility: 0.56, funding: 0.00008, basis: 3.20 },
    { symbol: 'SOLUSDT', price: base * 0.0017, change: runtime.changePctSession * 1.4, volume: runtime.volumeSessionUsd * 0.21, volatility: 0.78, funding: 0.00012, basis: 0.45 },
    { symbol: 'BNBUSDT', price: base * 0.0089, change: runtime.changePctSession * 0.5, volume: runtime.volumeSessionUsd * 0.15, volatility: 0.38, funding: 0.00005, basis: 0.85 },
    { symbol: 'XRPUSDT', price: 0.582, change: -1.24, volume: 840_000_000, volatility: 0.65, funding: 0.00009, basis: 0.002 },
  ]

  const columns: DataColumn<MarketRow>[] = [
    {
      key: 'symbol',
      header: 'INSTRUMENT',
      render: (row) => (
        <button
          type="button"
          onClick={() => updateWorkspace({ symbol: row.symbol, exchange: runtime.exchange })}
          style={{
            background: 'transparent',
            border: 0,
            color: row.symbol === workspace.symbol ? 'var(--color-brand-primary)' : 'var(--text-0)',
            padding: 0,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {row.symbol}
        </button>
      ),
    },
    {
      key: 'price',
      header: 'INDEX PRICE',
      align: 'right',
      render: (row) => <span className="mono">{row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>,
    },
    {
      key: 'change',
      header: 'SESSION CHG',
      align: 'right',
      render: (row) => (
        <span className={`mono ${row.change >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 600 }}>
          {row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%
        </span>
      ),
    },
    {
      key: 'volume',
      header: 'SESSION TURNOVER',
      align: 'right',
      render: (row) => <span className="mono">${(row.volume / 1_000_000_000).toFixed(2)}B</span>,
    },
    {
      key: 'basis',
      header: 'ANN. BASIS',
      align: 'right',
      render: (row) => <span className="mono pos">+{row.basis.toFixed(2)} pts</span>,
    },
    {
      key: 'volatility',
      header: 'PARKINSON VOL',
      align: 'right',
      render: (row) => <span className="mono">{(row.volatility * 100).toFixed(1)}%</span>,
    },
    {
      key: 'funding',
      header: '8H FUNDING',
      align: 'right',
      render: (row) => <span className="mono">{(row.funding * 100).toFixed(4)}%</span>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', overflow: 'auto' }}>
      <Panel title="MULTI-ASSET UNIVERSE OVERVIEW">
        <DataTable rows={rows} columns={columns} rowKey={(row) => row.symbol} ariaLabel="Market overview" />
        <div className="dim" style={{ marginTop: 8, fontSize: '10px' }}>
          Selecting an instrument binds the primary charting canvas and L2 order book ladder to that market feed.
        </div>
      </Panel>
      <Panel title="PERPETUAL DERIVATIVES MATRIX">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: '11px' }}>
          <div style={{ background: 'var(--bg-1)', padding: 8, borderRadius: 4, border: '1px solid var(--border-1)' }}>
            <div className="dim" style={{ fontSize: 9.5 }}>EST. NEXT FUNDING</div>
            <div className="mono pos" style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>+0.0100% in 02:44:18</div>
          </div>
          <div style={{ background: 'var(--bg-1)', padding: 8, borderRadius: 4, border: '1px solid var(--border-1)' }}>
            <div className="dim" style={{ fontSize: 9.5 }}>AGGREGATED OPEN INTEREST</div>
            <div className="mono" style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>$18.42B (324,500 BTC)</div>
          </div>
          <div style={{ background: 'var(--bg-1)', padding: 8, borderRadius: 4, border: '1px solid var(--border-1)' }}>
            <div className="dim" style={{ fontSize: 9.5 }}>24H LIQUIDATION VOLUME</div>
            <div className="mono neg" style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>$142.8M (78% Longs)</div>
          </div>
          <div style={{ background: 'var(--bg-1)', padding: 8, borderRadius: 4, border: '1px solid var(--border-1)' }}>
            <div className="dim" style={{ fontSize: 9.5 }}>GLOBAL LONG/SHORT RATIO</div>
            <div className="mono" style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>1.14 (53.3% Long)</div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
