/**
 * ============================================================================
 *  MOCK DATA ENGINE
 * ============================================================================
 *  EVERYTHING in this file is FAKE, RANDOMLY GENERATED, and NOT CONNECTED
 *  to any real exchange, market data feed, or trading engine.
 *
 *  This whole frontend is a UI/UX build only. There is no backend, no
 *  HftBacktest integration, no live exchange connectivity. Every number,
 *  candle, order-book row, trade, fill, strategy stat, and backtest result
 *  below is synthetically generated in the browser for layout/demo purposes.
 *
 *  Every value/type exported from this file is prefixed `Mock` and every
 *  generator function is prefixed `genMock`, on purpose, so it can never be
 *  quietly wired into something real without the name screaming at you.
 * ============================================================================
 */

export const MOCK_DATA_DISCLAIMER =
  'ALL DATA ON THIS SCREEN IS SIMULATED. No real market data, no real exchange connection, no real orders.'

// ---------------------------------------------------------------------------
// deterministic-ish RNG so the UI doesn't jitter unrecognizably every render
// ---------------------------------------------------------------------------
let seed = 42
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

export interface MockCandle {
  t: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  buyVolume: number
  sellVolume: number
  trades: number
}

let lastPrice = 112438.2

export function genMockCandles(count: number, intervalMs = 1000): MockCandle[] {
  const out: MockCandle[] = []
  let p = lastPrice - count * 0.4
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * 60
    const open = p
    const close = p + drift
    const high = Math.max(open, close) + rand() * 25
    const low = Math.min(open, close) - rand() * 25
    const buyVolume = rand() * 8
    const sellVolume = rand() * 8
    out.push({
      t: now - (count - i) * intervalMs,
      open,
      high,
      low,
      close,
      volume: buyVolume + sellVolume,
      buyVolume,
      sellVolume,
      trades: Math.floor(20 + rand() * 400),
    })
    p = close
  }
  lastPrice = out[out.length - 1]?.close ?? lastPrice
  return out
}

export interface MockBookLevel {
  price: number
  size: number
  orders: number
}

export interface MockBookSnapshot {
  bids: MockBookLevel[]
  asks: MockBookLevel[]
  mid: number
  spread: number
}

export function genMockOrderBook(mid = lastPrice, levels = 12): MockBookSnapshot {
  const tick = 0.1
  const bids: MockBookLevel[] = []
  const asks: MockBookLevel[] = []
  for (let i = 0; i < levels; i++) {
    bids.push({
      price: mid - tick * (i + 1),
      size: +(rand() * 5 + 0.05).toFixed(3),
      orders: Math.floor(1 + rand() * 12),
    })
    asks.push({
      price: mid + tick * (i + 1),
      size: +(rand() * 5 + 0.05).toFixed(3),
      orders: Math.floor(1 + rand() * 12),
    })
  }
  return { bids, asks, mid, spread: tick }
}

export interface MockTrade {
  id: string
  t: number
  side: 'BUY' | 'SELL'
  price: number
  size: number
}

export function genMockTrades(count: number, mid = lastPrice): MockTrade[] {
  const out: MockTrade[] = []
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    out.push({
      id: `mock-trd-${now}-${i}`,
      t: now - (count - i) * 120,
      side: rand() > 0.5 ? 'BUY' : 'SELL',
      price: +(mid + (rand() - 0.5) * 4).toFixed(1),
      size: +(rand() * rand() * 4 + 0.001).toFixed(3),
    })
  }
  return out
}

export interface MockStrategyState {
  name: string
  version: string
  status: 'RUNNING' | 'PAUSED' | 'STOPPED'
  environment: 'RESEARCH' | 'PAPER' | 'LIVE'
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
}

export function genMockStrategyState(): MockStrategyState {
  const inventory = +(0.82 + (rand() - 0.5) * 0.1).toFixed(3)
  return {
    name: 'MM_V18',
    version: 'v18.4',
    status: 'RUNNING',
    environment: 'RESEARCH',
    inventory,
    inventoryValue: +(inventory * lastPrice).toFixed(2),
    realizedPnl: +(421.73 + (rand() - 0.5) * 20).toFixed(2),
    unrealizedPnl: +(184.32 + (rand() - 0.5) * 30).toFixed(2),
    fees: -93.41,
    orders: 382 + Math.floor(rand() * 5),
    fills: 147,
    cancelled: 235,
    fillRate: 38.5,
    latencyMs: +(15 + rand() * 8).toFixed(1),
  }
}

export interface MockBacktestResult {
  id: string
  strategy: string
  initialCapital: number
  finalCapital: number
  netPnl: number
  returnPct: number
  maxDrawdownPct: number
  sharpe: number
  sortino: number
  trades: number
  fillRate: number
  fees: number
  slippage: number
}

export function genMockBacktestResult(strategy: string): MockBacktestResult {
  const initialCapital = 10000
  const returnPct = +(rand() * 25 - 5).toFixed(2)
  const finalCapital = +(initialCapital * (1 + returnPct / 100)).toFixed(2)
  return {
    id: `mock-bt-${Date.now()}`,
    strategy,
    initialCapital,
    finalCapital,
    netPnl: +(finalCapital - initialCapital).toFixed(2),
    returnPct,
    maxDrawdownPct: +(-(rand() * 8 + 1)).toFixed(2),
    sharpe: +(rand() * 3).toFixed(2),
    sortino: +(rand() * 4).toFixed(2),
    trades: Math.floor(20000 + rand() * 60000),
    fillRate: +(20 + rand() * 40).toFixed(1),
    fees: +(200 + rand() * 900).toFixed(0),
    slippage: +(20 + rand() * 200).toFixed(0),
  }
}

