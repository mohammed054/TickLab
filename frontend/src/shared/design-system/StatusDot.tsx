type Status = 'positive' | 'warning' | 'negative' | 'neutral'

const COLORS: Record<Status, string> = {
  positive: 'var(--color-positive)',
  warning: 'var(--color-warning)',
  negative: 'var(--color-negative)',
  neutral: 'var(--color-neutral)',
}

interface StatusDotProps {
  status: Status
  size?: number
}

export function StatusDot({ status, size = 8 }: StatusDotProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: COLORS[status],
        flexShrink: 0,
      }}
    />
  )
}
