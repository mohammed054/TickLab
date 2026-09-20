import { useWorkspaceContext } from '../../shared/sync-bus'
import { GlobalHeader } from '../../features/header/GlobalHeader'
import { useMarketTicker } from '../../features/header/useMarketTicker'
import { PriceChart } from '../../features/price-chart/PriceChart'
import { fixtureTickSize } from '../../features/price-chart/fixtureData'
import { OrderBookLadder } from '../../features/order-book/OrderBookLadder'

export function MainMonitorShell() {
  // Symbol/exchange always from the Sync Bus (docs/14 §14.12 — never hardcoded).
  const { symbol, exchange, environment, isConnected } = useWorkspaceContext()
  const ticker = useMarketTicker(symbol)

  // Tick size comes from instrument_metadata (Block 2.1) once the market-data
  // service exposes it; until then the fixture-consistent magnitude tick.
  const tickSize = fixtureTickSize(symbol)
  const spreadAbs = ticker.bid != null && ticker.ask != null ? ticker.ask - ticker.bid : NaN
  const spreadTicks = Number.isFinite(spreadAbs) ? spreadAbs / tickSize : NaN

  return (
    <div className="main-monitor-shell" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <GlobalHeader
        symbol={symbol}
        exchange={exchange}
        lastPrice={ticker.lastPrice ?? NaN}
        changePct24h={ticker.changePct24h ?? NaN}
        bid={ticker.bid ?? NaN}
        ask={ticker.ask ?? NaN}
        spreadAbs={spreadAbs}
        spreadTicks={spreadTicks}
        high24h={ticker.high24h ?? NaN}
        low24h={ticker.low24h ?? NaN}
        volume24hUsd={ticker.volume24hUsd ?? NaN}
        exchangeConnected={isConnected}
        marketDataConnected={ticker.status === 'live'}
        // No measured feed latency yet — null renders "—" (§7.1, §14.7).
        // Wired with the Execution Monitor (Block 3.5, docs/07 §7.15).
        latencyMs={null}
        environment={environment}
      />
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', gap: '8px', padding: '8px', background: '#0d0d0d' }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PriceChart symbol={symbol} exchange={exchange} />
          </div>
          <div style={{ height: '200px', background: '#1a1a1a', borderRadius: '4px', border: '1px solid #333' }}>
            Trade Tape Area
          </div>
        </section>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
<OrderBookLadder />
          <div style={{ flex: 1, background: '#1a1a1a', borderRadius: '4px', border: '1px solid #333' }}>
            Order Flow / Microstructure Area
          </div>
        </aside>
      </main>
      <footer style={{ padding: '8px 16px', borderTop: '1px solid #333', background: '#1a1a1a', color: '#888', fontSize: '12px' }}>
        Bottom Bar — P&L, Risk, System Status
      </footer>
    </div>
  )
}