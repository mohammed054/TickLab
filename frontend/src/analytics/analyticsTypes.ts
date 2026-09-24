import type { BacktestResult, ExperimentRecord, RuntimeSnapshot, TradeSide } from '../contracts'

export const ANALYTICS_VIEW_IDS = [
  'equity',
  'drawdown',
  'attribution',
  'trades',
  'fills',
  'adverse',
  'slippage',
  'queue',
  'latency',
  'imbalance',
  'volatility',
  'liquidity',
  'time',
  'comparison',
] as const

export type AnalyticsViewId = typeof ANALYTICS_VIEW_IDS[number]

export interface AnalyticsViewDefinition {
  id: AnalyticsViewId
  label: string
}

export interface SeriesPoint {
  timestampNs: string
  value: number
}

export interface EquityPoint extends SeriesPoint {
  capital: number
  price: number
}

export interface DrawdownPoint extends SeriesPoint {
  capital: number
  drawdownPct: number
  peakCapital: number
  troughCapital: number
  isTrough: boolean
}

export interface AttributionItem {
  id: string
  label: string
  value: number
  detail: string
}

export interface HorizonMarkout {
  horizonMs: number
  price: number
  markout: number
}

export interface FillAnalysisRow {
  id: string
  sourceEventId: string
  timestampNs: string
  side: TradeSide
  price: number
  size: number
  expectedPrice: number
  realizedPrice: number
  spread: number
  volatility: number
  imbalance: number
  queueAhead: number
  fillProbability: number
  latencyMs: number
  orderId: string
  markouts: HorizonMarkout[]
}

export interface TradeAnalysisRow {
  id: string
  timestampNs: string
  side: TradeSide
  outcome: 'WIN' | 'LOSS'
  pnl: number
  markout: number
  holdingMs: number
  fillPrice: number
  expectedPrice: number
  realizedPrice: number
  slippage: number
  postFillMovement: number
}

export interface BucketRow {
  id: string
  label: string
  pnl: number
  fillRate: number
  spread: number
  adverse: number
  count: number
  timestampNs: string
}

export interface QueueTimelinePoint {
  label: string
  timestampNs: string
  queueAhead: number
  fills: number
}

export interface QueueOrder {
  id: string
  fillId: string
  timestampNs: string
  side: TradeSide
  queueAhead: number
  fillProbability: number
  status: 'filled' | 'partial_fill' | 'cancelled'
  timeline: QueueTimelinePoint[]
}

export interface LatencyPoint {
  timestampNs: string
  total: number
  decision: number
  orderCreation: number
  exchangeArrival: number
  fill: number
  residual: number
}

export interface ImbalancePoint {
  timestampNs: string
  imbalance: number
  futureMove: number
}

export interface VolatilityBucket {
  id: string
  label: string
  pnl: number
  fillRate: number
  spreadCaptured: number
  adverseSelection: number
  drawdown: number
  volatility: number
}

export interface LiquidityBucket {
  id: string
  label: string
  depth: string
  spread: number
  density: number
  tradeVolume: number
  tradeFrequency: number
  fillRate: number
  pnl: number
}

export interface TimeBucket {
  id: string
  label: string
  hour: number
  timestampNs: string
  pnl: number
  fillRate: number
  spread: number
  volatility: number
  adverseSelection: number
}

export interface ComparisonRow {
  id: string
  label: string
  strategy: string
  netPnl: number
  returnPct: number
  maxDrawdownPct: number
  sharpe: number
  fillRatePct: number
  fees: number
  slippage: number
  trades: number
  equity: EquityPoint[]
  latency: LatencyPoint[]
}

export interface AnalyticsData {
  result: BacktestResult
  startNs: string
  endNs: string
  equity: EquityPoint[]
  drawdown: DrawdownPoint[]
  attribution: AttributionItem[]
  trades: TradeAnalysisRow[]
  fills: FillAnalysisRow[]
  slippage: BucketRow[]
  queue: QueueOrder[]
  latency: LatencyPoint[]
  imbalance: ImbalancePoint[]
  volatility: VolatilityBucket[]
  liquidity: LiquidityBucket[]
  time: TimeBucket[]
  comparison: ComparisonRow[]
}

export interface AnalyticsBuildInput {
  result: BacktestResult
  experiment: ExperimentRecord | null
  runtime: RuntimeSnapshot
  comparison: Array<{ experiment: ExperimentRecord; result: BacktestResult }>
}
