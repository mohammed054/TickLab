import { ReactNode } from 'react'
import type { RiskLevel } from '../../shared/risk'

export function MMPanel({
  title,
  right,
  children,
  flush = false,
  label,
}: {
  title: string
  right?: ReactNode
  children: ReactNode
  flush?: boolean
  label?: string
}) {
  return (
    <section className="mm-panel" aria-label={label ?? title}>
      <header className="mm-panel-head">
        <span className="mm-panel-title">{title}</span>
        {right !== undefined && <span className="mm-panel-right">{right}</span>}
      </header>
      <div className={`mm-panel-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  )
}

/** A label/value row. `tone` colours the value only when the value itself carries meaning. */
export function Row({
  label,
  value,
  tone,
  strong,
  title,
}: {
  label: string
  value: ReactNode
  tone?: 'pos' | 'neg' | 'warn' | ''
  strong?: boolean
  title?: string
}) {
  return (
    <div className={`mm-row${strong ? ' strong' : ''}`} title={title}>
      <span className="l">{label}</span>
      <span className={`v num ${tone ?? ''}`}>{value}</span>
    </div>
  )
}

export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  label,
  isDisabled,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  label: string
  isDisabled?: (value: T) => boolean
}) {
  return (
    <div className="mm-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          disabled={isDisabled?.(option.value) ?? false}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function UsageBar({ usage, level }: { usage: number; level: RiskLevel }) {
  const width = Math.max(0, Math.min(1, usage)) * 100
  return (
    <span className={`mm-bar ${level === 'ok' ? '' : level}`} aria-hidden>
      <i style={{ width: `${width}%` }} />
    </span>
  )
}

export function Dot({ state }: { state: 'ok' | 'warn' | 'bad' | 'off' }) {
  return <span className={`mm-dot ${state === 'off' ? '' : state}`} aria-hidden />
}
