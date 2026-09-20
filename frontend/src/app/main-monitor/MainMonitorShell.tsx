import { useWorkspaceContext } from '../../shared/sync-bus'
import { GlobalHeader } from '../../features/header/GlobalHeader'
import { useMarketTicker } from '../../features/header/useMarketTicker'
import { PriceChart } from '../../features/price-chart/PriceChart'
import { fixtureTickSize } from '../../features/price-chart/fixtureData'
import { StrategyMonitorPanel } from '../../features/strategy-monitor/StrategyMonitorPanel'
import { InventoryPanel } from '../../features/inventory/InventoryPanel'
import { RiskPanel } from '../../features/risk/RiskPanel'
import { ExecutionMonitorPanel } from '../../features/execution-monitor/ExecutionMonitorPanel'
import { BottomBar } from '../../features/bottom-bar/BottomBar'

export function MainMonitorShell() {
  const { symbol, exchange, environment, isConnected } = useWorkspaceContext()
  const ticker = useMarketTicker(symbol)

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
        latencyMs={null}
        environment={environment}
      />
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', gap: '8px', padding: '8px', background: 'var(--color-bg-base)' }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PriceChart symbol={symbol} exchange={exchange} />
          </div>
          <div style={{ height: '200px', background: 'var(--color-bg-panel)', borderRadius: '4px', border: '1px solid var(--color-border-subtle)' }}>
            Trade Tape Area
          </div>
        </section>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'auto' }}>
          <div style={{ flex: 1, background: 'var(--color-bg-panel)', borderRadius: '4px', border: '1px solid var(--color-border-subtle)' }}>
            Order Book Ladder Area
          </div>
          <StrategyMonitorPanel
            strategyName={null}
            status={null}
            inventoryQty={0}
            inventoryValue={0}
            realizedPnl={0}
            unrealizedPnl={0}
            fees={0}
            netPnl={0}
            orderCount={0}
            fillCount={0}
            cancelledCount={0}
            fillRatePct={0}
            latencyMs={null}
          />
          <InventoryPanel
            currentQty={0}
            targetQty={null}
            limitQty={null}
            inventoryValue={0}
            inventoryPnl={0}
            inventoryVolatility={null}
          />
          <RiskPanel
            currentExposure={0}
            maxExposure={0}
            dailyPnl={0}
            drawdownCurrent={0}
            drawdownMax={0}
            dailyLoss={0}
            maxPosition={0}
            openOrdersCount={0}
            potentialExecutionRisk={0}
            marginUsage={null}
            liquidationDistance={null}
          />
          <ExecutionMonitorPanel
            feedLatencyMs={null}
            decisionLatencyMs={null}
            orderLatencyMs={null}
            exchangeResponseMs={null}
            roundTripMs={null}
            rejectedCount={0}
            cancelledCount={0}
            staleCount={0}
            droppedEvents={0}
            sequenceGaps={0}
            reconnects={0}
            missingData={0}
          />
        </aside>
      </main>
      <BottomBar
        positionQty={0}
        realizedPnl={0}
        unrealizedPnl={0}
        fees={0}
        netPnl={0}
        orderCount={0}
        fillCount={0}
        latencyMs={null}
        dataConnected={isConnected}
        engineConnected={false}
        riskOk={true}
      />
    </div>
  )
}
