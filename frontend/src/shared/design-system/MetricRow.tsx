interface MetricRowProps {
  label: string
  value: string | number
  color?: string
  sparkline?: React.ReactNode
}

export function MetricRow({ label, value, color, sparkline }: MetricRowProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {sparkline}
        <span className="num" style={{ fontSize: 'var(--font-size-xs)', color: color ?? 'var(--color-text-primary)', fontWeight: 500 }}>
          {value}
        </span>
      </div>
    </div>
  )
}
