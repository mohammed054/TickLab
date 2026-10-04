import type { RiskLimitsConfig, StrategyState } from '../contracts'

export type RiskLevel = 'ok' | 'warn' | 'breach'

export interface RiskLine {
  key: string
  label: string
  current: number
  limit: number
  usage: number // 0..n, 1 = limit reached
  level: RiskLevel
}

export interface RiskEvaluation {
  lines: RiskLine[]
  level: RiskLevel
  label: string
}

const WARN_AT = 0.8

function line(key: string, label: string, current: number, limit: number): RiskLine {
  const usage = limit > 0 ? current / limit : 0
  return { key, label, current, limit, usage, level: usage >= 1 ? 'breach' : usage >= WARN_AT ? 'warn' : 'ok' }
}

/**
 * The only place risk state is computed. The Risk panel, the status bar and the strategy
 * halt logic all use these numbers, so they cannot disagree.
 */
export function evaluateRisk(
  strategy: StrategyState,
  limits: RiskLimitsConfig,
  initialCapital: number,
  mid: number,
  orderRatePerSec: number,
): RiskEvaluation {
  const lines = [
    line('position', 'Position', Math.abs(strategy.inventory), limits.maxPosition),
    line('loss', 'Daily loss', Math.max(0, -strategy.netPnl), limits.maxDailyLoss),
    line('drawdown', 'Drawdown', (strategy.drawdown / initialCapital) * 100, limits.maxDrawdownPct),
    line('open', 'Open orders', strategy.openOrders, limits.maxOpenOrders),
    line('rate', 'Order rate', orderRatePerSec, limits.maxOrderRatePerSec),
    line('notional', 'Notional', Math.abs(strategy.inventory) * mid, limits.maxNotionalExposure),
  ]
  const level: RiskLevel = lines.some((l) => l.level === 'breach')
    ? 'breach'
    : lines.some((l) => l.level === 'warn')
      ? 'warn'
      : 'ok'
  const label = strategy.halted
    ? 'Halted'
    : level === 'breach'
      ? 'Limit breached'
      : level === 'warn'
        ? 'Near limit'
        : 'Within limits'
  return { lines, level, label }
}
