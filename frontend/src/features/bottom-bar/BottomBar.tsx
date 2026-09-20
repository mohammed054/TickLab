interface BottomBarProps {
  positionQty: number
  realizedPnl: number
  unrealizedPnl: number
  fees: number
  netPnl: number
  orderCount: number
  fillCount: number
  latencyMs: number | null
  dataConnected: boolean
  engineConnected: boolean
  riskOk: boolean
}

function fmtPnl(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}$${Math.abs(v).toFixed(2)}`
}

function pnlColor(v: number): string {
  if (v > 0) return 'var(--color-positive)'
  if (v < 0) return 'var(--color-negative)'
  return 'var(--color-text-secondary)'
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: ok ? 'var(--color-positive)' : 'var(--color-negative)',
      }}
    />
  )
}

export function BottomBar({
  positionQty,
  realizedPnl,
  unrealizedPnl,
  fees,
  netPnl,
  orderCount,
  fillCount,
  latencyMs,
  dataConnected,
  engineConnected,
  riskOk,
}: BottomBarProps) {
  const item = (label: string, value: string, color?: string) => (
    <span>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label} </span>
      <span className="num" style={{ color: color ?? 'var(--color-text-primary)' }}>{value}</span>
    </span>
  )

  return (
    <footer
      style={{
        padding: '4px 16px',
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-panel)',
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        fontSize: 'var(--font-size-xs)',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {item('POSITION', `${positionQty} BTC`)}
      {item('REALIZED', fmtPnl(realizedPnl), pnlColor(realizedPnl))}
      {item('UNREALIZED', fmtPnl(unrealizedPnl), pnlColor(unrealizedPnl))}
      {item('FEES', `-$${Math.abs(fees).toFixed(2)}`)}
      {item('NET', fmtPnl(netPnl), pnlColor(netPnl))}
      <span style={{ borderLeft: '1px solid var(--color-border-subtle)', height: '12px' }} />
      {item('ORDERS', String(orderCount))}
      {item('FILLS', String(fillCount))}
      {item('LATENCY', latencyMs != null ? `${latencyMs}ms` : '—')}
      <span style={{ borderLeft: '1px solid var(--color-border-subtle)', height: '12px' }} />
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>DATA </span><Dot ok={dataConnected} />
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>ENGINE </span><Dot ok={engineConnected} />
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>RISK </span><Dot ok={riskOk} />
      </span>
    </footer>
  )
}
