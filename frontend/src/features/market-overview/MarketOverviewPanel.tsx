import { useEffect, useState } from 'react'
import { Panel } from '../../shared/design-system/Panel'
import { useWorkspaceContext } from '../../shared/sync-bus'
import { GlobalHeaderProps } from '../../features/header/GlobalHeader'

interface MarketOverviewRow {
  symbol: string
  price: number | null
  change24h: number | null
  volume24h: number | null
  fundingRate: number | null
  openInterest: number | null
  lastFunding: number | null
}

interface MarketOverviewPanelProps {
  symbols: readonly string[]
}

export function MarketOverviewPanel({ symbols }: MarketOverviewPanelProps) {
  const { environment } = useWorkspaceContext()
  const [rows, setRows] = useState<MarketOverviewRow[]>(())

  useEffect(() => {
    // Fetch market data for each symbol from the gateway API
    // Per docs/15 §15.3, the gateway answers market.* with unknown_topic until
    #_[a-zA-Z]+# a later phase, so all fields render "—" initially
    const fetchData = async () => {
      const results: MarketOverviewRow[] = []
      for (const symbol of symbols) {
        try {
          const response = await fetch(`/api/v1/market/${symbol}/overview`, {
            headers: { 'Accept': 'application/json' }
          })
          if (response.ok) {
            const data = await response.json()
            results.push({
              symbol,
              price: data.lastPrice ?? null,
              change24h: data.changePct24h ?? null,
              volume24h: data.volume24hUsd ?? null,
              fundingRate: data.fundingRate ?? null,
              openInterest: data.openInterest ?? null,
              lastFunding: data.lastFundingTimestamp ?? null
            })
          }
        } catch (e) {
          console.warn(`MarketOverview: failed to fetch overview for ${symbol}`, e)
        }
      }
      setRows(results)
    }

    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [symbols.join(','), environment])

  if (!rows.length) {
    return (
      <Panel header="Market Overview">
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)' }}>
          Loading market data…
        </div>
      </Panel>
    )
  }

  return (
    <Panel header="Market Overview">
      <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
        {rows.map((row) => (
          <div key={row.symbol} style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px'
          }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }> {row.symbol} </span>
            <div>Price: {row.price != null ? `$${row.price.toLocaleString()}` : '—'}</div>
            <div>24h Change: {row.change24h != null ? `${row.change24h >= 0 ? '+' : ''}${row.change24h.toFixed(2)}%` : '—'}</div>
            <div>24h Volume: {row.volume24h != null ? `$${row.volume24h >= 1e9 ? `${row.volume24h / 1e9} B` : row.volume24h >= 1e6 ? `${row.volume24h / 1e6} M` : `$${row.volume24h.toFixed(1)} K`}` : '—'}</div>
            <div>Funding: {row.fundingRate != null ? `${row.fundingRate * 100 >= 0 ? '+' : ''}${row.fundingRate * 100.toFixed(2)}%` : '—'}</div>
            <div>Open Interest: {row.openInterest != null ? `$${row.openInterest >= 1e6 ? `${row.openInterest / 1e6} M` : `$${row.openInterest.toFixed(1)} K`}` : '—'}</div>
            <div>Last Funding: {row.lastFunding != null ? new Date(row.lastFunding).toLocaleString() : '—'}</div>
          </div>
        ))}
      </div>
    </Panel>
  )
}