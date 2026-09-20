export interface OrderBookRow {
  priceTick: number
  size: number
  orderCount: number | null
  cumulativeDepth: number
  distanceFromMidTicks: number
  distanceFromMidBps: number
  isStrategyQuote: boolean
}

export type BookMode = 'ladder' | 'heatmap' | 'depth-profile' | 'imbalance' | 'microstructure' | 'replay'
export type DepthLevel = 5 | 10 | 25 | 50 | 100
export type PriceAggregation = '0.1' | '0.5' | '1' | '5' | 'custom'
