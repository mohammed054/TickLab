import type { BacktestResult, ExperimentRecord, MarketEvent, RuntimeSnapshot, TradeSide } from '../contracts'
import { timestampMsToNs, timestampNsToMs } from '../contracts'
import type {
  AnalyticsBuildInput,
  AnalyticsData,
  AttributionItem,
  BucketRow,
  ComparisonRow,
  DrawdownPoint,
  EquityPoint,
  FillAnalysisRow,
  HorizonMarkout,
  ImbalancePoint,
  LatencyPoint,
  LiquidityBucket,
  QueueOrder,
  TimeBucket,
  TradeAnalysisRow,
  VolatilityBucket,
} from './analyticsTypes'

const EQUITY_POINT_COUNT = 64
const FILL_COUNT = 32
const HORIZONS = [1, 5, 10, 50, 100, 1_000, 5_000] as const
const DEFAULT_EPOCH_MS = 1_723_065_600_000
const DEFAULT_PRICE = 112_438.2

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function hashUnit(value: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0) / 4_294_967_295
}

function wave(index: number, phase: number): number {
  return Math.sin(index * 0.71 + phase) + Math.sin(index * 0.19 + phase * 1.73) * 0.42
}

function safeTimestampMs(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  try {
    const parsed = timestampNsToMs(value)
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function getRange(input: AnalyticsBuildInput): { startMs: number; endMs: number } {
  const runtimeMs = safeTimestampMs(input.runtime.logicalTimeNs, DEFAULT_EPOCH_MS + 86_400_000)
  const experimentStart = input.experiment ? safeTimestampMs(input.experiment.dateRange.start, runtimeMs - 86_400_000) : runtimeMs - 86_400_000
  const experimentEnd = input.experiment ? safeTimestampMs(input.experiment.dateRange.end, runtimeMs) : runtimeMs
  if (experimentEnd <= experimentStart) {
    return { startMs: runtimeMs - 86_400_000, endMs: runtimeMs }
  }
  return { startMs: experimentStart, endMs: experimentEnd }
}

function timestampAt(startMs: number, endMs: number, progress: number): string {
  return timestampMsToNs(Math.round(startMs + (endMs - startMs) * clamp(progress, 0, 1)))
}

function normalizeCurve(values: number[], netPnl: number): number[] {
  const start = values[0] ?? 0
  const normalized = values.map((value) => value - start)
  const last = normalized[normalized.length - 1] ?? 0
  const lastIndex = Math.max(normalized.length - 1, 1)
  return normalized.map((value, index) => value + (netPnl - last) * (index / lastIndex))
}

function buildEquity(result: BacktestResult, runtime: RuntimeSnapshot, startMs: number, endMs: number): EquityPoint[] {
  const headline = result.headline
  const phase = hashUnit(result.experimentId) * Math.PI * 2
  const initial = headline.initialCapital
  const targetDrawdown = Math.abs(headline.maxDrawdownPct) / 100
  const targetDepth = initial * targetDrawdown + Math.abs(headline.netPnl) * 0.24
  const dipCenter = 0.58
  const dipWidth = 0.075
  const raw = Array.from({ length: EQUITY_POINT_COUNT }, (_, index) => {
    const progress = index / (EQUITY_POINT_COUNT - 1)
    const trend = headline.netPnl * (0.18 * progress + 0.82 * progress ** 1.18)
    const oscillation = headline.netPnl * 0.055 * wave(index, phase) + headline.netPnl * 0.018 * Math.sin(index * 0.31 + phase)
    const dip = -targetDepth * Math.exp(-((progress - dipCenter) ** 2) / (2 * dipWidth ** 2)) * (1 - progress * 0.24)
    return trend + oscillation + dip
  })
  let values = normalizeCurve(raw, headline.netPnl)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let peak = initial
    let troughIndex = 0
    let troughPct = 0
    values.forEach((value, index) => {
      const capital = initial + value
      peak = Math.max(peak, capital)
      const drawdown = (capital - peak) / peak
      if (drawdown < troughPct) {
        troughPct = drawdown
        troughIndex = index
      }
    })
    const targetPct = -Math.abs(headline.maxDrawdownPct) / 100
    if (Math.abs(troughPct - targetPct) < 0.0005 || troughIndex === 0 || troughIndex === values.length - 1) break
    let peakBefore = initial
    for (let index = 0; index < troughIndex; index += 1) peakBefore = Math.max(peakBefore, initial + values[index])
    const desiredCapital = peakBefore * (1 + targetPct)
    const delta = desiredCapital - (initial + values[troughIndex])
    values = values.map((value, index) => {
      if (index === 0 || index === values.length - 1) return value
      const distance = Math.abs(index - troughIndex)
      return value + delta * Math.exp(-(distance ** 2) / 8)
    })
    values = normalizeCurve(values, headline.netPnl)
  }
  const basePrice = runtime.candles[runtime.candles.length - 1]?.close ?? DEFAULT_PRICE
  return values.map((value, index) => {
    const progress = index / (values.length - 1)
    return {
      timestampNs: timestampAt(startMs, endMs, progress),
      value: round(value, 4),
      capital: round(initial + value, 4),
      price: round(basePrice * (1 + (value / Math.max(initial, 1)) * 0.08 + Math.sin(index * 0.27 + phase) * 0.0002), 2),
    }
  })
}

function buildDrawdown(equity: EquityPoint[], result: BacktestResult): DrawdownPoint[] {
  let peak = equity[0]?.capital ?? result.headline.initialCapital
  let troughCapital = peak
  return equity.map((point) => {
    if (point.capital > peak) peak = point.capital
    if (point.capital < troughCapital) troughCapital = point.capital
    return {
      timestampNs: point.timestampNs,
      value: point.value,
      capital: point.capital,
      drawdownPct: round(((point.capital - peak) / Math.max(peak, 1)) * 100, 4),
      peakCapital: round(peak, 4),
      troughCapital: round(Math.min(troughCapital, point.capital), 4),
      isTrough: false,
    }
  })
}

export function buildAttribution(result: BacktestResult): AttributionItem[] {
  const headline = result.headline
  const fees = -headline.fees
  const slippage = -headline.slippage
  const adverse = -Math.abs(headline.netPnl) * 0.08 - headline.slippage * 0.24
  const inventory = headline.netPnl * 0.16
  const execution = headline.netPnl * 0.07
  const gross = headline.netPnl - fees - slippage - adverse - inventory - execution
  return [
    { id: 'gross', label: 'Gross simulated trading P&L', value: round(gross, 4), detail: 'Simulated execution-edge component' },
    { id: 'fees', label: 'Fees', value: round(fees, 4), detail: 'Simulated fee-model contribution' },
    { id: 'slippage', label: 'Slippage', value: round(slippage, 4), detail: 'Simulated fill-versus-expected movement' },
    { id: 'adverse', label: 'Adverse selection', value: round(adverse, 4), detail: 'Simulated post-fill markout contribution' },
    { id: 'inventory', label: 'Inventory P&L', value: round(inventory, 4), detail: 'Simulated holding-period contribution' },
    { id: 'execution', label: 'Execution loss', value: round(execution, 4), detail: 'Simulated execution-mechanics residual' },
    { id: 'other', label: 'Other', value: 0, detail: 'No unreconciled simulated residual' },
  ]
}

function eventSort(left: MarketEvent, right: MarketEvent): number {
  return left.sequence - right.sequence
}

function buildFills(result: BacktestResult, runtime: RuntimeSnapshot, startMs: number, endMs: number, phase: number): FillAnalysisRow[] {
  const events = runtime.events.filter((event) => event.type === 'fill' || event.type === 'trade').slice().sort(eventSort)
  const basePrice = runtime.candles[runtime.candles.length - 1]?.close ?? DEFAULT_PRICE
  const rawRows = Array.from({ length: FILL_COUNT }, (_, index) => {
    const event = events[index]
    const progress = events.length > 0 ? index / Math.max(events.length - 1, 1) : index / (FILL_COUNT - 1)
    const timestampNs = event?.timestampNs ?? timestampAt(startMs, endMs, progress)
    const side: TradeSide = event?.tradeSide ?? (index % 2 === 0 ? 'BUY' : 'SELL')
    const signedSize = side === 'BUY' ? 1 : -1
    const price = round(event?.fillPrice ?? event?.price ?? basePrice * (1 + Math.sin(index * 0.38 + phase) * 0.00025), 2)
    const size = round(event?.size ?? 0.015 + (index % 7) * 0.006, 4)
    const spread = round(0.1 + (index % 4) * 0.025, 3)
    const expectedPrice = round(price - signedSize * (spread / 2 + (index % 3) * 0.01), 2)
    const relativeMoves = HORIZONS.map((horizonMs, horizonIndex) => {
      const relative = (wave(index * 0.73 + horizonIndex, phase) * 0.00018) * (1 + horizonIndex * 0.08)
      return {
        horizonMs,
        price: round(price * (1 + relative), 2),
        markout: round(signedSize * size * price * relative, 6),
      }
    })
    const sourceEventId = event?.eventId ?? `runtime-event-${index}`
    return {
      id: event?.type === 'fill' ? event.eventId : `fill-${result.experimentId}-${index.toString().padStart(3, '0')}`,
      sourceEventId,
      timestampNs,
      side,
      price,
      size,
      expectedPrice,
      realizedPrice: round(price * (1 + (wave(index, phase) * 0.00012)), 2),
      spread,
      volatility: round(0.35 + (wave(index * 0.37, phase) + 1) * 0.22, 4),
      imbalance: round(Math.sin(index * 0.41 + phase) * 0.72, 4),
      queueAhead: round(Math.max(0.1, 0.9 + (wave(index * 0.23, phase) + 1) * 0.85), 4),
      fillProbability: round(clamp(0.82 - queueAheadFactor(index) * 0.34, 0.18, 0.96), 4),
      latencyMs: round(12 + (wave(index * 0.29, phase) + 2) * 5.4, 2),
      orderId: event?.orderId ?? `order-${result.experimentId}-${index.toString().padStart(3, '0')}`,
      markouts: relativeMoves,
    }
  })
  const rawMarkoutTotal = rawRows.reduce((total, row) => total + (row.markouts.find((markout) => markout.horizonMs === 100)?.markout ?? 0), 0)
  const scale = Math.abs(rawMarkoutTotal) < 0.000001 ? 1 : result.headline.netPnl / rawMarkoutTotal
  return rawRows.map((row) => {
    const markouts = row.markouts.map((markout) => ({ ...markout, markout: round(markout.markout * scale, 6) }))
    const markout100 = markouts.find((markout) => markout.horizonMs === 100)?.markout ?? 0
    const signedSize = row.side === 'BUY' ? 1 : -1
    const realizedPrice = row.size === 0 ? row.price : row.price + markout100 / (signedSize * row.size)
    return { ...row, markouts, realizedPrice: round(realizedPrice, 2) }
  })
}

function queueAheadFactor(index: number): number {
  return 0.5 + (Math.sin(index * 0.57) + 1) * 0.25
}

function buildTrades(fills: FillAnalysisRow[]): TradeAnalysisRow[] {
  return fills.map((fill) => {
    const markout = fill.markouts.find((item) => item.horizonMs === 100)?.markout ?? 0
    const signedSize = fill.side === 'BUY' ? 1 : -1
    const slippage = round((fill.price - fill.expectedPrice) * signedSize * fill.size, 6)
    return {
      id: `trade-${fill.id}`,
      timestampNs: fill.timestampNs,
      side: fill.side,
      outcome: markout >= 0 ? 'WIN' : 'LOSS',
      pnl: round(markout - Math.abs(slippage) * 0.12, 6),
      markout: round(markout, 6),
      holdingMs: 900 + Math.round((Math.sin(fill.price) + 1) * 18_000),
      fillPrice: fill.price,
      expectedPrice: fill.expectedPrice,
      realizedPrice: fill.realizedPrice,
      slippage,
      postFillMovement: round((fill.realizedPrice - fill.price) * signedSize, 4),
    }
  })
}

function buildSlippageBuckets(result: BacktestResult, equity: EquityPoint[]): BucketRow[] {
  const labels = ['Low volatility', 'Normal volatility', 'High volatility', 'Extreme volatility']
  const weights = [0.24, 0.32, 0.27, 0.17]
  return labels.map((label, index) => ({
    id: `volatility-${index}`,
    label,
    pnl: round(result.headline.netPnl * weights[index] * (index % 2 === 0 ? 1.08 : 0.92), 4),
    fillRate: round(35 + index * 4.2 + (index === 2 ? -2 : 0), 2),
    spread: round(0.72 + index * 0.14, 3),
    adverse: round(-Math.abs(result.headline.netPnl) * (0.018 + index * 0.012), 4),
    count: Math.max(1, Math.round(result.headline.trades * weights[index])),
    timestampNs: equity[Math.floor(((index + 1) / (labels.length + 1)) * equity.length)]?.timestampNs ?? result.experimentId,
  }))
}

function buildQueue(fills: FillAnalysisRow[]): QueueOrder[] {
  return fills.map((fill, index) => {
    const status: QueueOrder['status'] = index % 7 === 1 ? 'cancelled' : index % 5 === 0 ? 'partial_fill' : 'filled'
    const initialQueue = fill.queueAhead
    return {
      id: fill.orderId,
      fillId: fill.id,
      timestampNs: fill.timestampNs,
      side: fill.side,
      queueAhead: initialQueue,
      fillProbability: fill.fillProbability,
      status,
      timeline: Array.from({ length: 4 }, (_, step) => ({
        label: step === 0 ? 'Submitted' : step === 3 ? (status === 'filled' ? 'Filled' : status === 'partial_fill' ? 'Partial' : 'Cancelled') : `Ahead ${step}`,
        timestampNs: fill.timestampNs,
        queueAhead: round(Math.max(0, initialQueue * (1 - step * 0.23)), 4),
        fills: step === 3 ? (status === 'filled' ? fill.size : status === 'partial_fill' ? round(fill.size * 0.45, 4) : 0) : 0,
      })),
    }
  })
}

function buildLatency(result: BacktestResult, startMs: number, endMs: number): LatencyPoint[] {
  const phase = hashUnit(`${result.experimentId}:latency`) * Math.PI * 2
  return Array.from({ length: 40 }, (_, index) => {
    const total = round(12 + (wave(index, phase) + 2) * 5.8, 2)
    const decision = round(total * (0.25 + (index % 5) * 0.012), 2)
    const orderCreation = round(total * (0.18 + (index % 4) * 0.01), 2)
    const exchangeArrival = round(total * (0.31 + (index % 6) * 0.008), 2)
    const fill = round(total * (0.16 + (index % 3) * 0.012), 2)
    const residual = round(total - decision - orderCreation - exchangeArrival - fill, 2)
    return {
      timestampNs: timestampAt(startMs, endMs, index / 39),
      total,
      decision,
      orderCreation,
      exchangeArrival,
      fill,
      residual,
    }
  })
}

function buildImbalance(result: BacktestResult, startMs: number, endMs: number): ImbalancePoint[] {
  const phase = hashUnit(`${result.experimentId}:imbalance`) * Math.PI * 2
  return Array.from({ length: 48 }, (_, index) => {
    const imbalance = round(Math.sin(index * 0.46 + phase) * 0.7 + Math.sin(index * 0.13) * 0.16, 4)
    return {
      timestampNs: timestampAt(startMs, endMs, index / 47),
      imbalance,
      futureMove: round(imbalance * 0.0014 + Math.sin(index * 0.31 + phase) * 0.00035, 6),
    }
  })
}

function buildVolatility(result: BacktestResult): VolatilityBucket[] {
  const labels = ['Low', 'Normal', 'High', 'Extreme']
  const weights = [0.24, 0.32, 0.27, 0.17]
  return labels.map((label, index) => ({
    id: `vol-${index}`,
    label,
    pnl: round(result.headline.netPnl * weights[index] * (1.04 - index * 0.03), 4),
    fillRate: round(39 + index * 3.5, 2),
    spreadCaptured: round(0.68 + index * 0.11, 3),
    adverseSelection: round(-Math.abs(result.headline.netPnl) * (0.012 + index * 0.015), 4),
    drawdown: round(-Math.abs(result.headline.maxDrawdownPct) * (0.35 + index * 0.18), 4),
    volatility: round(0.24 + index * 0.19, 3),
  }))
}

function buildLiquidity(result: BacktestResult): LiquidityBucket[] {
  const levels = ['Top of book', '5 levels', '10 levels', '25 levels']
  return levels.map((label, index) => ({
    id: `depth-${index}`,
    label,
    depth: label,
    spread: round(0.34 + index * 0.08, 3),
    density: round(7.5 - index * 1.1, 2),
    tradeVolume: round(result.headline.trades * (0.16 - index * 0.025), 2),
    tradeFrequency: round(42 - index * 6, 2),
    fillRate: round(result.headline.fillRatePct + 7 - index * 2.2, 2),
    pnl: round(result.headline.netPnl * [0.32, 0.29, 0.23, 0.16][index], 4),
  }))
}

function buildTime(result: BacktestResult, startMs: number, endMs: number): TimeBucket[] {
  const hours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00']
  const weights = [0.09, 0.1, 0.13, 0.16, 0.15, 0.14, 0.12, 0.11]
  return hours.map((label, index) => {
    const progress = index / Math.max(hours.length - 1, 1)
    return {
      id: `time-${index}`,
      label,
      hour: index * 3,
      timestampNs: timestampAt(startMs, endMs, progress),
      pnl: round(result.headline.netPnl * weights[index], 4),
      fillRate: round(result.headline.fillRatePct - 5 + index * 1.4, 2),
      spread: round(0.65 + Math.sin(index * 0.7) * 0.12 + index * 0.03, 3),
      volatility: round(0.3 + Math.abs(Math.cos(index * 0.8)) * 0.35, 3),
      adverseSelection: round(-Math.abs(result.headline.netPnl) * (0.008 + index * 0.002), 4),
    }
  })
}

function buildComparisonRow(input: { id: string; strategy: string; result: BacktestResult; runtime: RuntimeSnapshot; startMs: number; endMs: number }): ComparisonRow {
  const headline = input.result.headline
  return {
    id: input.id,
    label: input.id,
    strategy: input.strategy,
    netPnl: headline.netPnl,
    returnPct: headline.returnPct,
    maxDrawdownPct: headline.maxDrawdownPct,
    sharpe: headline.sharpe,
    fillRatePct: headline.fillRatePct,
    fees: headline.fees,
    slippage: headline.slippage,
    trades: headline.trades,
    equity: buildEquity(input.result, input.runtime, input.startMs, input.endMs),
    latency: buildLatency(input.result, input.startMs, input.endMs),
  }
}

export function buildAnalyticsData(input: AnalyticsBuildInput): AnalyticsData {
  const range = getRange(input)
  const startMs = range.startMs
  const endMs = range.endMs
  const phase = hashUnit(input.result.experimentId) * Math.PI * 2
  const equity = buildEquity(input.result, input.runtime, startMs, endMs)
  const drawdown = buildDrawdown(equity, input.result)
  const minDrawdown = drawdown.reduce((minimum, point) => point.drawdownPct < minimum ? point.drawdownPct : minimum, 0)
  const troughIndex = drawdown.findIndex((point) => point.drawdownPct === minDrawdown)
  if (troughIndex >= 0) {
    drawdown[troughIndex] = { ...drawdown[troughIndex], isTrough: true }
  }
  const fills = buildFills(input.result, input.runtime, startMs, endMs, phase)
  const comparisonInputs = input.comparison.some((entry) => entry.experiment.id === input.result.experimentId)
    ? input.comparison
    : [
        ...input.comparison,
        {
          experiment: input.experiment ?? {
            id: input.result.experimentId,
            strategyRef: { id: input.result.experimentId, version: 'selected', codeHash: `mock:${input.result.experimentId}` },
            parameters: {},
            datasetId: 'mock-dataset',
            dateRange: { start: timestampMsToNs(startMs), end: timestampMsToNs(endMs) },
            exchange: input.runtime.exchange,
            symbol: input.runtime.symbol,
            market: 'mock-market',
            executionModel: { makerFee: 0, takerFee: 0, latencyModel: 'mock', queueModel: 'mock', allowPartialFills: true, orderTypesAllowed: [] },
            riskLimits: { maxPosition: 0, maxOrderSize: 0, maxDailyLoss: 0, maxDrawdownPct: 0, maxOpenOrders: 0, maxOrderRatePerSec: 0, maxNotionalExposure: 0, emergencyStopEnabled: false },
            randomSeed: 42,
            createdAt: '',
            createdBy: { agentType: 'human', id: 'mock' },
            parentExperimentId: null,
            status: 'complete',
            results: input.result,
          },
          result: input.result,
        },
      ]
  const comparison = comparisonInputs.map((entry) => buildComparisonRow({
    id: entry.experiment.id,
    strategy: entry.experiment.strategyRef.id,
    result: entry.result,
    runtime: input.runtime,
    startMs,
    endMs,
  }))
  return {
    result: input.result,
    startNs: timestampMsToNs(startMs),
    endNs: timestampMsToNs(endMs),
    equity,
    drawdown,
    attribution: buildAttribution(input.result),
    trades: buildTrades(fills),
    fills,
    slippage: buildSlippageBuckets(input.result, equity),
    queue: buildQueue(fills),
    latency: buildLatency(input.result, startMs, endMs),
    imbalance: buildImbalance(input.result, startMs, endMs),
    volatility: buildVolatility(input.result),
    liquidity: buildLiquidity(input.result),
    time: buildTime(input.result, startMs, endMs),
    comparison,
  }
}
