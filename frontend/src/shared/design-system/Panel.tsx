import type { ReactNode } from 'react'

interface PanelProps {
  header?: ReactNode
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

export function Panel({ header, children, className, style }: PanelProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--color-bg-panel)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '4px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
      }}
    >
      {header && (
        <div
          style={{
            padding: '6px 10px',
            borderBottom: '1px solid var(--color-border-subtle)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
          }}
        >
          {header}
        </div>
      )}
      <div style={{ padding: '8px 10px', flex: 1, overflow: 'auto' }}>{children}</div>
    </div>
  )
}
