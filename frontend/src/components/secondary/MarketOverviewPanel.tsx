import { useMarketRuntime } from '../../state/appStore'
import { useWorkspace } from '../../state/useWorkspace'
import { DataTable, Panel } from '../shared/Panel'
import type { DataColumn } from '../shared/Panel'

interface MarketRow { symbol: string; price: number; change: number; volume: number; volatility: number; funding: number }

export function MarketOverviewPanel() {
  const runtime = useMarketRuntime()
  const [workspace, updateWorkspace] = useWorkspace()
  const base = runtime.candles[runtime.candles.length - 1]?.close ?? 0
  const rows: MarketRow[] = [
    { symbol: 'BTCUSDT', price: base, change: runtime.changePct24h, volume: runtime.volume24hUsd, volatility: 0.42, funding: 0.0001 },
    { symbol: 'ETHUSDT', price: base * 0.042, change: runtime.changePct24h * 0.8, volume: runtime.volume24hUsd * 0.62, volatility: 0.56, funding: 0.00008 },
    { symbol: 'SOLUSDT', price: base * 0.0017, change: runtime.changePct24h * 1.4, volume: runtime.volume24hUsd * 0.21, volatility: 0.78, funding: 0.00012 },
  ]
  const columns: DataColumn<MarketRow>[] = [
    { key: 'symbol', header: 'SYMBOL', render: (row) => <button type="button" onClick={() => updateWorkspace({ symbol: row.symbol, exchange: runtime.exchange })} style={{ background: 'transparent', border: 0, color: row.symbol === workspace.symbol ? 'var(--color-info)' : 'var(--color-text-primary)', padding: 0, fontWeight: 700 }}>{row.symbol}</button> },
    { key: 'price', header: 'PRICE', align: 'right', render: (row) => <span className="mono">{row.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> },
    { key: 'change', header: '24H', align: 'right', render: (row) => <span className={`mono ${row.change >= 0 ? 'pos' : 'neg'}`}>{row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%</span> },
    { key: 'volume', header: 'VOLUME', align: 'right', render: (row) => <span className="mono">${(row.volume / 1_000_000_000).toFixed(1)}B</span> },
    { key: 'volatility', header: 'VOL', align: 'right', render: (row) => <span className="mono">{(row.volatility * 100).toFixed(1)}%</span> },
    { key: 'funding', header: 'FUNDING', align: 'right', render: (row) => <span className="mono">{(row.funding * 100).toFixed(3)}%</span> },
  ]
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}><Panel title="MARKET OVERVIEW (MOCK, MULTI-SYMBOL)"><DataTable rows={rows} columns={columns} rowKey={(row) => row.symbol} ariaLabel="Market overview" /><div className="dim" style={{ marginTop: 8, fontSize: 'var(--font-size-xs)' }}>Symbol selection updates the shared workspace catalog. The active live scenario remains the deterministic BTC mock stream until a market-data adapter is selected.</div></Panel><Panel title="DERIVATIVES SNAPSHOT (MOCK)"><div className="mono dim" style={{ fontSize: 'var(--font-size-xs)' }}>Funding, mark/index price, basis, and liquidation fields are represented in the local catalog and will bind to the live market event stream after backend selection.</div></Panel></div>
}
