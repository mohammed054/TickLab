export const MOCK_DATA_DISCLAIMER = 'ALL DATA ON THIS SCREEN IS SIMULATED. No real market data, no exchange connection, no real orders.'

export interface MockSweepCell {
  spread: number
  skew: number
  pnl: number
  fillRate: number
}

export interface MockWalkForwardSplit {
  label: string
  range: string
  role: 'TRAIN' | 'VALIDATION' | 'TEST'
  sharpe: number
  returnPct: number
}

function deterministicNoise(index: number, salt: number): number {
  const value = Math.sin((index + 1) * (salt + 1) * 12.9898) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

export function generateParameterSweep(): MockSweepCell[] {
  const spreads = [2, 4, 6, 8, 10, 12]
  const skews = [0, 0.2, 0.4, 0.6, 0.8, 1]
  return spreads.flatMap((spread, spreadIndex) => skews.map((skew, skewIndex) => {
    const distance = Math.pow(spread - 6, 2) / 10 + Math.pow(skew - 0.4, 2) * 8
    const index = spreadIndex * skews.length + skewIndex
    return { spread, skew, pnl: Math.round(400 - distance * 40 + deterministicNoise(index, 3) * 30), fillRate: Number((50 - spread * 2 + deterministicNoise(index, 5) * 5).toFixed(1)) }
  }))
}

export function generateWalkForward(): MockWalkForwardSplit[] {
  return [
    { label: 'Split A', range: 'Jan → Mar', role: 'TRAIN', sharpe: 2.1, returnPct: 14.2 },
    { label: 'Split A', range: 'Apr', role: 'VALIDATION', sharpe: 1.6, returnPct: 6.1 },
    { label: 'Split A', range: 'May', role: 'TEST', sharpe: 1.1, returnPct: 3.4 },
    { label: 'Split B', range: 'Feb → Apr', role: 'TRAIN', sharpe: 2.4, returnPct: 16.8 },
    { label: 'Split B', range: 'May', role: 'VALIDATION', sharpe: 1.3, returnPct: 4.9 },
    { label: 'Split B', range: 'Jun', role: 'TEST', sharpe: 0.8, returnPct: 1.2 },
  ]
}

export function generateRobustness(): number[] {
  return Array.from({ length: 30 }, (_, index) => Math.round(180 + deterministicNoise(index, 7) * 250)).sort((left, right) => left - right)
}
