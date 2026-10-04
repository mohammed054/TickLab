export type TimestampNs = string

export type Environment = 'RESEARCH' | 'PAPER' | 'LIVE'

export type MarketEventType = 'snapshot' | 'book_update' | 'trade' | 'ticker' | 'strategy_decision' | 'order_submit' | 'fill' | 'funding' | 'liquidation'

export type MarketSide = 'bid' | 'ask'

export type TradeSide = 'BUY' | 'SELL'

export type StrategyStatus = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR'

export interface MarketEvent {
  eventId: string
  timestampNs: TimestampNs
  symbol: string
  exchange: string
  type: MarketEventType
  sequence: number
  side?: MarketSide
  tradeSide?: TradeSide
  price?: number
  size?: number
  fundingRate?: number
  nextFundingTime?: TimestampNs
  openInterest?: number
  markPrice?: number
  indexPrice?: number
  basis?: number
  orderId?: string
  queueAhead?: number
  fillPrice?: number
  reason?: string
}

export interface Candle {
  timestampNs: TimestampNs
  open: number
  high: number
  low: number
  close: number
  volume: number
  buyVolume: number
  sellVolume: number
  trades: number
}

export interface OrderBookLevel {
  price: number
  size: number
  orderCount: number | null
  cumulativeDepth: number
  distanceFromMidTicks: number
  distanceFromMidBps: number
  isStrategyQuote: boolean
}

export interface OrderBookSnapshot {
  timestampNs: TimestampNs
  symbol: string
  exchange: string
  sequence: number
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  mid: number
  spread: number
}

export interface Trade {
  id: string
  timestampNs: TimestampNs
  side: TradeSide
  price: number
  size: number
  notional: number
  sequence: number
}

export interface StrategyState {
  id: string
  name: string
  version: string
  status: StrategyStatus
  environment: Environment
  inventory: number
  inventoryValue: number
  realizedPnl: number
  unrealizedPnl: number
  fees: number
  orders: number
  fills: number
  cancelled: number
  fillRate: number
  latencyMs: number
  /** Resting orders. Invariant: orders === fills + cancelled + rejected + openOrders. */
  openOrders: number
  rejected: number
  avgEntryPrice: number | null
  /** realizedPnl + unrealizedPnl + fees (fees are signed: negative = cost). */
  netPnl: number
  /** Distance in USD from the session peak of netPnl (>= 0). */
  drawdown: number
  /** Reason the risk layer stopped the strategy, or null. */
  halted: string | null
}

export interface StrategyFill {
  id: string
  timestampNs: TimestampNs
  side: TradeSide
  price: number
  size: number
  /** Signed USD, negative = cost. */
  fee: number
  positionAfter: number
}

export type JobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'

export interface StrategyRef {
  id: string
  version: string
  codeHash: string
}

export interface ExecutionModelConfig {
  makerFee: number
  takerFee: number
  latencyModel: string
  queueModel: string
  allowPartialFills: boolean
  orderTypesAllowed: string[]
}

export interface RiskLimitsConfig {
  maxPosition: number
  maxOrderSize: number
  maxDailyLoss: number
  maxDrawdownPct: number
  maxOpenOrders: number
  maxOrderRatePerSec: number
  maxNotionalExposure: number
  emergencyStopEnabled: boolean
}

export interface BacktestRequest {
  strategyRef: StrategyRef
  parameters: Record<string, number | string | boolean>
  datasetId: string
  dateRange: { start: TimestampNs; end: TimestampNs }
  initialCapital: number
  executionModel: ExecutionModelConfig
  riskLimits: RiskLimitsConfig
  randomSeed: number | null
  iterations: number
}

export interface BacktestProgress {
  jobId: string
  eventsProcessed: number
  totalEvents: number
  eventsPerSec: number
  ordersSubmitted: number
  fills: number
  simulatedTimeNs: TimestampNs
  wallClockElapsedMs: number
  status: JobStatus
}

export interface BacktestResult {
  jobId: string
  experimentId: string
  engineVersion: string
  headline: {
    initialCapital: number
    finalCapital: number
    netPnl: number
    returnPct: number
    maxDrawdownPct: number
    sharpe: number
    sortino: number
    trades: number
    fillRatePct: number
    fees: number
    slippage: number
  }
  recorderSeriesRef: string
  fineGrainedEventsRef: string
}

export interface BacktestJob {
  id: string
  request: BacktestRequest
  progress: BacktestProgress
  experimentId: string
  errorMessage: string | null
}

export interface ExperimentRecord {
  id: string
  strategyRef: StrategyRef
  parameters: Record<string, number | string | boolean>
  datasetId: string
  dateRange: { start: TimestampNs; end: TimestampNs }
  exchange: string
  symbol: string
  market: string
  executionModel: ExecutionModelConfig
  riskLimits: RiskLimitsConfig
  randomSeed: number | null
  createdAt: string
  createdBy: { agentType: 'human' | 'ai-assistant'; id: string }
  parentExperimentId: string | null
  status: JobStatus
  results: BacktestResult | null
}

export interface Note {
  id: string
  targetType: 'strategy' | 'experiment' | 'timestamp' | 'trade' | 'fill' | 'chart_view'
  targetId: string
  body: string
  authoredBy: { agentType: 'human' | 'ai-assistant'; id: string }
  createdAt: string
}

export interface AlertRecord {
  id: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  linkedView?: { path: string; params: Record<string, string> }
  createdAt: string
  acknowledged: boolean
}

export interface LogRecord {
  id: string
  timestampNs: TimestampNs
  category: 'Market' | 'Strategy' | 'Orders' | 'Execution' | 'Risk' | 'Data' | 'System' | 'Errors'
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
  service: string
  message: string
  context: Record<string, string>
}

export interface AuditRecord {
  id: string
  timestampNs: TimestampNs
  actor: { type: 'human' | 'system' | 'ai-assistant'; id: string }
  action: string
  objectType: string
  objectId: string
  value: string
}

export interface MarketDataSource {
  readonly id: string
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => RuntimeSnapshot
  start: () => void
  stop: () => void
}

export interface RuntimeSnapshot {
  logicalTimeNs: TimestampNs
  symbol: string
  exchange: string
  tick: number
  /** Session = everything since the dataset/simulation start. Not a rolling 24h window. */
  sessionOpen: number
  changePctSession: number
  highSession: number
  lowSession: number
  volumeSessionBtc: number
  volumeSessionUsd: number
  candles: Candle[]
  orderBook: OrderBookSnapshot
  trades: Trade[]
  events: MarketEvent[]
  strategy: StrategyState
  fills: StrategyFill[]
  riskLimits: RiskLimitsConfig
  initialCapital: number
  latencyP50Ms: number
  latencyP99Ms: number
  orderRatePerSec: number
}

export function timestampNsToMs(timestampNs: TimestampNs): number {
  return Number(BigInt(timestampNs) / 1_000_000n)
}

export function timestampMsToNs(timestampMs: number): TimestampNs {
  if (!Number.isFinite(timestampMs)) {
    throw new Error('timestampMs must be finite')
  }
  return (BigInt(Math.trunc(timestampMs)) * 1_000_000n).toString()
}
