import { ReactNode } from 'react'

export function Panel({
  title,
  children,
  right,
  style,
  bodyStyle,
}: {
  title: string
  children: ReactNode
  right?: ReactNode
  style?: React.CSSProperties
  bodyStyle?: React.CSSProperties
}) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        minHeight: 0,
        ...style,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderBottom: '1px solid var(--border-1)',
          background: 'var(--bg-2)',
          flex: '0 0 auto',
        }}
      >
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '0.03em' }}>
          {title}
        </span>
        {right}
      </header>
      <div style={{ padding: 8, overflow: 'auto', minHeight: 0, flex: '1 1 auto', ...bodyStyle }}>{children}</div>
    </section>
  )
}

export function StatusDot({ state }: { state: 'ok' | 'warn' | 'bad' | 'off' }) {
  const color = { ok: 'var(--pos)', warn: 'var(--warn)', bad: 'var(--neg)', off: 'var(--text-3)' }[state]
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        boxShadow: state !== 'off' ? `0 0 5px ${color}` : 'none',
      }}
    />
  )
}

export function MetricRow({ label, value, valueClass }: { label: string; value: ReactNode; valueClass?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span className="dim">{label}</span>
      <span className={`mono ${valueClass ?? ''}`}>{value}</span>
    </div>
  )
}
