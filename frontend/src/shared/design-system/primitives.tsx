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
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        minHeight: 0,
        ...style,
      }}
    >
      <PanelHeader title={title} right={right} />
      <div style={{ padding: 'var(--space-3)', overflow: 'auto', minHeight: 0, flex: '1 1 auto', ...bodyStyle }}>{children}</div>
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
        padding: 'var(--space-2) var(--space-3)',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-raised)',
        flex: '0 0 auto',
        minHeight: 30,
      }}
    >
      <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.03em' }}>{title}</span>
      {right}
    </header>
  )
}

export function StatusDot({ state, label }: { state: StatusState; label?: string }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: STATUS_COLOR[state],
        flex: '0 0 auto',
      }}
    />
  )
}

export function MetricRow({ label, value, valueClass }: { label: string; value: ReactNode; valueClass?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', padding: '2px 0' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span className={`mono ${valueClass ?? ''}`}>{value}</span>
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
    <div style={{ overflow: 'auto', minHeight: 0 }}>
      <table aria-label={ariaLabel} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{
                  width: column.width,
                  textAlign: column.align ?? 'left',
                  color: 'var(--color-text-muted)',
                  fontWeight: 500,
                  borderBottom: '1px solid var(--color-border-subtle)',
                  padding: '5px 7px',
                  position: 'sticky',
                  top: 0,
                  background: 'var(--color-bg-panel)',
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
              <td colSpan={columns.length} style={{ padding: 'var(--space-5)', color: 'var(--color-text-muted)' }}>
                {emptyState ?? 'No records available.'}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={{ textAlign: column.align ?? 'left', padding: '5px 7px', verticalAlign: 'top' }}
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
    <div role="tablist" aria-label={ariaLabel} style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {items.map((item, index) => (
        <button
          key={item.id}
          role="tab"
          type="button"
          aria-selected={activeId === item.id}
          tabIndex={activeId === item.id ? 0 : -1}
          disabled={item.disabled}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border-subtle)',
            background: activeId === item.id ? 'var(--color-bg-control)' : 'transparent',
            color: activeId === item.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            fontWeight: activeId === item.id ? 600 : 400,
            cursor: item.disabled ? 'not-allowed' : 'pointer',
            opacity: item.disabled ? 0.45 : 1,
          }}
        >
          {item.label}
        </button>
      ))}
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
    <div role="group" aria-label={ariaLabel} style={{ display: 'inline-flex', gap: 2 }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          style={{
            fontSize: 'var(--font-size-xs)',
            padding: '3px 7px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border-subtle)',
            background: value === option.value ? 'var(--color-bg-control)' : 'transparent',
            color: value === option.value ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            cursor: option.disabled ? 'not-allowed' : 'pointer',
            opacity: option.disabled ? 0.45 : 1,
          }}
        >
          {option.label}
        </button>
      ))}
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
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
        <label htmlFor={id} style={{ color: 'var(--color-text-muted)' }}>{label}</label>
        <span className="mono">{value}{unit ?? ''}</span>
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
        style={{ width: '100%', accentColor: 'var(--color-info)' }}
      />
      {description && <div id={`${id}-description`} style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--font-size-xs)' }}>{description}</div>}
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
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <label htmlFor={id} style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: 3 }}>{label}</label>
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
          style={{ width: '100%', minWidth: 0, background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 5 }}
        />
        {unit && <span className="dim mono" style={{ fontSize: 'var(--font-size-xs)' }}>{unit}</span>}
      </div>
      {description && <div id={`${id}-description`} style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--font-size-xs)', marginTop: 3 }}>{description}</div>}
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
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <label htmlFor={id} style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: 3 }}>{label}</label>
      <select
        id={id}
        value={value}
        aria-describedby={description ? `${id}-description` : undefined}
        onChange={(event) => onChange(event.target.value as T)}
        style={{ width: '100%', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 5 }}
      >
        {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
      {description && <div id={`${id}-description`} style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--font-size-xs)', marginTop: 3 }}>{description}</div>}
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
      {values.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={selected === item.value}
          onClick={() => onSelect(item.value)}
          style={{ fontSize: 'var(--font-size-xs)', padding: '3px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: selected === item.value ? 'var(--color-bg-control)' : 'transparent', color: selected === item.value ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span title={label} aria-label={label} style={{ borderBottom: '1px dotted var(--color-text-disabled)' }}>{children}</span>
}

export function AttributionBadge({ kind }: { kind: 'human' | 'ai' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 5px', borderRadius: 'var(--radius-sm)', border: `1px solid ${kind === 'ai' ? 'var(--color-info)' : 'var(--color-border-strong)'}`, color: kind === 'ai' ? 'var(--color-info)' : 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
      {kind === 'ai' ? 'AI' : 'HUMAN'}
    </span>
  )
}

export function EmptyState({ icon, title, description, action }: { icon?: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div style={{ minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
      <div aria-hidden="true" style={{ fontSize: 22 }}>{icon ?? '—'}</div>
      <strong style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{title}</strong>
      <span style={{ fontSize: 'var(--font-size-xs)', maxWidth: 360 }}>{description}</span>
      {action}
    </div>
  )
}

export function LoadingState({ label, progress }: { label: string; progress?: number }) {
  return (
    <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>
      <span className="mono" style={{ fontSize: 'var(--font-size-sm)' }}>{label}</span>
      {progress !== undefined && <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} style={{ height: 6, background: 'var(--color-bg-control)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, Math.max(0, progress))}%`, height: '100%', background: 'var(--color-info)' }} /></div>}
    </div>
  )
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 'var(--space-4)', color: 'var(--color-negative)', border: '1px solid var(--color-negative-dim)', borderRadius: 'var(--radius-sm)', background: 'rgba(239,91,91,0.06)' }}>
      <strong style={{ fontSize: 'var(--font-size-sm)' }}>{title}</strong>
      <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>{message}</span>
      {onRetry && <button type="button" onClick={onRetry} style={{ alignSelf: 'flex-start', fontSize: 'var(--font-size-xs)', padding: '4px 8px', color: 'var(--color-text-primary)', background: 'var(--color-bg-control)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>Retry</button>}
    </div>
  )
}
