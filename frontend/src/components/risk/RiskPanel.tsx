import { OrderBookSnapshot, StrategyState } from '../../contracts'
import { MetricRow, Panel, StatusDot } from '../shared/Panel'

export function RiskPanel({ strategy, book }: { strategy: StrategyState; book: OrderBookSnapshot }) {
  const exposure = Math.abs(strategy.inventory)
  const dailyPnl = strategy.realizedPnl + strategy.unrealizedPnl + strategy.fees
  const notional = exposure * book.mid
  const state = exposure > 2 ? 'BREACHED' : exposure > 1.6 ? 'WARNING' : 'WITHIN LIMITS'
  return (
    <Panel title="RISK CONTROLS" right={<StatusDot state={state === 'BREACHED' ? 'bad' : state === 'WARNING' ? 'warn' : 'ok'} />}>
      <MetricRow label="Current exposure" value={`${exposure.toFixed(2)} BTC`} valueClass={exposure > 1.6 ? 'warn' : undefined} />
      <MetricRow label="Max exposure" value="2.00 BTC" />
      <MetricRow label="Max daily loss" value="$800" />
      <MetricRow label="Current daily P&L" value={`${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`} valueClass={dailyPnl >= 0 ? 'pos' : 'neg'} />
      <MetricRow label="Max drawdown" value="5%" />
      <MetricRow label="Open orders" value={strategy.orders.toLocaleString()} />
      <MetricRow label="Notional value" value={`$${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
      <MetricRow label="Risk state" value={state} valueClass={state === 'BREACHED' ? 'neg' : state === 'WARNING' ? 'warn' : 'pos'} />
    </Panel>
  )
}
