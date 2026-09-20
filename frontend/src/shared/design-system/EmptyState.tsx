interface EmptyStateProps {
  message: string
  actions?: Array<{ label: string; onClick: () => void }>
}

export function EmptyState({ message, actions }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '24px 16px',
        color: 'var(--color-text-secondary)',
        fontSize: 'var(--font-size-sm)',
        textAlign: 'center',
        height: '100%',
      }}
    >
      <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 500 }}>{message}</span>
      {actions && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              style={{
                padding: '4px 12px',
                background: 'var(--color-bg-base)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '4px',
                color: 'var(--color-info)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
