import type { CandleDatum } from './types'

/**
 * Deterministic fixture market data for single-screen development.
 * Used ONLY until a real candle/event source exists (market WS topics / replay
 * EventStream). The chart shows a "FIXTURE" badge whenever this path is active,
 * so fixtureoutput is never mistaken for real market data.
 *
 * No symbol is hardcoded anywhere (docs/14 §14.12): the seed and base price
 * derive from the symbol string, so any symbol produces a plausible series.
 */

export interface FixtureSet {
  candles1s: CandleDatum[]
  symbol: string
  tickSize: number
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function fixtureTickSize(symbol: string): number {
  const base = fixtureBasePrice(symbol)
  if (base >= 10_000) return 0.1
  if (base >= 100) return 0.01
  return 0.001
}

export function fixtureBasePrice(symbol: string): number {
  const h = hashString(symbol || 'X')
  return 10_000 + (h % 90_000) + (h % 100) / 100
}

/**
 * Generate `seconds` 1-second candles ending at `endNs` (default: now).
 * Each candle aggregates ~8 synthetic ticks so intra-candle stats (buy/sell
 * split, intraVolStdev) are real aggregations of the synthetic ticks, not
 * invented per-candle randoms.
 */
export function generateFixture(symbol: string, seconds = 3 * 3600, endNs?: number): FixtureSet {
  const rand = mulberry32(hashString(`ticklab-fixture:${symbol}`))
  const base = fixtureBasePrice(symbol)
  const tickSize = fixtureTickSize(symbol)
  const endSec = Math.floor((endNs ?? Date.now() * 1_000_000) / 1_000_000_000)
  const startSec = endSec - seconds

  let price = base * (1 + (rand() - 0.5) * 0.02)
  const candles1s: CandleDatum[] = []

  for (let s = startSec; s < endSec; s++) {
    const tickCount = 5 + Math.floor(rand() * 6)
    let o = price
    let h = price
    let l = price
    let buyVol = 0
    let sellVol = 0
    let trades = 0
    const logRets: number[] = []
    let prev = price

    for (let t = 0; t < tickCount; t++) {
      const drift = (rand() - 0.5) * base * 0.0004
      price = Math.max(price + drift, base * 0.5)
      h = Math.max(h, price)
      l = Math.min(l, price)
      const size = 0.001 + rand() * 0.05
      if (rand() >= 0.5) buyVol += size
      else sellVol += size
      trades += 1 + Math.floor(rand() * 3)
      if (prev > 0 && price > 0) logRets.push(Math.log(price / prev))
      prev = price
    }

    const c = price
    const n = logRets.length
    const mean = n ? logRets.reduce((a, b) => a + b, 0) / n : 0
    const intraVolStdev = n > 1
      ? Math.sqrt(logRets.reduce((a, r) => a + (r - mean) * (r - mean), 0) / (n - 1))
      : 0

    candles1s.push({
      timeNs: s * 1_000_000_000,
      open: roundTick(o, tickSize),
      high: roundTick(h, tickSize),
      low: roundTick(l, tickSize),
      close: roundTick(c, tickSize),
      volume: buyVol + sellVol,
      tradeCount: trades,
      buyVolume: buyVol,
      sellVolume: sellVol,
      // No order-book feed in fixture → null (tooltip renders "—", §14.7).
      avgSpread: null,
      intraVolStdev
    })
  }

  return { candles1s, symbol, tickSize }
}

function roundTick(v: number, tickSize: number): number {
  return Math.round(v / tickSize) * tickSize
}
