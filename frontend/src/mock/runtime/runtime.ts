import {
  Candle,
  Environment,
  MarketDataSource,
  MarketEvent,
  OrderBookLevel,
  OrderBookSnapshot,
  RiskLimitsConfig,
  RuntimeSnapshot,
  StrategyFill,
  StrategyState,
  StrategyStatus,
  Trade,
  TradeSide,
  timestampMsToNs,
} from '../../contracts'
import { DEFAULT_SCENARIO_EPOCH_MS, VirtualClock } from './clock'
import { SeededRandom } from './random'

/**
 * Deterministic market + strategy simulation.
 *
 * Everything the UI shows is derived from ONE source of truth so numbers cannot contradict:
 *   - candles are aggregated from the simulated trades (volume, trade count, buy/sell split)
 *   - the order book is built from the last trade (best bid/ask sit next to it); spread = ask - bid
 *   - strategy fills only happen when the candle actually traded through the resting quote
 *   - strategy P&L uses average-cost accounting; orders === fills + cancelled + rejected + open
 *   - risk limits live in RISK_LIMITS and are enforced here (a breach stops the strategy)
 */

const TICK_INTERVAL_MS = 1_000
const TICK_SIZE = 0.1
const BOOK_LEVELS = 20
const INITIAL_CANDLE_COUNT = 3_600 // 1 hour of 1s history, so 1m / 5m timeframes have real bars
const MAX_CANDLES = 7_200
const MAX_TRADES = 600
const MAX_EVENTS = 12_000
const MAX_FILLS = 2_000
const LATENCY_WINDOW = 300
const SYMBOL = 'BTCUSDT'
const EXCHANGE = 'binance-futures'
const BASE_PRICE = 112_438.2

/** Maker fee as a fraction of notional (0.2 bps). Kept small so P&L is driven by inventory. */
const MAKER_FEE_RATE = 0.00002

export const INITIAL_CAPITAL = 100_000

export const RISK_LIMITS: RiskLimitsConfig = {
  maxPosition: 2,
  maxOrderSize: 0.05,
  maxDailyLoss: 2_000,
  maxDrawdownPct: 2,
  maxOpenOrders: 8,
  maxOrderRatePerSec: 20,
  maxNotionalExposure: 250_000,
  emergencyStopEnabled: true,
}

export interface MockRuntimeOptions {
  seed?: number
  epochMs?: number
  autoStart?: boolean
}

interface Quote {
  price: number
  size: number
  orderId: string
}

interface Engine {
  position: number
  avgEntry: number | null
  realized: number
  fees: number
  orders: number
  fills: number
  cancelled: number
  rejected: number
  peakNet: number
  halted: string | null
  bid: Quote | null
  ask: Quote | null
  status: StrategyStatus
  environment: Environment
  orderSeq: number
  recentOrders: number[]
}

interface TickOutcome {
  fills: StrategyFill[]
  submitted: Array<{ quote: Quote; side: 'bid' | 'ask' }>
}

export class MockRuntime implements MarketDataSource {
  readonly id = 'mock-btc-2024-08-08'
  readonly clock: VirtualClock

  private readonly random: SeededRandom
  private readonly listeners = new Set<() => void>()
  private timer: number | null = null
  private sequence = 100_000
  private tick = 0
  private candles: Candle[] = []
  private trades: Trade[] = []
  private events: MarketEvent[] = []
  private fills: StrategyFill[] = []
  private orderBook!: OrderBookSnapshot
  private engine: Engine
  private latencySamples: number[] = []
  private snapshot!: RuntimeSnapshot

  // Session statistics are maintained incrementally so they stay correct after the candle buffer rolls over.
  private sessionOpen = BASE_PRICE
  private sessionHigh = -Infinity
  private sessionLow = Infinity
  private sessionVolumeBtc = 0
  private sessionVolumeUsd = 0

