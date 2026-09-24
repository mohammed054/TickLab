import { AlertCenter } from '../shared/AlertCenter'
import { useMarketRuntime } from '../../state/appStore'
import { MockTag } from '../shared/MockBanner'
import { StatusDot } from '../shared/Panel'

export interface HeaderProps {
  symbol: string
  exchange: string
  price: number
  changePct: number
  bid: number
  ask: number
  high24h: number
  low24h: number
  volume24hUsd: number
  latencyMs: number | null
  environment: 'RESEARCH' | 'PAPER' | 'LIVE'
  replayActive?: boolean
  previewTimestampNs?: string | null
}

export function Header({ symbol, exchange, price, changePct, bid, ask, high24h, low24h, volume24hUsd, latencyMs, environment, replayActive = false, previewTimestampNs = null }: HeaderProps) {
  const runtime = useMarketRuntime()
  const now = new Date(Number(runtime.logicalTimeNs) / 1_000_000)
  const previewTime = previewTimestampNs ? new Date(Number(BigInt(previewTimestampNs) / 1_000_000n)).toISOString().slice(11, 19) : null
  const spread = +(ask - bid).toFixed(1)
  const volume = volume24hUsd >= 1_000_000_000 ? `${(volume24hUsd / 1_000_000_000).toFixed(1)}B` : `${(volume24hUsd / 1_000_000).toFixed(1)}M`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '8px 14px', background: 'var(--color-bg-panel)', borderBottom: '1px solid var(--color-border-subtle)', flex: '0 0 auto', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: '0 0 auto' }}><strong style={{ fontSize: 15 }}>{symbol}</strong><span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>${price.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span><span className={`mono ${changePct >= 0 ? 'pos' : 'neg'}`}>{changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%</span><MockTag /></div>
      <div className="mono dim" style={{ display: 'flex', gap: 14, fontSize: 11.5, whiteSpace: 'nowrap' }}><span>BID <span className="pos">{bid.toFixed(1)}</span></span><span>ASK <span className="neg">{ask.toFixed(1)}</span></span><span>SPREAD {spread} <span className="dim">(1 tick)</span></span><span>24H HIGH {high24h.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span><span>24H LOW {low24h.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span><span>24H VOL ${volume}</span></div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }} className="mono dim"><span style={{ color: environment === 'LIVE' ? 'var(--color-warning)' : 'var(--color-text-secondary)', fontWeight: 700 }}>{environment}</span>{replayActive && <span style={{ color: 'var(--color-info)', fontWeight: 700 }}>REPLAY PROJECTION</span>}{previewTime && <span style={{ color: 'var(--color-warning)' }} title="Preview timestamp; click a candle to commit">PREVIEW {previewTime}</span>}<span><StatusDot state="warn" /> MARKET DATA (SIMULATED)</span><span><StatusDot state="off" /> EXCHANGE (NOT CONNECTED)</span><span>LATENCY {latencyMs === null ? '—' : `${latencyMs.toFixed(1)}ms`}</span><span>UTC {now.toISOString().slice(11, 23)}</span></div>
      <AlertCenter />
    </div>
  )
}
