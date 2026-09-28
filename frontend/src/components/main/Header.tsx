import { AlertCenter } from '../shared/AlertCenter'
import { useMarketRuntime } from '../../state/appStore'
import { StatusDot } from '../../shared/design-system/primitives'

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

export function Header({
  symbol,
  exchange,
  price,
  changePct,
  bid,
  ask,
  high24h,
  low24h,
  volume24hUsd,
  latencyMs,
  environment,
  replayActive = false,
  previewTimestampNs = null,
}: HeaderProps) {
  const runtime = useMarketRuntime()
  const now = new Date(Number(runtime.logicalTimeNs) / 1_000_000)
  const previewTime = previewTimestampNs
    ? new Date(Number(BigInt(previewTimestampNs) / 1_000_000n)).toISOString().slice(11, 19)
    : null
  const spread = +(ask - bid).toFixed(1)
  const volume =
    volume24hUsd >= 1_000_000_000
      ? `${(volume24hUsd / 1_000_000_000).toFixed(2)}B`
      : `${(volume24hUsd / 1_000_000).toFixed(1)}M`

  const envColor =
    environment === 'LIVE'
      ? 'var(--color-warning)'
      : environment === 'PAPER'
      ? 'var(--color-info)'
      : 'var(--color-positive)'

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 14px',
        background: 'var(--color-bg-panel)',
        borderBottom: '1px solid var(--color-border-subtle)',
        flexShrink: 0,
        height: 42,
        overflow: 'hidden',
      }}
    >
      {/* Left: Symbol, Price, 24h Delta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              padding: '2px 6px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--color-bg-raised)',
              border: '1px solid var(--color-border-strong)',
              fontSize: 'var(--font-size-2xs)',
              fontWeight: 700,
              color: 'var(--color-focus)',
              letterSpacing: '0.04em',
            }}
          >
            {exchange.toUpperCase()}
          </div>
          <strong style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--color-text-primary)' }}>
            {symbol}
          </strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            className="mono"
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: changePct >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
              letterSpacing: '-0.02em',
            }}
          >
            ${price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </span>
          <span
            className={`mono ${changePct >= 0 ? 'pos' : 'neg'}`}
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: 'var(--radius-xs)',
              background: changePct >= 0 ? 'var(--color-positive-dim)' : 'var(--color-negative-dim)',
            }}
          >
            {changePct >= 0 ? '+' : ''}
            {changePct.toFixed(2)}%
          </span>
        </div>

        <div
          className="mono"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 'var(--font-size-xs)',
            paddingLeft: 8,
            borderLeft: '1px solid var(--color-border-subtle)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <span>
            <span style={{ color: 'var(--color-text-muted)' }}>BID </span>
            <span className="pos" style={{ fontWeight: 600 }}>{bid.toFixed(1)}</span>
          </span>
          <span>
            <span style={{ color: 'var(--color-text-muted)' }}>ASK </span>
            <span className="neg" style={{ fontWeight: 600 }}>{ask.toFixed(1)}</span>
          </span>
          <span>
            <span style={{ color: 'var(--color-text-muted)' }}>SPD </span>
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{spread}</span>
          </span>
          <span>
            <span style={{ color: 'var(--color-text-muted)' }}>24H H </span>
            <span style={{ color: 'var(--color-text-primary)' }}>{high24h.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
          </span>
          <span>
            <span style={{ color: 'var(--color-text-muted)' }}>24H L </span>
            <span style={{ color: 'var(--color-text-primary)' }}>{low24h.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
          </span>
          <span>
            <span style={{ color: 'var(--color-text-muted)' }}>24H VOL </span>
            <span style={{ color: 'var(--color-text-primary)' }}>${volume}</span>
          </span>
        </div>
      </div>

      {/* Right: Environment, Replay state, Telemetry, UTC clock, Alert Center */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 7px',
            borderRadius: 'var(--radius-xs)',
            border: `1px solid ${envColor}`,
            background: 'var(--color-bg-raised)',
            fontSize: 'var(--font-size-2xs)',
            fontWeight: 700,
            color: envColor,
          }}
        >
          <StatusDot state={environment === 'LIVE' ? 'warn' : 'ok'} pulse={environment === 'LIVE'} />
          <span>{environment} MODE</span>
        </div>

        {replayActive && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 7px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--color-info-dim)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: 'var(--color-info)',
              fontSize: 'var(--font-size-2xs)',
              fontWeight: 700,
            }}
          >
            <span>▶ REPLAY PROJECTION</span>
          </div>
        )}

        {previewTime && (
          <div
            style={{
              padding: '2px 7px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--color-warning-dim)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: 'var(--color-warning)',
              fontSize: 'var(--font-size-2xs)',
              fontWeight: 600,
            }}
            title="Preview timestamp active"
          >
            PREVIEW {previewTime}
          </div>
        )}

        <div
          className="mono"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 'var(--font-size-2xs)',
            color: 'var(--color-text-muted)',
            paddingLeft: 8,
            borderLeft: '1px solid var(--color-border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot state="ok" pulse />
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>FEED OK</span>
          </div>
          <span>
            LATENCY{' '}
            <span style={{ color: latencyMs !== null && latencyMs > 5 ? 'var(--color-warning)' : 'var(--color-positive)', fontWeight: 600 }}>
              {latencyMs === null ? '0.4ms' : `${latencyMs.toFixed(1)}ms`}
            </span>
          </span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            UTC {now.toISOString().slice(11, 23)}
          </span>
        </div>

        <AlertCenter />
      </div>
    </header>
  )
}
