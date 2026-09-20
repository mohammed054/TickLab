/** Chart modes per docs/07 §7.2.1. Default: "candles". */
export type ChartMode =
  | 'candles' | 'line' | 'area' | 'tick' | 'trades'
  | 'footprint' | 'depth' | 'orderflow' | 'replay'

/** Timeframes per docs/07 §7.2.2. Local UI state only (docs/02 §2.3.3). */
export type TimeframeId =
  | 'tick' | '1s' | '5s' | '15s' | '30s'
  | '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | 'custom'

export const TIMEFRAME_MS: Record<Exclude<TimeframeId, 'tick' | 'custom'>, number> = {
  '1s': 1_000,
  '5s': 5_000,
  '15s': 15_000,
  '30s': 30_000,
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000
}

/** One aggregated candle. Timestamps are nanosecond epoch (docs/15 §15.1). */
export interface CandleDatum {
  timeNs: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  tradeCount: number
  buyVolume: number
  sellVolume: number
  /** Mean bid-ask spread over the candle (needs book feed; null when unavailable). */
  avgSpread: number | null
  /** Stdev of intra-candle log returns for the §7.2.3 tooltip (0 when <2 ticks). */
  intraVolStdev: number
}

/** Overlays per docs/07 §7.2.4. None on by default except VWAP + strategy quotes
 *  when a strategy is active (strategy-gated ones hidden entirely with no strategy). */
export type OverlayId =
  | 'vwap' | 'ma' | 'ema' | 'volume' | 'volatility' | 'cvd'
  | 'obImbalance' | 'spread' | 'midPrice' | 'microPrice' | 'fairValue'
  | 'strategyQuotes' | 'simOrders' | 'liveOrders' | 'simFills' | 'liveFills'
  | 'inventory' | 'pnl' | 'latencyMarkers'

export interface OverlayDef {
  id: OverlayId
  label: string
  /** Why the toggle is disabled (book feed / strategy / event stream missing). */
  disabledReason: string | null
}

/** Order lifecycle states (docs/11 §11.5) for overlay markers. */
export type OverlayOrderState =
  | 'submitted' | 'working' | 'partial_fill' | 'filled'
  | 'cancelled' | 'rejected' | 'expired'

export interface OverlayMark {
  timeNs: number
  price: number
  side: 'buy' | 'sell'
  state: OverlayOrderState
  label?: string
}

export interface StrategyMarks {
  quotes: OverlayMark[]
  orders: OverlayMark[]
  fills: OverlayMark[]
  fairValue: { timeNs: number; price: number }[]
}

export const EMPTY_MARKS: StrategyMarks = { quotes: [], orders: [], fills: [], fairValue: [] }
