import { MockRuntime, RISK_LIMITS } from '../src/mock/runtime/runtime'
const rt = new MockRuntime()
let bad: string[] = []
const check = (cond: boolean, msg: string) => { if (!cond) bad.push(msg) }
for (let i = 0; i < 4000; i++) {
  if (i > 0) rt.advanceTick()
  const s = rt.getSnapshot()
  const st = s.strategy, b = s.orderBook
  const last = s.candles[s.candles.length - 1]
  check(st.orders === st.fills + st.cancelled + st.rejected + st.openOrders, `orders invariant @${i}`)
  check(Math.abs(b.spread - (b.asks[0].price - b.bids[0].price)) < 1e-6, `spread @${i}`)
  check(b.asks[0].price > b.bids[0].price, `crossed @${i}`)
  check(Math.abs(b.mid - (b.asks[0].price + b.bids[0].price) / 2) < 1e-6, `mid @${i}`)
  for (let k = 1; k < b.bids.length; k++) check(b.bids[k].cumulativeDepth > b.bids[k-1].cumulativeDepth && b.asks[k].cumulativeDepth > b.asks[k-1].cumulativeDepth, `cum depth @${i}`)
  check(last.high >= Math.max(last.open, last.close) && last.low <= Math.min(last.open, last.close), `ohlc @${i}`)
  check(Math.abs(st.netPnl - (st.realizedPnl + st.unrealizedPnl + st.fees)) < 1e-6, `net @${i}`)
  check(Math.abs(st.inventory) <= RISK_LIMITS.maxPosition + 1e-9, `pos limit @${i}`)
  const t0 = s.trades[0]
  check(Math.abs(t0.price - last.close) < 1e-6, `tape top vs close @${i}`)
  check(s.trades.every((t, k) => k === 0 || BigInt(s.trades[k-1].timestampNs) >= BigInt(t.timestampNs)), `tape order @${i}`)
}
const s = rt.getSnapshot()
// candle contiguity
const gaps = s.candles.slice(1).filter((c, k) => BigInt(c.timestampNs) - BigInt(s.candles[k].timestampNs) !== 1_000_000_000n).length
// candle volume vs trades in the last candle
const lastTs = BigInt(s.candles[s.candles.length-1].timestampNs)
const vol = s.trades.filter(t => BigInt(t.timestampNs) >= lastTs && BigInt(t.timestampNs) < lastTs + 1_000_000_000n).reduce((a,t)=>a+t.size,0)
console.log('violations:', bad.length, bad.slice(0, 5))
console.log('candle gaps:', gaps, '| last candle vol', s.candles[s.candles.length-1].volume, 'vs trades', vol.toFixed(3))
console.log('strategy', { ...s.strategy, fillRate: s.strategy.fillRate.toFixed(1) })
console.log('fills', s.fills.length, 'session', s.highSession, s.lowSession, s.volumeSessionBtc.toFixed(1), 'BTC', 'chg%', s.changePctSession.toFixed(3))
console.log('lat', s.latencyP50Ms, s.latencyP99Ms, 'rate', s.orderRatePerSec)
if (bad.length) process.exit(1)
