import { useEffect, useState } from 'react'
import { useMarketRuntime } from '../../state/appStore'
import { useWorkspace } from '../../state/useWorkspace'
import { Header } from '../main/Header'
import { PriceChart } from '../main/PriceChart'
import { OrderBook } from '../main/OrderBook'
import { TradeTape } from '../main/TradeTape'
import { OrderFlowPanel } from '../main/OrderFlowPanel'
import { StrategyMonitorPanel } from '../main/StrategyMonitorPanel'
import { MicrostructurePanel } from '../microstructure/MicrostructurePanel'
import { MarketRegimePanel } from '../market-regime/MarketRegimePanel'
import { RiskPanel } from '../risk/RiskPanel'
import { ExecutionMonitorPanel } from '../execution-monitor/ExecutionMonitorPanel'
import { BottomBar } from '../main/BottomBar'
import { InventoryPanel } from '../main/InventoryPanel'
import { MockBanner } from '../shared/MockBanner'

type MainLayout = {
  density: 'dense' | 'comfortable'
  showTradeTape: boolean
  showOrderFlow: boolean
  showInventory: boolean
  showStrategy: boolean
  showMicrostructure: boolean
  showRegime: boolean
  showRisk: boolean
  showExecution: boolean
}

const DEFAULT_LAYOUT: MainLayout = { density: 'dense', showTradeTape: true, showOrderFlow: true, showInventory: true, showStrategy: true, showMicrostructure: true, showRegime: true, showRisk: true, showExecution: true }
const LAYOUT_STORAGE_KEY = 'ticklab.main.layout.v1'

function loadLayout(): MainLayout {
  if (typeof localStorage === 'undefined') return DEFAULT_LAYOUT
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return DEFAULT_LAYOUT
    const candidate = parsed as Partial<MainLayout>
    return {
      density: candidate.density === 'comfortable' ? 'comfortable' : 'dense',
      showTradeTape: candidate.showTradeTape !== false,
      showOrderFlow: candidate.showOrderFlow !== false,
      showInventory: candidate.showInventory !== false,
      showStrategy: candidate.showStrategy !== false,
      showMicrostructure: candidate.showMicrostructure !== false,
      showRegime: candidate.showRegime !== false,
      showRisk: candidate.showRisk !== false,
      showExecution: candidate.showExecution !== false,
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function MainMonitor() {
  const [workspace, updateWorkspace] = useWorkspace()
  const runtime = useMarketRuntime()
  const { candles, orderBook, trades, strategy, changePct24h } = runtime
  const [layout, setLayout] = useState<MainLayout>(loadLayout)
  const replayTimestampNs = workspace.replay?.currentTimestampNs ?? null
  const projectedCandles = replayTimestampNs ? candles.filter((candle) => BigInt(candle.timestampNs) <= BigInt(replayTimestampNs)) : candles
  const projectedTrades = replayTimestampNs ? trades.filter((trade) => BigInt(trade.timestampNs) <= BigInt(replayTimestampNs)) : trades
  const last = projectedCandles[projectedCandles.length - 1] ?? candles[candles.length - 1]
  useEffect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  }, [layout])
  const toggleLayout = (key: keyof Omit<MainLayout, 'density'>) => setLayout((current) => ({ ...current, [key]: !current[key] }))
  const bid = orderBook.mid - orderBook.spread / 2
  const ask = orderBook.mid + orderBook.spread / 2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <MockBanner />
      <Header symbol={runtime.symbol} exchange={runtime.exchange} price={last?.close ?? 0} changePct={changePct24h} bid={bid} ask={ask} high24h={runtime.high24h} low24h={runtime.low24h} volume24hUsd={runtime.volume24hUsd} latencyMs={strategy.latencyMs} environment={workspace.environment} replayActive={Boolean(replayTimestampNs)} previewTimestampNs={workspace.previewTimestampNs} />
      <div className="main-layout-toolbar" role="toolbar" aria-label="Main Monitor layout controls">
        <span className="dim">LAYOUT</span>
        <button type="button" aria-pressed={layout.density === 'dense'} onClick={() => setLayout((current) => ({ ...current, density: 'dense' }))}>DENSE</button>
        <button type="button" aria-pressed={layout.density === 'comfortable'} onClick={() => setLayout((current) => ({ ...current, density: 'comfortable' }))}>COMFORTABLE</button>
        {([['showTradeTape', 'TRADES'], ['showOrderFlow', 'FLOW'], ['showInventory', 'INVENTORY'], ['showStrategy', 'STRATEGY'], ['showMicrostructure', 'MICRO'], ['showRegime', 'REGIME'], ['showRisk', 'RISK'], ['showExecution', 'EXECUTION']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={layout[key]} onClick={() => toggleLayout(key)}>{label}</button>)}
        {replayTimestampNs && <span className="replay-badge">REPLAY PROJECTION · {new Date(Number(BigInt(replayTimestampNs) / 1_000_000n)).toISOString().slice(11, 19)}</span>}
      </div>
      <div className={`monitor-content ${layout.density === 'dense' ? 'density-dense' : 'density-comfortable'}`}>
        <div className="monitor-primary-row">
          <PriceChart candles={projectedCandles} onSelectTimestamp={(timestampNs) => updateWorkspace({ timestamp: timestampNs, previewTimestampNs: null })} onPreviewTimestamp={(timestampNs) => updateWorkspace({ previewTimestampNs: timestampNs })} />
          <OrderBook book={orderBook} replayTimestampNs={replayTimestampNs} />
        </div>
        <div className="monitor-strip">
          {layout.showTradeTape && <TradeTape trades={projectedTrades} onSelect={(trade) => updateWorkspace({ selectedTradeId: trade.id, timestamp: trade.timestampNs, previewTimestampNs: null, activeTab: { secondaryMonitor: 'replay' } })} />}
          {layout.showOrderFlow && <OrderFlowPanel trades={projectedTrades} />}
          {layout.showInventory && <InventoryPanel strategy={strategy} />}
          {layout.showStrategy && <StrategyMonitorPanel s={strategy} />}
          {layout.showMicrostructure && <MicrostructurePanel book={orderBook} trades={projectedTrades} />}
          {layout.showRegime && <MarketRegimePanel candles={projectedCandles} book={orderBook} />}
          {layout.showRisk && <RiskPanel strategy={strategy} book={orderBook} />}
          {layout.showExecution && <ExecutionMonitorPanel strategy={strategy} tick={runtime.tick} />}
        </div>
      </div>
      <BottomBar s={strategy} />
    </div>
  )
}
