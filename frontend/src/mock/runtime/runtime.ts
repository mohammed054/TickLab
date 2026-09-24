import {
  Candle,
  Environment,
  MarketDataSource,
  MarketEvent,
  OrderBookLevel,
  OrderBookSnapshot,
  RuntimeSnapshot,
  StrategyState,
  StrategyStatus,
  Trade,
  TradeSide,
  timestampMsToNs,
} from '../../contracts'
import { DEFAULT_SCENARIO_EPOCH_MS, VirtualClock } from './clock'
import { SeededRandom } from './random'

const TICK_INTERVAL_MS = 1_000
const TICK_SIZE = 0.1
const INITIAL_CANDLE_COUNT = 90
const MAX_CANDLES = 120
const MAX_TRADES = 120
const MAX_EVENTS = 600
const SYMBOL = 'BTCUSDT'
const EXCHANGE = 'binance-futures'
const BASE_PRICE = 112_438.2

export interface MockRuntimeOptions {
  seed?: number
  epochMs?: number
  autoStart?: boolean
}

export class MockRuntime implements MarketDataSource {
  readonly id = 'mock-btc-2024-08-08'
  readonly clock: VirtualClock

  private readonly random: SeededRandom
  private readonly listeners = new Set<() => void>()
  private timer: number | null = null
  private sequence = 100_000
  private tick = 0
  private candles: Candle[]
  private trades: Trade[]
  private events: MarketEvent[]
  private orderBook: OrderBookSnapshot
  private strategy: StrategyState
  private snapshot: RuntimeSnapshot

