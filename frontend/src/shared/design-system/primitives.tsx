import { CSSProperties, KeyboardEvent, ReactNode, useId } from 'react'

export type StatusState = 'ok' | 'warn' | 'bad' | 'off'

const STATUS_COLOR: Record<StatusState, string> = {
  ok: 'var(--color-positive)',
  warn: 'var(--color-warning)',
  bad: 'var(--color-negative)',
  off: 'var(--color-text-disabled)',
}

export function Panel({
  title,
  children,
  right,
  style,
  bodyStyle,
  ariaLabel,
}: {
  title: string
  children: ReactNode
  right?: ReactNode
  style?: CSSProperties
  bodyStyle?: CSSProperties
  ariaLabel?: string
}) {
  return (
    <section
      aria-label={ariaLabel ?? title}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg-panel)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        minHeight: 0,
        boxShadow: 'var(--shadow-subtle)',
        ...style,
      }}
    >
      <PanelHeader title={title} right={right} />
      <div
        style={{
          padding: 'var(--space-2) var(--space-3)',
          overflow: 'auto',
          minHeight: 0,
          flex: '1 1 auto',
          background: 'var(--color-bg-panel)',
          ...bodyStyle,
        }}
      >
        {children}
      </div>
    </section>
  )
}

export function PanelHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-3)',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-raised)',
        flex: '0 0 auto',
        height: 28,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </span>
      </div>
      {right && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {right}
        </div>
      )}
    </header>
  )
}

export function StatusDot({ state, label, pulse }: { state: StatusState; label?: string; pulse?: boolean }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      title={label}
      className={pulse || state === 'ok' ? 'pulse-dot' : ''}
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: STATUS_COLOR[state],
        boxShadow: state === 'ok' ? '0 0 6px var(--color-positive-glow)' : undefined,
        flex: '0 0 auto',
      }}
    />
  )
}

export function MetricRow({
  label,
  value,
  valueClass,
  sparkline,
}: {
  label: string
  value: ReactNode
  valueClass?: string
  sparkline?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-2)',
        padding: '2.5px 0',
        borderBottom: '1px solid rgba(28, 36, 48, 0.4)',
        fontSize: 'var(--font-size-xs)',
      }}
    >
      <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {sparkline}
        <span className={`mono ${valueClass ?? ''}`} style={{ fontWeight: 500, color: valueClass ? undefined : 'var(--color-text-primary)' }}>
          {value}
        </span>
      </div>
    </div>
  )
}

export interface DataColumn<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  emptyState,
  ariaLabel,
}: {
  rows: T[]
  columns: DataColumn<T>[]
  rowKey: (row: T) => string
  emptyState?: ReactNode
  ariaLabel: string
}) {
  return (
    <div style={{ overflow: 'auto', minHeight: 0, width: '100%', height: '100%' }}>
      <table
        aria-label={ariaLabel}
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--font-size-xs)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <thead>
          <tr style={{ background: 'var(--color-bg-raised)' }}>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{
                  width: column.width,
                  textAlign: column.align ?? 'left',
                  color: 'var(--color-text-muted)',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-2xs)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  padding: '4px 8px',
                  position: 'sticky',
                  top: 0,
                  background: 'var(--color-bg-raised)',
                  zIndex: 2,
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: 'var(--space-5)',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                }}
              >
                {emptyState ?? 'No records available.'}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={rowKey(row)}
                style={{
                  borderBottom: '1px solid rgba(28, 36, 48, 0.35)',
                  background: idx % 2 === 1 ? 'rgba(20, 25, 34, 0.35)' : 'transparent',
                  transition: 'background 0.08s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(56, 189, 248, 0.06)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = idx % 2 === 1 ? 'rgba(20, 25, 34, 0.35)' : 'transparent'
                }}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={{
                      textAlign: column.align ?? 'left',
                      padding: '4px 8px',
                      verticalAlign: 'middle',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export interface TabItem<T extends string> {
  id: T
  label: string
  disabled?: boolean
  badge?: ReactNode
}

export function Tabs<T extends string>({
  items,
  activeId,
  onChange,
  ariaLabel,
}: {
  items: TabItem<T>[]
  activeId: T
  onChange: (id: T) => void
  ariaLabel: string
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (index + direction + items.length) % items.length
    const next = items[nextIndex]
    if (next && !next.disabled) onChange(next.id)
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        padding: '2px',
        background: 'var(--color-bg-base)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {items.map((item, index) => {
        const isActive = activeId === item.id
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            style={{
              fontSize: 'var(--font-size-xs)',
              padding: '3px 8px',
              borderRadius: 'var(--radius-xs)',
              background: isActive ? 'var(--color-bg-control)' : 'transparent',
              color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              fontWeight: isActive ? 600 : 400,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              opacity: item.disabled ? 0.45 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              border: isActive ? '1px solid var(--color-border-strong)' : '1px solid transparent',
            }}
          >
            <span>{item.label}</span>
            {item.badge}
          </button>
        )
      })}
    </div>
  )
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: readonly { value: T; label: string; disabled?: boolean }[]
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        gap: 1,
        background: 'var(--color-bg-base)',
        padding: 2,
        borderRadius: 'var(--radius-xs)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {options.map((option) => {
        const isActive = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            style={{
              fontSize: 'var(--font-size-2xs)',
              fontWeight: isActive ? 600 : 400,
              padding: '2px 6px',
              borderRadius: 'var(--radius-xs)',
              background: isActive ? 'var(--color-bg-control)' : 'transparent',
              color: isActive ? 'var(--color-focus)' : 'var(--color-text-muted)',
              cursor: option.disabled ? 'not-allowed' : 'pointer',
              opacity: option.disabled ? 0.45 : 1,
              border: isActive ? '1px solid var(--color-border-strong)' : '1px solid transparent',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  description,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  description?: string
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div style={{ marginBottom: 'var(--space-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', fontSize: 'var(--font-size-xs)', marginBottom: 2 }}>
        <label htmlFor={id} style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
        <span className="mono" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {value}{unit ?? ''}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={description ? `${id}-description` : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: '100%', height: 4, accentColor: 'var(--color-info)', background: 'var(--color-bg-control)', cursor: 'pointer' }}
      />
      {description && <div id={`${id}-description`} style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-2xs)', marginTop: 2 }}>{description}</div>}
    </div>
  )
}

