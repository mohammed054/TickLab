import { useEffect, useRef, useState } from 'react'

/** Exact props per docs/07-main-monitor-components.md §7.1. */
export interface GlobalHeaderProps {
  symbol: string
  exchange: string
  lastPrice: number
  changePct24h: number
  bid: number; ask: number; spreadAbs: number; spreadTicks: number
  high24h: number; low24h: number; volume24hUsd: number
  exchangeConnected: boolean
  marketDataConnected: boolean
  latencyMs: number | null    // null → render "—" per doc 14 §14.7, never fabricate
  environment: 'RESEARCH' | 'PAPER' | 'LIVE'
}

/**
 * Pinned top bar (docs/07 §7.1). Field order left→right follows the spec exactly.
 * Connection dots use exactly three states (docs/11 §11.1): green connected,
 * yellow connecting/degraded, red disconnected. Since the props carry booleans,
 * "connecting" is derived honestly: false + no numeric data ever received yet.
 */
export function GlobalHeader(props: GlobalHeaderProps) {
  const { symbol, exchange, environment } = props
  const [utcNow, setUtcNow] = useState(() => new Date())

  // Once any real number has arrived, a later `false` means disconnected (red),
  // not still-connecting (yellow).
  const hasEverHadData = useRef(false)
  if (Number.isFinite(props.lastPrice)) hasEverHadData.current = true

  useEffect(() => {
    const t = setInterval(() => setUtcNow(new Date()), 100)
    return () => clearInterval(t)
  }, [])

  const noDataYet = !hasEverHadData.current && !Number.isFinite(props.lastPrice)
  const exchDot = dotState(props.exchangeConnected, noDataYet)
  const dataDot = dotState(props.marketDataConnected, noDataYet)

  const change = props.changePct24h
  const changeColor = !Number.isFinite(change)
    ? 'var(--color-text-secondary)'
    : change >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  // §11.1: magnitude never changes color intensity — one flat red/green.

  return (
    <header
      className="global-header"
      style={{
        display: 'flex', alignItems: 'stretch', gap: 24,
        padding: '6px 16px', background: 'var(--color-bg-panel)',
        borderBottom: '1px solid var(--color-border-subtle)',
        fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)',
        minHeight: 56
      }}
    >
      {/* Left: symbol / last / 24h change */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', letterSpacing: 0.5 }}>{symbol}</span>
        <span className="num" style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>
          {fmtPrice(props.lastPrice)}
        </span>
        <span className="num" style={{ color: changeColor, fontWeight: 600 }}>
          {fmtSignedPct(change)}
        </span>
      </div>

      {/* Mid: quote + 24h stats */}
      <div className="num" style={{ display: 'flex', alignItems: 'center', gap: 18, color: 'var(--color-text-secondary)' }}>
        <span>BID <b style={val}>{fmtPrice(props.bid)}</b></span>
        <span>ASK <b style={val}>{fmtPrice(props.ask)}</b></span>
        <span>SPREAD <b style={val}>{fmtNum(props.spreadAbs)}</b> ({fmtTicks(props.spreadTicks)})</span>
        <span>24H HIGH <b style={val}>{fmtPrice(props.high24h)}</b></span>
        <span>24H LOW <b style={val}>{fmtPrice(props.low24h)}</b></span>
        <span>24H VOL <b style={val}>{fmtUsd(props.volume24hUsd)}</b></span>
      </div>

      {/* Right: connections, latency, clock, environment badge */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {exchange} <StatusDot state={exchDot} label="exchange connection" />
        </span>
        <span style={{ color: 'var(--color-text-secondary)' }}>
          MARKET DATA <StatusDot state={dataDot} label="market data connection" />
        </span>
        <span className="num" style={{ color: 'var(--color-text-secondary)' }}>
          LATENCY {props.latencyMs == null ? '—' : `${Math.round(props.latencyMs)}ms`}
        </span>
        <span className="num" style={{ color: 'var(--color-text-secondary)' }} title="UTC clock">
          UTC {formatUtc(utcNow)}
        </span>
        <EnvironmentBadge environment={environment} />
      </div>
    </header>
  )
}

const val: React.CSSProperties = { color: 'var(--color-text-primary)', fontWeight: 600 }

type DotState = 'ok' | 'degraded' | 'down'

function dotState(connected: boolean, noDataYet: boolean): DotState {
  if (connected) return 'ok'
  return noDataYet ? 'degraded' : 'down'
}

/** Three-state connection dot, always paired with a text label (docs/11 §11.1). */
export function StatusDot({ state, label }: { state: DotState; label: string }) {
  const color = state === 'ok' ? 'var(--color-positive)' : state === 'degraded' ? 'var(--color-warning)' : 'var(--color-negative)'
  const text = state === 'ok' ? 'connected' : state === 'degraded' ? 'connecting' : 'disconnected'
  return (
    <span title={`${label}: ${text}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: color
      }} />
      <span className="num" style={{ fontSize: 'var(--font-size-xs)', color }}>{text}</span>
    </span>
  )
}

/**
 * Environment badge (docs/12 §12.1): always visible, never abbreviated, distinct
 * unmissable styling per environment — LIVE gets the semantic warning tint.
 */
export function EnvironmentBadge({ environment }: { environment: GlobalHeaderProps['environment'] }) {
  const live = environment === 'LIVE'
  return (
    <span
      title={`Environment: ${environment}`}
      style={{
        fontWeight: 800, letterSpacing: 1, fontSize: 'var(--font-size-sm)',
        padding: '4px 12px', borderRadius: 4,
        color: live ? '#1a1a1a' : environment === 'PAPER' ? 'var(--color-warning)' : 'var(--color-positive)',
        background: live ? 'var(--color-warning)' : 'transparent',
        border: `1px solid ${live ? 'var(--color-warning)' : 'currentColor'}`
      }}
    >
      {environment}
    </span>
  )
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  const digits = abs >= 1000 ? 1 : abs >= 100 ? 2 : abs >= 1 ? 3 : 5
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function fmtTicks(spreadTicks: number): string {
  if (!Number.isFinite(spreadTicks)) return '— TICKS'
  const n = Math.round(spreadTicks)
  return `${n} TICK${n === 1 ? '' : 'S'}`
}

function fmtSignedPct(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}

function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

function formatUtc(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`
}
