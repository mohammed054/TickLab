import { timestampNsToMs } from '../../contracts'
import type { RuntimeSnapshot } from '../../contracts'
import type { Environment } from '../../contracts'
import { fmtClock, fmtPct, fmtPrice, fmtVolume } from '../../shared/format'
import { AlertCenter } from '../shared/AlertCenter'

export function Header({
  runtime,
  environment,
  replayAt,
}: {
  runtime: RuntimeSnapshot
  environment: Environment
  replayAt: string | null
}) {
  const candles = runtime.candles
  const last = candles[candles.length - 1]
  const prev = candles[candles.length - 2]
  const direction = last && prev ? Math.sign(last.close - prev.close) : 0
  const changeAbs = (last?.close ?? runtime.sessionOpen) - runtime.sessionOpen
  const changeTone = changeAbs > 0 ? 'pos' : changeAbs < 0 ? 'neg' : ''

  return (
    <header className="mm-top">
      <div className="mm-top-group">
        <span>
          <span className="mm-symbol">{runtime.symbol}</span>
          <span className="mm-venue">Binance Futures · Perp</span>
        </span>
        <span className={`mm-last num ${direction > 0 ? 'pos' : direction < 0 ? 'neg' : ''}`}>{fmtPrice(last?.close ?? 0)}</span>
        <span className={`num ${changeTone}`} title="Change since session start">
          {changeAbs >= 0 ? '+' : '\u2212'}
          {fmtPrice(Math.abs(changeAbs))} ({fmtPct(runtime.changePctSession, true)})
        </span>
        <span className="mm-stat" title="Session = since the simulation started, not a rolling 24h window">
          <span className="k">Sess High</span>
          <span className="num">{fmtPrice(runtime.highSession)}</span>
        </span>
        <span className="mm-stat">
          <span className="k">Low</span>
          <span className="num">{fmtPrice(runtime.lowSession)}</span>
        </span>
        <span className="mm-stat">
          <span className="k">Vol</span>
          <span className="num">{fmtVolume(runtime.volumeSessionBtc)} BTC</span>
        </span>
      </div>

      <div className="mm-top-group" style={{ alignItems: 'center', gap: 10 }}>
        {replayAt && <span className="mm-chip sel">Replay {fmtClock(timestampNsToMs(replayAt))}</span>}
        <span className="mm-chip" title="Execution environment">{environment}</span>
        <span className="num muted" title="Simulation clock (UTC)">{fmtClock(timestampNsToMs(runtime.logicalTimeNs))}</span>
        <AlertCenter />
      </div>
    </header>
  )
}
