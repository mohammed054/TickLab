import type { CandleDatum } from './types'

/**
 * Client-side series math for chart overlays (docs/07 §7.2.4).
 * These are display aggregations over already-loaded candles — not the
 * analytics-suite computations in docs/09 (those live server-side).
 */

export interface LinePoint { timeNs: number; value: number }

/** Bucket 1s candles into a coarser timeframe (standard OHLCV aggregation). */
export function aggregateCandles(candles: CandleDatum[], tfMs: number): CandleDatum[] {
  if (tfMs <= 1000 || candles.length === 0) return candles
  const out: CandleDatum[] = []
  let cur: CandleDatum | null = null
  let curBucket = -1
  const intra: number[] = []

  const flush = () => {
    if (!cur) return
    const n = intra.length
    const mean = n ? intra.reduce((a, b) => a + b, 0) / n : 0
    cur.intraVolStdev = n > 1
      ? Math.sqrt(intra.reduce((a, r) => a + (r - mean) * (r - mean), 0) / (n - 1))
      : 0
    out.push(cur)
    intra.length = 0
  }

  for (const c of candles) {
    const b = Math.floor(c.timeNs / 1_000_000 / tfMs)
    if (b !== curBucket) {
      flush()
      curBucket = b
      const t0 = Math.floor(c.timeNs / 1_000_000 / tfMs) * tfMs
      cur = { ...c, timeNs: t0 * 1_000_000 }
    } else if (cur) {
      cur.high = Math.max(cur.high, c.high)
      cur.low = Math.min(cur.low, c.low)
      cur.close = c.close
      cur.volume += c.volume
      cur.tradeCount += c.tradeCount
      cur.buyVolume += c.buyVolume
      cur.sellVolume += c.sellVolume
      if (cur.avgSpread == null) cur.avgSpread = c.avgSpread
      else if (c.avgSpread != null) cur.avgSpread = (cur.avgSpread + c.avgSpread) / 2
    }
    // Rebuild intra-bucket returns from candle closes (approximation of the
    // finer series; exact intra stats come from the source resolution).
    if (cur && out.length + 1 > 0) intra.push(Math.log(Math.max(c.close, 1e-9) / Math.max(c.open, 1e-9)))
  }
  flush()
  return out
}

/** Session volume-weighted average price. */
export function vwap(candles: CandleDatum[]): LinePoint[] {
  let pv = 0
  let v = 0
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3
    pv += typical * c.volume
    v += c.volume
    return { timeNs: c.timeNs, value: v > 0 ? pv / v : c.close }
  })
}

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (values.length === 0) return out
  const k = 2 / (period + 1)
  let prev = values[0]
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    if (i >= period - 1) out[i] = prev
  }
  return out
}

export function toLine(candles: CandleDatum[], values: (number | null)[]): LinePoint[] {
  const pts: LinePoint[] = []
  for (let i = 0; i < candles.length; i++) {
    if (values[i] != null) pts.push({ timeNs: candles[i].timeNs, value: values[i] as number })
  }
  return pts
}

/**
 * Rolling realized volatility, close-to-close log returns, annualized.
 * Default estimator per docs/09 §9.11 ("realized volatility from log returns at
 * the Recorder's sampling frequency, annualized"); 365-day year follows the
 * 24/7-crypto convention (upstream guidance, see Block 2.4 STATE entry).
 */
export function rollingRealizedVol(
  closes: number[],
  candleSec: number,
  period = 60
): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  const rets: number[] = []
  for (let i = 1; i < closes.length; i++) {
    rets.push(Math.log(Math.max(closes[i], 1e-9) / Math.max(closes[i - 1], 1e-9)))
  }
  const perYear = (365 * 24 * 3600) / Math.max(candleSec, 1)
  for (let i = period; i < rets.length + 1; i++) {
    const win = rets.slice(i - period, i)
    const mean = win.reduce((a, b) => a + b, 0) / win.length
    const sd = Math.sqrt(win.reduce((a, r) => a + (r - mean) * (r - mean), 0) / (win.length - 1))
    out[i] = sd * Math.sqrt(perYear)
  }
  return out
}

/** Cumulative volume delta: Σ(buy − sell) volume (docs/07 §7.2.4). */
export function cvd(candles: CandleDatum[]): LinePoint[] {
  let acc = 0
  return candles.map((c) => {
    acc += c.buyVolume - c.sellVolume
    return { timeNs: c.timeNs, value: acc }
  })
}

/** Mid price (H+L)/2 display series. */
export function midPrices(candles: CandleDatum[]): LinePoint[] {
  return candles.map((c) => ({ timeNs: c.timeNs, value: (c.high + c.low) / 2 }))
}