export interface MockExperiment {
  id: string
  strategy: string
  label: string
  status: 'RUNNING' | 'QUEUED' | 'COMPLETE' | 'FAILED'
  createdAt: number
  result?: MockBacktestResult
}

export function genMockExperiments(): MockExperiment[] {
  const defs: [string, string, MockExperiment['status']][] = [
    ['MM_V17', 'baseline', 'COMPLETE'],
    ['MM_V18', 'spread test', 'RUNNING'],
    ['MM_V19', 'inventory skew test', 'QUEUED'],
    ['OBI_V04', 'imbalance filter', 'COMPLETE'],
    ['ADAPTIVE_V02', 'vol-adaptive width', 'COMPLETE'],
  ]
  return defs.map(([strategy, label, status], i) => ({
    id: `mock-exp-${i}`,
    strategy,
    label,
    status,
    createdAt: Date.now() - i * 3600_000,
    result: status === 'COMPLETE' ? genMockBacktestResult(strategy) : undefined,
  }))
}

export interface MockLogEntry {
  t: number
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
  category: string
  message: string
}

const MOCK_LOG_MESSAGES: [MockLogEntry['category'], MockLogEntry['level'], string][] = [
  ['Market', 'INFO', 'Order book snapshot resynced (mock)'],
  ['Strategy', 'INFO', 'Requoted bid/ask after fill (mock)'],
  ['Orders', 'WARNING', 'Order rejected: post-only would cross book (mock)'],
  ['Execution', 'INFO', 'Fill received 0.010 BTC @ 112438.1 (mock)'],
  ['Risk', 'WARNING', 'Inventory approaching soft limit (mock)'],
  ['Data', 'DEBUG', 'Sequence check passed, gap=0 (mock)'],
  ['System', 'INFO', 'Backtest worker heartbeat (mock)'],
]

export function genMockLogs(count: number): MockLogEntry[] {
  const now = Date.now()
  const out: MockLogEntry[] = []
  for (let i = 0; i < count; i++) {
    const [category, level, message] = MOCK_LOG_MESSAGES[Math.floor(rand() * MOCK_LOG_MESSAGES.length)]
    out.push({ t: now - i * 4000, category, level, message })
  }
  return out
}

export interface MockAlert {
  id: string
  severity: 'info' | 'warn' | 'bad'
  message: string
  t: number
}

const ALERT_POOL: [MockAlert['severity'], string][] = [
  ['warn', 'Inventory at 82% of soft limit (mock)'],
  ['info', 'Backtest MM_V19 queued (mock)'],
  ['bad', 'Feed latency elevated: 61ms (mock)'],
  ['warn', 'Drawdown threshold approaching: -3.9% (mock)'],
  ['info', 'Strategy MM_V17 stopped by user (mock)'],
  ['bad', 'Order rejection spike detected (mock)'],
]

export function genMockAlerts(count = 4): MockAlert[] {
  const now = Date.now()
  return Array.from({ length: count }, (_, i) => {
    const [severity, message] = ALERT_POOL[Math.floor(rand() * ALERT_POOL.length)]
    return { id: `mock-alert-${now}-${i}`, severity, message, t: now - i * 60_000 }
  })
}

// ---------------------------------------------------------------------------
// Parameter sweep — grid of (spread x inventorySkew) -> pnl, for a heatmap
// ---------------------------------------------------------------------------
export interface MockSweepCell {
  spread: number
  skew: number
  pnl: number
  fillRate: number
}

export function genMockParameterSweep(): MockSweepCell[] {
  const spreads = [2, 4, 6, 8, 10, 12]
  const skews = [0, 0.2, 0.4, 0.6, 0.8, 1.0]
  const out: MockSweepCell[] = []
  for (const spread of spreads) {
    for (const skew of skews) {
      // fabricate a smooth-ish surface with a peak, purely for visual demo
      const peakSpread = 6
      const peakSkew = 0.4
      const dist = Math.pow(spread - peakSpread, 2) / 10 + Math.pow(skew - peakSkew, 2) * 8
      const pnl = +(400 - dist * 40 + (rand() - 0.5) * 60).toFixed(0)
      out.push({ spread, skew, pnl, fillRate: +(50 - spread * 2 + rand() * 10).toFixed(1) })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Walk-forward / out-of-sample split
// ---------------------------------------------------------------------------
export interface MockWalkForwardSplit {
  label: string
  range: string
  role: 'TRAIN' | 'VALIDATION' | 'TEST'
  sharpe: number
  returnPct: number
}

export function genMockWalkForward(): MockWalkForwardSplit[] {
  return [
    { label: 'Split A', range: 'Jan → Mar', role: 'TRAIN', sharpe: 2.1, returnPct: 14.2 },
    { label: 'Split A', range: 'Apr', role: 'VALIDATION', sharpe: 1.6, returnPct: 6.1 },
    { label: 'Split A', range: 'May', role: 'TEST', sharpe: 1.1, returnPct: 3.4 },
    { label: 'Split B', range: 'Feb → Apr', role: 'TRAIN', sharpe: 2.4, returnPct: 16.8 },
    { label: 'Split B', range: 'May', role: 'VALIDATION', sharpe: 1.3, returnPct: 4.9 },
    { label: 'Split B', range: 'Jun', role: 'TEST', sharpe: 0.8, returnPct: 1.2 },
  ]
}

// ---------------------------------------------------------------------------
// Robustness perturbation results
// ---------------------------------------------------------------------------
export function genMockRobustness() {
  return Array.from({ length: 30 }, () => +(180 + (rand() - 0.5) * 500).toFixed(0)).sort((a, b) => a - b)
}