export function NumericField({
  label,
  value,
  min,
  max,
  step,
  unit,
  description,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  unit?: string
  description?: string
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div style={{ marginBottom: 'var(--space-2)' }}>
      <label htmlFor={id} style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginBottom: 2 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          id={id}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          aria-describedby={description ? `${id}-description` : undefined}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mono"
          style={{
            width: '100%',
            minWidth: 0,
            background: 'var(--color-bg-base)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 6px',
            fontSize: 'var(--font-size-xs)',
          }}
        />
        {unit && <span className="dim mono" style={{ fontSize: 'var(--font-size-2xs)' }}>{unit}</span>}
      </div>
      {description && <div id={`${id}-description`} style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-2xs)', marginTop: 2 }}>{description}</div>}
    </div>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  description,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string; disabled?: boolean }[]
  onChange: (value: T) => void
  description?: string
}) {
  const id = useId()
  return (
    <div style={{ marginBottom: 'var(--space-2)' }}>
      <label htmlFor={id} style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginBottom: 2 }}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        aria-describedby={description ? `${id}-description` : undefined}
        onChange={(event) => onChange(event.target.value as T)}
        style={{
          width: '100%',
          background: 'var(--color-bg-base)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '4px 6px',
          fontSize: 'var(--font-size-xs)',
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {description && <div id={`${id}-description`} style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-2xs)', marginTop: 2 }}>{description}</div>}
    </div>
  )
}

export function PresetChips<T extends string>({
  values,
  selected,
  onSelect,
  ariaLabel,
}: {
  values: readonly { value: T; label: string }[]
  selected: T
  onSelect: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {values.map((item) => {
        const isActive = selected === item.value
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(item.value)}
            style={{
              fontSize: 'var(--font-size-2xs)',
              fontWeight: isActive ? 600 : 400,
              padding: '2px 7px',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid',
              borderColor: isActive ? 'var(--color-border-accent)' : 'var(--color-border-subtle)',
              background: isActive ? 'var(--color-bg-control-active)' : 'var(--color-bg-control)',
              color: isActive ? 'var(--color-focus)' : 'var(--color-text-secondary)',
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span title={label} aria-label={label} style={{ borderBottom: '1px dotted var(--color-border-strong)', cursor: 'help' }}>
      {children}
    </span>
  )
}

export function AttributionBadge({ kind }: { kind: 'human' | 'ai' }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 5px',
        borderRadius: 'var(--radius-xs)',
        border: `1px solid ${kind === 'ai' ? 'rgba(56, 189, 248, 0.4)' : 'var(--color-border-strong)'}`,
        background: kind === 'ai' ? 'var(--color-info-dim)' : 'var(--color-bg-raised)',
        color: kind === 'ai' ? 'var(--color-info)' : 'var(--color-text-secondary)',
        fontSize: 'var(--font-size-2xs)',
        fontWeight: 700,
        letterSpacing: '0.04em',
      }}
    >
      {kind === 'ai' ? 'AI MODEL' : 'MANUAL'}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div
      style={{
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: 'var(--space-5)',
        textAlign: 'center',
        color: 'var(--color-text-muted)',
      }}
    >
      <div aria-hidden="true" style={{ fontSize: 20, opacity: 0.6 }}>
        {icon ?? '⬡'}
      </div>
      <strong style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', letterSpacing: '0.04em' }}>
        {title}
      </strong>
      <span style={{ fontSize: 'var(--font-size-2xs)', maxWidth: 360, color: 'var(--color-text-secondary)' }}>
        {description}
      </span>
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  )
}

export function LoadingState({ label, progress }: { label: string; progress?: number }) {
  return (
    <div
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 'var(--space-4)',
        color: 'var(--color-text-primary)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-focus)' }}>
          {label}
        </span>
        {progress !== undefined && (
          <span className="mono" style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' }}>
            {progress.toFixed(0)}%
          </span>
        )}
      </div>
      {progress !== undefined && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          style={{
            height: 4,
            background: 'var(--color-bg-control)',
            borderRadius: 'var(--radius-xs)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--color-info), var(--color-positive))',
              transition: 'width 0.15s ease',
            }}
          />
        </div>
      )}
    </div>
  )
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: 'var(--space-3)',
        color: 'var(--color-negative)',
        border: '1px solid rgba(244, 63, 94, 0.3)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-negative-dim)',
      }}
    >
      <strong style={{ fontSize: 'var(--font-size-xs)' }}>{title}</strong>
      <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-2xs)' }}>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            alignSelf: 'flex-start',
            fontSize: 'var(--font-size-2xs)',
            padding: '3px 8px',
            color: 'var(--color-text-primary)',
            background: 'var(--color-bg-control)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-xs)',
            marginTop: 4,
          }}
        >
          Retry Action
        </button>
      )}
    </div>
  )
}