  constructor(options: MockRuntimeOptions = {}) {
    this.random = new SeededRandom(options.seed ?? 424_242)
    this.clock = new VirtualClock(options.epochMs ?? DEFAULT_SCENARIO_EPOCH_MS)
    this.engine = {
      position: 0,
      avgEntry: null,
      realized: 0,
      fees: 0,
      orders: 0,
      fills: 0,
      cancelled: 0,
      rejected: 0,
      peakNet: 0,
      halted: null,
      bid: null,
      ask: null,
      status: 'RUNNING',
      environment: 'RESEARCH',
      orderSeq: 0,
      recentOrders: [],
    }

    // Warm up with the exact step function the live loop uses, so history, tape, fills and
    // strategy counters are all consistent with each other at "now".
    for (let index = 0; index < INITIAL_CANDLE_COUNT; index += 1) this.step()
    this.snapshot = this.createSnapshot()
    if (options.autoStart) this.start()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stop()
    }
  }

  getSnapshot = (): RuntimeSnapshot => this.snapshot

  start(): void {
    if (this.timer !== null || typeof window === 'undefined') return
    this.timer = window.setInterval(() => this.advanceTick(), TICK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer === null) return
    window.clearInterval(this.timer)
    this.timer = null
  }

  advanceTick(): void {
    this.step()
    this.publish()
  }

  getStateFingerprint(): string {
    return JSON.stringify({
      tick: this.tick,
      sequence: this.sequence,
      candles: this.candles,
      trades: this.trades,
      orderBook: this.orderBook,
      fills: this.fills,
      strategy: this.strategyState(),
    })
  }

  setStrategyStatus(status: StrategyStatus): void {
    this.engine.status = status
    if (status === 'RUNNING') this.engine.halted = null // limits are re-evaluated on the next tick
    this.publish()
  }

  setEnvironment(environment: Environment): void {
    this.engine.environment = environment
    this.publish()
  }

  // ---------------------------------------------------------------- simulation step

  private step(): void {
    const startMs = this.clock.nowMs()
    const previousClose = this.candles[this.candles.length - 1]?.close ?? this.sessionOpen
    const { candle, trades } = this.simulateSecond(startMs, this.roundToTick(previousClose))
    this.clock.advance(TICK_INTERVAL_MS)
    this.tick += 1

    const lastTrade = trades[trades.length - 1]
    this.orderBook = this.createBook(candle.close, lastTrade?.side ?? 'BUY')

    const outcome = this.stepStrategy(candle, this.orderBook.mid, startMs)
    this.flagStrategyQuotes()

    this.candles = [...this.candles, candle].slice(-MAX_CANDLES)
    this.trades = [...[...trades].reverse(), ...this.trades].slice(0, MAX_TRADES) // newest first
    this.fills = [...this.fills, ...outcome.fills].slice(-MAX_FILLS)
    this.updateSession(candle, trades)
    this.sampleLatency()
    this.events = [...this.createTickEvents(candle, trades, outcome), ...this.events].slice(0, MAX_EVENTS)
    this.snapshot = this.createSnapshot()
  }

  /** One second of trading: a random-walk price path; candle values are derived from the trades themselves. */
  private simulateSecond(startMs: number, open: number): { candle: Candle; trades: Trade[] } {
    const count = this.random.integer(8, 24)
    const trades: Trade[] = []
    let price = open
    let high = open
    let low = open
    let buyVolume = 0
    let sellVolume = 0
    for (let index = 0; index < count; index += 1) {
      const side: TradeSide = this.random.next() > 0.5 ? 'BUY' : 'SELL'
      price = this.roundToTick(price + this.random.between(-3.5, 3.5))
      const size = this.tradeSize()
      high = Math.max(high, price)
      low = Math.min(low, price)
      if (side === 'BUY') buyVolume += size
      else sellVolume += size
      this.sequence += 1
      trades.push({
        id: `mock-trade-${this.sequence}`,
        timestampNs: timestampMsToNs(startMs + Math.floor(((index + 0.5) / count) * TICK_INTERVAL_MS)),
        side,
        price,
        size,
        notional: price * size,
        sequence: this.sequence,
      })
    }
    const candle: Candle = {
      timestampNs: timestampMsToNs(startMs),
      open,
      high,
      low,
      close: price,
      volume: Number((buyVolume + sellVolume).toFixed(3)),
      buyVolume: Number(buyVolume.toFixed(3)),
      sellVolume: Number(sellVolume.toFixed(3)),
      trades: count,
    }
    return { candle, trades }
  }

  private tradeSize(): number {
    const base = 0.002 + -Math.log(1 - this.random.next()) * 0.07
    const block = this.random.next() < 0.02 ? this.random.between(0.4, 2.2) : 0
    return Math.max(0.001, Number(Math.min(base + block, 5).toFixed(3)))
  }

  private createBook(close: number, lastSide: TradeSide): OrderBookSnapshot {
    // The last trade printed at the touch it hit: a buy lifts the ask, a sell hits the bid.
    const bestBid = lastSide === 'BUY' ? this.roundToTick(close - TICK_SIZE) : close
    const bestAsk = this.roundToTick(bestBid + TICK_SIZE)
    const mid = (bestBid + bestAsk) / 2
    const bids: OrderBookLevel[] = []
    const asks: OrderBookLevel[] = []
    let bidDepth = 0
    let askDepth = 0
    for (let index = 0; index < BOOK_LEVELS; index += 1) {
      const bidPrice = this.roundToTick(bestBid - TICK_SIZE * index)
      const askPrice = this.roundToTick(bestAsk + TICK_SIZE * index)
      const bidSize = Number(this.random.between(0.1, 4).toFixed(3))
      const askSize = Number(this.random.between(0.1, 4).toFixed(3))
      bidDepth += bidSize
      askDepth += askSize
      bids.push({
        price: bidPrice,
        size: bidSize,
        orderCount: null,
        cumulativeDepth: Number(bidDepth.toFixed(3)),
        distanceFromMidTicks: (mid - bidPrice) / TICK_SIZE,
        distanceFromMidBps: ((mid - bidPrice) / mid) * 10_000,
        isStrategyQuote: false,
      })
      asks.push({
        price: askPrice,
        size: askSize,
        orderCount: null,
        cumulativeDepth: Number(askDepth.toFixed(3)),
        distanceFromMidTicks: (askPrice - mid) / TICK_SIZE,
        distanceFromMidBps: ((askPrice - mid) / mid) * 10_000,
        isStrategyQuote: false,
      })
    }
    return {
      timestampNs: this.clock.nowNs(),
      symbol: SYMBOL,
      exchange: EXCHANGE,
      sequence: this.sequence,
      bids,
      asks,
      mid,
      spread: Number((bestAsk - bestBid).toFixed(1)),
    }
  }

  private flagStrategyQuotes(): void {
    const { bid, ask } = this.engine
    this.orderBook = {
      ...this.orderBook,
      bids: this.orderBook.bids.map((level) => ({ ...level, isStrategyQuote: bid !== null && level.price === bid.price })),
      asks: this.orderBook.asks.map((level) => ({ ...level, isStrategyQuote: ask !== null && level.price === ask.price })),
    }
  }

  // ---------------------------------------------------------------- strategy

  private stepStrategy(candle: Candle, mid: number, startMs: number): TickOutcome {
    const engine = this.engine
    const ordersAtStart = engine.orders
    const fills: StrategyFill[] = []
    const submitted: TickOutcome['submitted'] = []

    // 1. Resolve last tick's resting quotes. A quote can only fill if the market traded through it.
    for (const side of ['bid', 'ask'] as const) {
      const quote = engine[side]
      if (!quote) continue
      engine[side] = null
      const touched = side === 'bid' ? candle.low <= quote.price : candle.high >= quote.price
      // Inventory skew: quote less aggressively on the side that adds to the position.
      const skew = 1 + (side === 'bid' ? -1 : 1) * (engine.position / RISK_LIMITS.maxPosition) * 0.8
      const capacity = side === 'bid' ? RISK_LIMITS.maxPosition - engine.position : RISK_LIMITS.maxPosition + engine.position
      const size = Number(Math.min(quote.size, capacity).toFixed(3))
      if (touched && size >= 0.001 && this.random.next() < 0.22 * Math.max(0.1, skew)) {
        const fillMs = startMs + this.random.integer(0, TICK_INTERVAL_MS - 1)
        fills.push(this.applyFill(side === 'bid' ? 'BUY' : 'SELL', quote, size, fillMs))
        engine.fills += 1
      } else {
        engine.cancelled += 1
      }
    }

    // 2. Mark to market and enforce risk limits.
    const net = this.netPnl(mid)
    engine.peakNet = Math.max(engine.peakNet, net)
    if (engine.status === 'RUNNING' && !engine.halted) {
      const drawdownPct = ((engine.peakNet - net) / INITIAL_CAPITAL) * 100
      if (-net >= RISK_LIMITS.maxDailyLoss) engine.halted = 'Daily loss limit reached'
      else if (drawdownPct >= RISK_LIMITS.maxDrawdownPct) engine.halted = 'Drawdown limit reached'
      if (engine.halted) engine.status = 'STOPPED'
    }

    // 3. Post fresh quotes one tick behind the touch (skip a side that is at the position limit).
    if (engine.status === 'RUNNING') {
      const bestBid = this.orderBook.bids[0].price
      const bestAsk = this.orderBook.asks[0].price
      for (const side of ['bid', 'ask'] as const) {
        const atLimit =
          side === 'bid'
            ? engine.position >= RISK_LIMITS.maxPosition - 0.001
            : engine.position <= -RISK_LIMITS.maxPosition + 0.001
        if (atLimit) continue
        engine.orders += 1
        engine.orderSeq += 1
        if (this.random.next() < 0.004) {
          engine.rejected += 1
          continue
        }
        const quote: Quote = {
          price: side === 'bid' ? this.roundToTick(bestBid - TICK_SIZE) : this.roundToTick(bestAsk + TICK_SIZE),
          size: Number(this.random.between(0.01, RISK_LIMITS.maxOrderSize).toFixed(3)),
          orderId: `mock-order-${engine.orderSeq}`,
        }
        engine[side] = quote
        submitted.push({ quote, side })
      }
    }
    engine.recentOrders = [...engine.recentOrders, engine.orders - ordersAtStart].slice(-5)
    return { fills, submitted }
  }

  /** Average-cost position accounting. Returns the recorded fill. */
  private applyFill(side: TradeSide, quote: Quote, size: number, fillMs: number): StrategyFill {
    const engine = this.engine
    const signed = side === 'BUY' ? size : -size
    const price = quote.price
    const position = engine.position
    if (position === 0 || Math.sign(position) === Math.sign(signed)) {
      const current = Math.abs(position)
      engine.avgEntry = ((engine.avgEntry ?? price) * current + price * size) / (current + size)
      engine.position = position + signed
    } else {
      const closing = Math.min(Math.abs(position), size)
      engine.realized += closing * (price - (engine.avgEntry ?? price)) * Math.sign(position)
      const remaining = position + signed
      if (Math.abs(remaining) < 1e-9) {
        engine.position = 0
        engine.avgEntry = null
      } else {
        if (Math.sign(remaining) !== Math.sign(position)) engine.avgEntry = price // flipped: leftover opens at fill price
        engine.position = remaining
      }
    }
    engine.position = Number(engine.position.toFixed(4))
    const fee = -(price * size * MAKER_FEE_RATE)
    engine.fees += fee
    return {
      id: `mock-fill-${this.sequence}-${engine.fills + 1}`,
      timestampNs: timestampMsToNs(fillMs),
      side,
      price,
      size,
      fee,
      positionAfter: engine.position,
    }
  }

  private netPnl(mark: number): number {
    const engine = this.engine
    const unrealized = engine.avgEntry === null ? 0 : engine.position * (mark - engine.avgEntry)
    return engine.realized + unrealized + engine.fees
  }

  private strategyState(): StrategyState {
    const engine = this.engine
    const mark = this.orderBook?.mid ?? BASE_PRICE
    const unrealized = engine.avgEntry === null ? 0 : engine.position * (mark - engine.avgEntry)
    const net = engine.realized + unrealized + engine.fees
    return {
      id: 'strategy-mm-v18',
      name: 'MM_V18',
      version: 'v18.4',
      status: engine.status,
      environment: engine.environment,
      inventory: engine.position,
      inventoryValue: engine.position * mark,
      realizedPnl: engine.realized,
      unrealizedPnl: unrealized,
      fees: engine.fees,
      orders: engine.orders,
      fills: engine.fills,
      cancelled: engine.cancelled,
      fillRate: engine.orders > 0 ? (engine.fills / engine.orders) * 100 : 0,
      latencyMs: this.latencySamples[this.latencySamples.length - 1] ?? 0,
      openOrders: (engine.bid ? 1 : 0) + (engine.ask ? 1 : 0),
      rejected: engine.rejected,
      avgEntryPrice: engine.avgEntry,
      netPnl: net,
      drawdown: Math.max(0, engine.peakNet - net),
      halted: engine.halted,
    }
  }

  // ---------------------------------------------------------------- events / stats

  private createTickEvents(candle: Candle, trades: Trade[], outcome: TickOutcome): MarketEvent[] {
    const endNs = timestampMsToNs(Number(BigInt(candle.timestampNs) / 1_000_000n) + TICK_INTERVAL_MS)
    const base = { symbol: SYMBOL, exchange: EXCHANGE }
    const events: MarketEvent[] = trades.map((trade) => ({
      ...base,
      eventId: trade.id,
      timestampNs: trade.timestampNs,
      type: 'trade',
      sequence: trade.sequence,
      tradeSide: trade.side,
      price: trade.price,
      size: trade.size,
    }))
    for (const fill of outcome.fills) {
      this.sequence += 1
      events.push({
        ...base,
        eventId: fill.id,
        timestampNs: fill.timestampNs,
        type: 'fill',
        sequence: this.sequence,
        tradeSide: fill.side,
        price: fill.price,
        fillPrice: fill.price,
        size: fill.size,
        queueAhead: 0,
      })
    }
    this.sequence += 1
    events.push({
      ...base,
      eventId: `mock-decision-${this.sequence}`,
      timestampNs: endNs,
      type: 'strategy_decision',
      sequence: this.sequence,
      price: this.orderBook.mid,
      reason: this.engine.halted ?? (this.engine.status === 'RUNNING' ? 'quote refresh' : 'strategy not running'),
    })
    for (const { quote, side } of outcome.submitted) {
      this.sequence += 1
      events.push({
        ...base,
        eventId: `mock-submit-${quote.orderId}`,
        timestampNs: endNs,
        type: 'order_submit',
        sequence: this.sequence,
        side,
        orderId: quote.orderId,
        price: quote.price,
        size: quote.size,
      })
    }
    this.sequence += 1
    events.push({ ...base, eventId: `mock-book-${this.sequence}`, timestampNs: endNs, type: 'book_update', sequence: this.sequence, price: this.orderBook.mid })
    this.sequence += 1
    events.push({ ...base, eventId: `mock-ticker-${this.sequence}`, timestampNs: endNs, type: 'ticker', sequence: this.sequence, price: candle.close })
    return events
  }

  private updateSession(candle: Candle, trades: Trade[]): void {
    if (this.tick === 1) this.sessionOpen = candle.open
    this.sessionHigh = Math.max(this.sessionHigh, candle.high)
    this.sessionLow = Math.min(this.sessionLow, candle.low)
    this.sessionVolumeBtc += candle.volume
    this.sessionVolumeUsd += trades.reduce((total, trade) => total + trade.notional, 0)
  }

  private sampleLatency(): void {
    const spike = this.random.next() < 0.03 ? this.random.between(15, 45) : 0
    const sample = Number((12 + this.random.between(0, 8) + spike).toFixed(1))
    this.latencySamples = [...this.latencySamples, sample].slice(-LATENCY_WINDOW)
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  }

  private createSnapshot(): RuntimeSnapshot {
    const last = this.candles[this.candles.length - 1]?.close ?? BASE_PRICE
    const recent = this.engine.recentOrders
    return {
      logicalTimeNs: this.clock.nowNs(),
      symbol: SYMBOL,
      exchange: EXCHANGE,
      tick: this.tick,
      sessionOpen: this.sessionOpen,
      changePctSession: ((last - this.sessionOpen) / this.sessionOpen) * 100,
      highSession: this.sessionHigh,
      lowSession: this.sessionLow,
      volumeSessionBtc: this.sessionVolumeBtc,
      volumeSessionUsd: this.sessionVolumeUsd,
      candles: this.candles,
      orderBook: this.orderBook,
      trades: this.trades,
      events: this.events,
      strategy: this.strategyState(),
      fills: this.fills,
      riskLimits: RISK_LIMITS,
      initialCapital: INITIAL_CAPITAL,
      latencyP50Ms: this.percentile(this.latencySamples, 0.5),
      latencyP99Ms: this.percentile(this.latencySamples, 0.99),
      orderRatePerSec: recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0,
    }
  }

  private publish(): void {
    this.snapshot = this.createSnapshot()
    this.listeners.forEach((listener) => listener())
  }

  private roundToTick(value: number): number {
    return Number((Math.round(value / TICK_SIZE) * TICK_SIZE).toFixed(1))
  }
}

export const mockRuntime = new MockRuntime()
