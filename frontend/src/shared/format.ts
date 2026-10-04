/**
 * One formatting rule per unit. Every number on the Main Monitor goes through here,
 * so precision, separators and signs are identical everywhere.
 */
const MINUS = '\u2212'

function group(value: number, decimals: number): string {
  return Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function sign(value: number, decimals: number, showPlus: boolean): string {
  // Avoid "-0.00": decide the sign from the rounded value.
  const rounded = Number(value.toFixed(decimals))
  if (rounded < 0) return MINUS
  if (rounded > 0 && showPlus) return '+'
  return ''
}

/** Price in quote currency, 1 tick = 0.1: 112,432.5 */
export const fmtPrice = (value: number): string => `${sign(value, 1, false)}${group(value, 1)}`

/** Order / trade size in BTC, 3 decimals: 0.412 */
export const fmtSize = (value: number): string => group(value, 3)

/** Position or exposure in BTC, 4 decimals, explicit sign: +0.1840 */
export const fmtBtc = (value: number, showPlus = false): string => `${sign(value, 4, showPlus)}${group(value, 4)}`

/** Aggregated volume / depth in BTC, 2 decimals: 1,234.57 */
export const fmtVolume = (value: number): string => group(value, 2)

/** USD with cents: $1,234.56 / −$1,234.56 */
export const fmtUsd = (value: number, showPlus = false): string =>
  `${sign(value, 2, showPlus)}$${group(value, 2)}`

/** USD without cents, for large notionals: $192,700 */
export const fmtUsdWhole = (value: number): string => `${sign(value, 0, false)}$${group(value, 0)}`

/** Percentage with 2 decimals: +0.06% */
export const fmtPct = (value: number, showPlus = false): string =>
  `${sign(value, 2, showPlus)}${group(value, 2)}%`

/** Basis points with 2 decimals */
export const fmtBps = (value: number): string => `${group(value, 2)} bps`

/** Integer with thousands separators */
export const fmtInt = (value: number): string => group(Math.round(value), 0)

/** Milliseconds with 1 decimal */
export const fmtMs = (value: number): string => `${group(value, 1)} ms`

export function fmtClock(ms: number, withMillis = false): string {
  return new Date(ms).toISOString().slice(11, withMillis ? 23 : 19)
}

/** Colour class for signed values. Zero stays neutral. */
export const signClass = (value: number, decimals = 2): 'pos' | 'neg' | '' => {
  const rounded = Number(value.toFixed(decimals))
  return rounded > 0 ? 'pos' : rounded < 0 ? 'neg' : ''
}