  constructor(options: MockRuntimeOptions = {}) {
    this.random = new SeededRandom(options.seed ?? 424_242)
    this.clock = new VirtualClock(options.epochMs ?? DEFAULT_SCENARIO_EPOCH_MS)
    this.candles = this.createHistory(INITIAL_CANDLE_COUNT)
    this.clock.advance(INITIAL_CANDLE_COUNT * TICK_INTERVAL_MS)
    const currentPrice = this.currentPrice()
    this.trades = this.createHistoricalTrades(40, currentPrice)
    this.events = this.createHistoricalEvents(this.trades)
    this.orderBook = this.createOrderBook(currentPrice, this.sequence)
    this.strategy = this.createInitialStrategy(currentPrice)
    this.snapshot = this.createSnapshot()
    if (options.autoStart) {
      this.start()
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) {
      this.start()
    }
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.stop()
      }
    }
  }

  getSnapshot = (): RuntimeSnapshot => this.snapshot

  start(): void {
    if (this.timer !== null || typeof window === 'undefined') {
      return
    }
    this.timer = window.setInterval(() => this.advanceTick(), TICK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer === null) {
      return
    }
    window.clearInterval(this.timer)
    this.timer = null
  }

  advanceTick(): void {
    this.clock.advance(TICK_INTERVAL_MS)
    this.tick += 1
    this.sequence += 1

    const previous = this.currentPrice()
    const open = previous
    const close = this.roundToTick(previous + this.random.between(-18, 18))
    const high = this.roundToTick(Math.max(open, close) + this.random.between(1, 16))
    const low = this.roundToTick(Math.min(open, close) - this.random.between(1, 16))
    const buyVolume = this.random.between(0.4, 5.5)
    const sellVolume = this.random.between(0.4, 5.5)
    const candle: Candle = {
      timestampNs: this.clock.nowNs(),
      open,
      high,
      low,
      close,
      volume: buyVolume + sellVolume,
      buyVolume,
      sellVolume,
      trades: this.random.integer(12, 48),
    }
    this.candles = [...this.candles.slice(-(MAX_CANDLES - 1)), candle]
    this.orderBook = this.createOrderBook(close, this.sequence)
    this.trades = [...this.createTrades(close), ...this.trades].slice(0, MAX_TRADES)
    this.events = [...this.createTickEvents(candle, close), ...this.events].slice(0, MAX_EVENTS)
    this.strategy = this.updateStrategy(close)
    this.snapshot = this.createSnapshot()
    this.publish()
  }

  getStateFingerprint(): string {
    return JSON.stringify({
      tick: this.tick,
      sequence: this.sequence,
      candles: this.candles,
      trades: this.trades,
      orderBook: this.orderBook,
      strategy: this.strategy,
    })
  }

  setStrategyStatus(status: StrategyStatus): void {
    this.strategy = { ...this.strategy, status }
    this.publish()
  }

  setEnvironment(environment: Environment): void {
    this.strategy = { ...this.strategy, environment }
    this.publish()
  }

  private currentPrice(): number {
    return this.candles[this.candles.length - 1]?.close ?? BASE_PRICE
  }

  private createHistory(count: number): Candle[] {
    const candles: Candle[] = []
    let price = BASE_PRICE - count * 0.4
    const startMs = this.clock.nowMs()
    for (let index = 0; index < count; index += 1) {
      const open = price
      const close = this.roundToTick(open + this.random.between(-14, 14))
      const high = this.roundToTick(Math.max(open, close) + this.random.between(0.5, 12))
      const low = this.roundToTick(Math.min(open, close) - this.random.between(0.5, 12))
      const buyVolume = this.random.between(0.3, 5.2)
      const sellVolume = this.random.between(0.3, 5.2)
      candles.push({
        timestampNs: timestampMsToNs(startMs + index * TICK_INTERVAL_MS),
        open,
        high,
        low,
        close,
        volume: buyVolume + sellVolume,
        buyVolume,
        sellVolume,
        trades: this.random.integer(12, 42),
      })
      price = close
    }
    return candles
  }

  private createHistoricalTrades(count: number, mid: number): Trade[] {
    const trades: Trade[] = []
    const nowMs = this.clock.nowMs()
    for (let index = 0; index < count; index += 1) {
      const side: TradeSide = this.random.next() > 0.5 ? 'BUY' : 'SELL'
      const price = this.roundToTick(mid + this.random.between(-8, 8))
      const size = this.random.between(0.001, 1.4)
      trades.push({
        id: `mock-trade-${index.toString().padStart(4, '0')}`,
        timestampNs: timestampMsToNs(nowMs - (count - index) * 120),
        side,
        price,
        size,
        notional: price * size,
        sequence: this.sequence - count + index,
      })
    }
    return trades
  }

  private createHistoricalEvents(trades: Trade[]): MarketEvent[] {
    return trades.map((trade) => ({
      eventId: trade.id,
      timestampNs: trade.timestampNs,
      symbol: SYMBOL,
      exchange: EXCHANGE,
      type: 'trade',
      sequence: trade.sequence,
      tradeSide: trade.side,
      price: trade.price,
      size: trade.size,
    }))
  }

  private createTrades(mid: number): Trade[] {
    const count = this.random.integer(1, 3)
    const timestampNs = this.clock.nowNs()
    return Array.from({ length: count }, (_, index) => {
      const side: TradeSide = this.random.next() > 0.5 ? 'BUY' : 'SELL'
      const price = this.roundToTick(mid + this.random.between(-6, 6))
      const size = this.random.between(0.001, 1.2)
      return {
        id: `mock-trade-${this.sequence.toString()}-${index}`,
        timestampNs,
        side,
        price,
        size,
        notional: price * size,
        sequence: this.sequence + index,
      }
    })
  }

  private createTickEvents(candle: Candle, mid: number): MarketEvent[] {
    const timestampNs = candle.timestampNs
    const tradeEvents = this.trades
      .filter((trade) => trade.timestampNs === timestampNs)
      .map<MarketEvent>((trade) => ({
        eventId: trade.id,
        timestampNs,
        symbol: SYMBOL,
        exchange: EXCHANGE,
        type: 'trade',
        sequence: trade.sequence,
        tradeSide: trade.side,
        price: trade.price,
        size: trade.size,
      }))
    const strategyDecision: MarketEvent = {
      eventId: `mock-decision-${this.sequence}`,
      timestampNs,
      symbol: SYMBOL,
      exchange: EXCHANGE,
      type: 'strategy_decision',
      sequence: this.sequence,
      price: mid,
      reason: 'quote refresh',
    }
    const orderSubmit: MarketEvent = {
      eventId: `mock-order-submit-${this.sequence}`,
      timestampNs,
      symbol: SYMBOL,
      exchange: EXCHANGE,
      type: 'order_submit',
      sequence: this.sequence,
      orderId: `mock-order-${this.sequence}`,
      price: mid,
      size: 0.01,
    }
    const fillEvent: MarketEvent | null = tradeEvents[0]
      ? {
          ...tradeEvents[0],
          eventId: `mock-fill-${this.sequence}`,
          type: 'fill',
          orderId: `mock-order-${this.sequence}`,
          fillPrice: tradeEvents[0].price,
          queueAhead: 0.4,
        }
      : null
    return [
      {
        eventId: `mock-book-${this.sequence}`,
        timestampNs,
        symbol: SYMBOL,
        exchange: EXCHANGE,
        type: 'book_update',
        sequence: this.sequence,
        price: mid,
      },
      {
        eventId: `mock-ticker-${this.sequence}`,
        timestampNs,
        symbol: SYMBOL,
        exchange: EXCHANGE,
        type: 'ticker',
        sequence: this.sequence,
        price: mid,
      },
      strategyDecision,
      orderSubmit,
      ...(fillEvent ? [fillEvent] : []),
      ...tradeEvents,
    ]
  }

  private createOrderBook(mid: number, sequence: number): OrderBookSnapshot {
    const levelCount = 12
    const roundedMid = this.roundToTick(mid)
    const bids: OrderBookLevel[] = []
    const asks: OrderBookLevel[] = []
    let bidDepth = 0
    let askDepth = 0
    for (let index = 0; index < levelCount; index += 1) {
      const bidPrice = this.roundToTick(roundedMid - TICK_SIZE * (index + 1))
      const askPrice = this.roundToTick(roundedMid + TICK_SIZE * (index + 1))
      const bidSize = this.random.between(0.05, 5)
      const askSize = this.random.between(0.05, 5)
      bidDepth += bidSize
      askDepth += askSize
      bids.push({
        price: bidPrice,
        size: bidSize,
        orderCount: this.random.integer(1, 12),
        cumulativeDepth: bidDepth,
        distanceFromMidTicks: index + 1,
        distanceFromMidBps: ((roundedMid - bidPrice) / roundedMid) * 10_000,
        isStrategyQuote: index === 2,
      })
      asks.push({
        price: askPrice,
        size: askSize,
        orderCount: this.random.integer(1, 12),
        cumulativeDepth: askDepth,
        distanceFromMidTicks: index + 1,
        distanceFromMidBps: (askPrice - roundedMid) / roundedMid * 10_000,
        isStrategyQuote: index === 2,
      })
    }
    return {
      timestampNs: this.clock.nowNs(),
      symbol: SYMBOL,
      exchange: EXCHANGE,
      sequence,
      bids,
      asks,
      mid: roundedMid,
      spread: TICK_SIZE,
    }
  }

  private createInitialStrategy(price: number): StrategyState {
    return {
      id: 'strategy-mm-v18',
      name: 'MM_V18',
      version: 'v18.4',
      status: 'RUNNING',
      environment: 'RESEARCH' satisfies Environment,
      inventory: 0.82,
      inventoryValue: 0.82 * price,
      realizedPnl: 421.73,
      unrealizedPnl: 184.32,
      fees: -93.41,
      orders: 382,
      fills: 147,
      cancelled: 235,
      fillRate: 38.5,
      latencyMs: 18.4,
    }
  }

  private updateStrategy(price: number): StrategyState {
    const recentTrades = this.trades.slice(0, 3)
    const inventoryDelta = recentTrades.reduce((total, trade) => total + (trade.side === 'BUY' ? trade.size : -trade.size), 0)
    const inventory = this.clamp(this.strategy.inventory + inventoryDelta * 0.015, -2, 2)
    const fees = this.strategy.fees - recentTrades.reduce((total, trade) => total + trade.notional * 0.00005, 0)
    const realizedPnl = this.strategy.realizedPnl + this.random.between(-1.5, 2.5)
    const unrealizedPnl = inventory * (price - 112_400)
    const orders = this.strategy.orders + recentTrades.length
    const fills = this.strategy.fills + recentTrades.length
    const cancelled = this.strategy.cancelled + (recentTrades.length > 2 ? 1 : 0)
    return {
      ...this.strategy,
      inventory,
      inventoryValue: inventory * price,
      realizedPnl,
      unrealizedPnl,
      fees,
      orders,
      fills,
      cancelled,
      fillRate: (fills / orders) * 100,
      latencyMs: this.roundToTick(this.random.between(14, 24)),
    }
  }

  private createSnapshot(): RuntimeSnapshot {
    const first = this.candles[0]?.close ?? BASE_PRICE
    const last = this.currentPrice()
    return {
      logicalTimeNs: this.clock.nowNs(),
      symbol: SYMBOL,
      exchange: EXCHANGE,
      tick: this.tick,
      changePct24h: ((last - first) / first) * 100,
      high24h: Math.max(...this.candles.map((candle) => candle.high)),
      low24h: Math.min(...this.candles.map((candle) => candle.low)),
      volume24hUsd: this.candles.reduce((total, candle) => total + candle.volume * candle.close, 0),
      candles: this.candles,
      orderBook: this.orderBook,
      trades: this.trades,
      events: this.events,
      strategy: this.strategy,
    }
  }

  private publish(): void {
    this.snapshot = this.createSnapshot()
    this.listeners.forEach((listener) => listener())
  }

  private roundToTick(value: number): number {
    return Number((Math.round(value / TICK_SIZE) * TICK_SIZE).toFixed(1))
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
  }
}

export const mockRuntime = new MockRuntime()
