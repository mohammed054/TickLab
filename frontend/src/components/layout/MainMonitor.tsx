import { useEffect, useRef, useState } from 'react'
import { genMockCandles, genMockOrderBook, genMockTrades, genMockStrategyState, MockCandle, MockTrade } from '../../mock/mockData'
import { Header } from '../main/Header'
import { PriceChart } from '../main/PriceChart'
import { OrderBook } from '../main/OrderBook'
import { TradeTape } from '../main/TradeTape'
import { OrderFlowPanel } from '../main/OrderFlowPanel'
import { StrategyMonitorPanel } from '../main/StrategyMonitorPanel'
import { BottomBar } from '../main/BottomBar'
import { MockBanner } from '../shared/MockBanner'
import { useWorkspace } from '../../state/useWorkspace'

export function MainMonitor() {
  const [, updateWorkspace] = useWorkspace()
  const [candles, setCandles] = useState<MockCandle[]>(() => genMockCandles(90, 1000))
  const [trades, setTrades] = useState<MockTrade[]>(() => genMockTrades(40))
  const [book, setBook] = useState(() => genMockOrderBook())
  const [strategy, setStrategy] = useState(() => genMockStrategyState())
  const tickRef = useRef(0)

  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current++
      setCandles((prev) => {
        const next = genMockCandles(1, 1000)
        return [...prev.slice(1), next[0]]
      })
      setTrades((prev) => [...prev.slice(-59), ...genMockTrades(1)])
      setBook(genMockOrderBook())
      if (tickRef.current % 3 === 0) setStrategy(genMockStrategyState())
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const last = candles[candles.length - 1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <MockBanner />
      <Header price={last?.close ?? 0} changePct={1.24} bid={book.mid - book.spread / 2} ask={book.mid + book.spread / 2} />
      <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0, gap: 6, padding: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0, gap: 6 }}>
          <PriceChart candles={candles} onSelectTimestamp={(t) => updateWorkspace({ timestampMs: t })} />
          <div style={{ display: 'flex', gap: 6, height: 190 }}>
            <TradeTape
              trades={trades}
              onSelect={(t) => updateWorkspace({ selectedTradeId: t.id, timestampMs: t.t, secondaryTab: 'Replay' })}
            />
            <OrderFlowPanel trades={trades} />
            <StrategyMonitorPanel s={strategy} />
          </div>
        </div>
        <OrderBook book={book} />
      </div>
      <BottomBar s={strategy} />
    </div>
  )
}
