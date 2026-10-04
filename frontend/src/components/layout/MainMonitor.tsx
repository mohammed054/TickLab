import { useMemo } from 'react'
import { timestampNsToMs } from '../../contracts'
import type { RuntimeSnapshot } from '../../contracts'
import { useMarketRuntime } from '../../state/appStore'
import { useWorkspace } from '../../state/useWorkspace'
import { Header } from '../main/Header'
import { PriceChart } from '../main/PriceChart'
import { OrderBook } from '../main/OrderBook'
import { TradeTape } from '../main/TradeTape'
import { PositionPanel } from '../main/PositionPanel'
import { RiskPanel } from '../main/RiskPanel'
import { ExecutionPanel } from '../main/ExecutionPanel'
import { MarketPanel } from '../main/MarketPanel'
import { StatusBar } from '../main/StatusBar'

/**
 * Main Monitor. Fixed layout (no panel toggles): chart + book on top; tape, position, risk,
 * execution and market statistics below; one status bar. Each fact is shown in exactly one place.
 */
export function MainMonitor() {
  const [workspace, updateWorkspace] = useWorkspace()
  const live = useMarketRuntime()
  const replayAt = workspace.replay?.currentTimestampNs ?? null

  // While a replay is active the chart, tape and header follow the replay cursor.
  const runtime: RuntimeSnapshot = useMemo(() => {
    if (!replayAt) return live
    const cutoff = timestampNsToMs(replayAt)
    const upTo = <T extends { timestampNs: string }>(items: T[]) => items.filter((item) => timestampNsToMs(item.timestampNs) <= cutoff)
    return { ...live, candles: upTo(live.candles), trades: upTo(live.trades), fills: upTo(live.fills) }
  }, [live, replayAt])

  return (
    <div className="mm">
      <Header runtime={runtime} environment={workspace.environment} replayAt={replayAt} />

      <div className="mm-main">
        <PriceChart
          candles={runtime.candles}
          fills={runtime.fills}
          onSelectTimestamp={(timestampNs) => updateWorkspace({ timestamp: timestampNs, previewTimestampNs: null })}
          onPreviewTimestamp={(timestampNs) => updateWorkspace({ previewTimestampNs: timestampNs })}
        />
        <OrderBook book={runtime.orderBook} />
      </div>

      <div className="mm-strip">
        <TradeTape
          trades={runtime.trades}
          onSelect={(trade) =>
            updateWorkspace({
              selectedTradeId: trade.id,
              timestamp: trade.timestampNs,
              previewTimestampNs: null,
              activeTab: { secondaryMonitor: 'replay' },
            })
          }
        />
        <PositionPanel strategy={runtime.strategy} mark={runtime.orderBook.mid} />
        <RiskPanel runtime={runtime} mid={runtime.orderBook.mid} />
        <ExecutionPanel runtime={runtime} />
        <MarketPanel book={runtime.orderBook} trades={runtime.trades} candles={runtime.candles} />
      </div>

      <StatusBar runtime={runtime} mid={runtime.orderBook.mid} />
    </div>
  )
}
