import type { StrategyState } from '../../contracts'
import { fmtBtc, fmtPrice, fmtUsd, fmtUsdWhole, signClass } from '../../shared/format'
import { MMPanel, Row } from './mm'

const STATUS_LABEL: Record<StrategyState['status'], string> = {
  RUNNING: 'Running',
  PAUSED: 'Paused',
  STOPPED: 'Stopped',
  ERROR: 'Error',
}

/** Position and P&L: the only place these numbers are shown in full. */
export function PositionPanel({ strategy, mark }: { strategy: StrategyState; mark: number }) {
  const running = strategy.status === 'RUNNING'
  return (
    <MMPanel
      title="Position & P&L"
      right={
        <>
          <span className="num">{strategy.name}</span>
          <span className={running ? 'pos' : strategy.halted ? 'neg' : 'warn'}>{STATUS_LABEL[strategy.status]}</span>
        </>
      }
    >
      <Row label="Position (BTC)" value={fmtBtc(strategy.inventory, true)} strong title="Long is positive, short is negative. Direction is not good or bad, so it is not coloured." />
      <Row label="Notional" value={fmtUsdWhole(Math.abs(strategy.inventory) * mark)} />
      <Row label="Avg entry" value={strategy.avgEntryPrice === null ? '–' : fmtPrice(strategy.avgEntryPrice)} />
      <Row label="Mark (mid)" value={fmtPrice(mark)} />
      <div className="mm-sep" />
      <Row label="Realized" value={fmtUsd(strategy.realizedPnl, true)} tone={signClass(strategy.realizedPnl)} />
      <Row label="Unrealized" value={fmtUsd(strategy.unrealizedPnl, true)} tone={signClass(strategy.unrealizedPnl)} />
      <Row label="Fees" value={fmtUsd(strategy.fees, true)} tone={signClass(strategy.fees)} />
      <div className="mm-sep" />
      <Row label="Net P&L" value={fmtUsd(strategy.netPnl, true)} tone={signClass(strategy.netPnl)} strong />
    </MMPanel>
  )
}
