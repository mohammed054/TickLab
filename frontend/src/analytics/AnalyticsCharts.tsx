import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import type { SeriesPoint } from './analyticsTypes'
import { timestampNsToMs } from '../contracts'

export const chartHeight = 190

export function formatMoney(value: number, digits = 2): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`
}

export function formatTimestamp(timestampNs: string): string {
  try {
    return new Date(timestampNsToMs(timestampNs)).toISOString().replace('T', ' ').replace('Z', '')
  } catch {
    return timestampNs
  }
}

export function valueClass(value: number): string {
  return value > 0 ? 'pos' : value < 0 ? 'neg' : 'dim'
}

export const chartSurface: CSSProperties = {
  width: '100%',
  minHeight: chartHeight,
  background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-sm)',
  overflow: 'hidden',
}

export const chartCaption: CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: 'var(--font-size-xs)',
  margin: '6px 0 0',
}

export const compactButton: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  padding: '4px 8px',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-bg-control)',
  color: 'var(--color-text-primary)',
}

export const quietButton: CSSProperties = {
  ...compactButton,
  background: 'transparent',
  color: 'var(--color-text-muted)',
}

function chartBounds(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 }
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = Math.max((maxValue - minValue) * 0.12, 0.01)
  return { min: minValue - padding, max: maxValue + padding }
}

function pathForPoints(points: readonly SeriesPoint[], width: number, height: number, bounds: { min: number; max: number }): string {
  if (points.length === 0) return ''
  return points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width
    const y = height - ((point.value - bounds.min) / (bounds.max - bounds.min || 1)) * height
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function pointPosition(index: number, length: number, value: number, width: number, height: number, bounds: { min: number; max: number }): { x: number; y: number } {
  return {
    x: length === 1 ? width / 2 : (index / (length - 1)) * width,
    y: height - ((value - bounds.min) / (bounds.max - bounds.min || 1)) * height,
  }
}

export interface LineChartProps {
  points: readonly SeriesPoint[]
  color?: string
  height?: number
  zeroLine?: boolean
  formatValue?: (value: number) => string
  onPointClick?: (point: SeriesPoint) => void
  selectedTimestampNs?: string | null
  ariaLabel: string
}

export function LineChart({ points, color = 'var(--color-info)', height = chartHeight, zeroLine = false, formatValue = (value) => formatNumber(value), onPointClick, selectedTimestampNs, ariaLabel }: LineChartProps) {
  const width = 640
  const paddingTop = 14
  const paddingBottom = 22
  const plotHeight = height - paddingTop - paddingBottom
  const bounds = chartBounds(points.map((point) => point.value))
  const path = pathForPoints(points, width, plotHeight, bounds)
  const zeroY = zeroLine ? paddingTop + plotHeight - ((0 - bounds.min) / (bounds.max - bounds.min || 1)) * plotHeight : null
  return (
    <div style={chartSurface}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {[0, 0.5, 1].map((fraction) => {
          const y = paddingTop + plotHeight * fraction
          return <line key={fraction} x1="0" x2={width} y1={y} y2={y} stroke="var(--color-border-subtle)" strokeWidth="1" opacity="0.55" />
        })}
        {zeroY !== null && <line x1="0" x2={width} y1={zeroY} y2={zeroY} stroke="var(--color-text-muted)" strokeDasharray="3 4" strokeWidth="1" />}
        <path d={path} transform={`translate(0 ${paddingTop})`} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {points.map((point, index) => {
          const position = pointPosition(index, points.length, point.value, width, plotHeight, bounds)
          const x = position.x
          const y = position.y + paddingTop
          const label = `${formatTimestamp(point.timestampNs)}: ${formatValue(point.value)}`
          const selected = point.timestampNs === selectedTimestampNs
          if (!onPointClick) return <circle key={point.timestampNs + index} cx={x} cy={y} r={selected ? 4 : 2.2} fill={selected ? 'var(--color-warning)' : color}><title>{label}</title></circle>
          return (
            <circle
              key={point.timestampNs + index}
              cx={x}
              cy={y}
              r={selected ? 4.5 : 3}
              fill={selected ? 'var(--color-warning)' : color}
              stroke="var(--color-bg-base)"
              strokeWidth="1"
              tabIndex={0}
              role="button"
              aria-label={label}
              onClick={() => onPointClick(point)}
              onKeyDown={(event: KeyboardEvent<SVGCircleElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onPointClick(point)
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <title>{label}</title>
            </circle>
          )
        })}
        <text x="4" y={height - 5} fill="var(--color-text-muted)" fontSize="10">{points[0] ? formatTimestamp(points[0].timestampNs) : '—'}</text>
        <text x={width - 4} y={height - 5} textAnchor="end" fill="var(--color-text-muted)" fontSize="10">{points.length > 1 ? formatTimestamp(points[points.length - 1].timestampNs) : '—'}</text>
      </svg>
    </div>
  )
}

export interface MultiLineSeries {
  id: string
  label: string
  color: string
  points: readonly SeriesPoint[]
}

export function MultiLineChart({ series, height = chartHeight, ariaLabel }: { series: readonly MultiLineSeries[]; height?: number; ariaLabel: string }) {
  const width = 640
  const paddingTop = 14
  const paddingBottom = 22
  const plotHeight = height - paddingTop - paddingBottom
  const values = series.flatMap((item) => item.points.map((point) => point.value))
  const bounds = chartBounds(values)
  return (
    <div style={chartSurface}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {[0, 0.5, 1].map((fraction) => {
          const y = paddingTop + plotHeight * fraction
          return <line key={fraction} x1="0" x2={width} y1={y} y2={y} stroke="var(--color-border-subtle)" strokeWidth="1" opacity="0.55" />
        })}
        {series.map((item) => <path key={item.id} d={pathForPoints(item.points, width, plotHeight, bounds)} transform={`translate(0 ${paddingTop})`} fill="none" stroke={item.color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />)}
        <text x="4" y={height - 5} fill="var(--color-text-muted)" fontSize="10">{series[0]?.points[0] ? formatTimestamp(series[0].points[0].timestampNs) : '—'}</text>
        <text x={width - 4} y={height - 5} textAnchor="end" fill="var(--color-text-muted)" fontSize="10">{series[0]?.points.length ? formatTimestamp(series[0].points[series[0].points.length - 1].timestampNs) : '—'}</text>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 8px 7px' }}>
        {series.map((item) => <span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}><span style={{ width: 10, height: 2, background: item.color }} />{item.label}</span>)}
      </div>
    </div>
  )
}

export interface BarDatum {
  id: string
  label: string
  value: number
  timestampNs?: string
  color?: string
}

export function BarChart({ bars, height = chartHeight, zeroLine = true, formatValue = (value) => formatNumber(value), onBarClick, ariaLabel }: { bars: readonly BarDatum[]; height?: number; zeroLine?: boolean; formatValue?: (value: number) => string; onBarClick?: (bar: BarDatum) => void; ariaLabel: string }) {
  const width = 640
  const paddingTop = 12
  const paddingBottom = 34
  const plotHeight = height - paddingTop - paddingBottom
  const bounds = chartBounds(bars.map((bar) => bar.value))
  const zeroY = paddingTop + plotHeight - ((0 - bounds.min) / (bounds.max - bounds.min || 1)) * plotHeight
  const slot = bars.length > 0 ? width / bars.length : width
  return (
    <div style={chartSurface}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {[0, 0.5, 1].map((fraction) => {
          const y = paddingTop + plotHeight * fraction
          return <line key={fraction} x1="0" x2={width} y1={y} y2={y} stroke="var(--color-border-subtle)" strokeWidth="1" opacity="0.55" />
        })}
        {zeroLine && <line x1="0" x2={width} y1={zeroY} y2={zeroY} stroke="var(--color-text-muted)" strokeWidth="1" />}
        {bars.map((bar, index) => {
          const valueY = paddingTop + plotHeight - ((bar.value - bounds.min) / (bounds.max - bounds.min || 1)) * plotHeight
          const y = Math.min(zeroY, valueY)
          const barHeight = Math.max(2, Math.abs(zeroY - valueY))
          const barWidth = Math.max(8, slot * 0.62)
          const x = index * slot + (slot - barWidth) / 2
          const fill = bar.color ?? (bar.value >= 0 ? 'var(--color-positive)' : 'var(--color-negative)')
          const label = `${bar.label}: ${formatValue(bar.value)}`
          if (!onBarClick) return <rect key={bar.id} x={x} y={y} width={barWidth} height={barHeight} fill={fill} rx="2"><title>{label}</title></rect>
          return <rect key={bar.id} x={x} y={y} width={barWidth} height={barHeight} fill={fill} rx="2" tabIndex={0} role="button" aria-label={label} onClick={() => onBarClick(bar)} onKeyDown={(event: KeyboardEvent<SVGRectElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onBarClick(bar) } }} style={{ cursor: 'pointer' }}><title>{label}</title></rect>
        })}
        {bars.map((bar, index) => <text key={`label-${bar.id}`} x={index * slot + slot / 2} y={height - 8} textAnchor="middle" fill="var(--color-text-muted)" fontSize="9">{bar.label.length > 15 ? `${bar.label.slice(0, 14)}…` : bar.label}</text>)}
      </svg>
    </div>
  )
}

export function Sparkline({ points, color = 'var(--color-info)', ariaLabel }: { points: readonly SeriesPoint[]; color?: string; ariaLabel: string }) {
  const width = 120
  const height = 30
  const bounds = chartBounds(points.map((point) => point.value))
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none" style={{ width: 120, height: 30, display: 'block' }}><path d={pathForPoints(points, width, height, bounds)} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>
}

export function ValueBar({ label, value, max, color, onClick, active = false }: { label: string; value: number; max: number; color?: string; onClick?: () => void; active?: boolean }) {
  const fill = color ?? (value >= 0 ? 'var(--color-positive)' : 'var(--color-negative)')
  const width = `${Math.min(100, Math.abs(value) / Math.max(max, 0.000001) * 100)}%`
  const content = (
    <>
      <span style={{ color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', minWidth: 112 }}>{label}</span>
      <span style={{ flex: 1, height: 8, background: 'var(--color-bg-control)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}><span style={{ display: 'block', width, height: '100%', background: fill, borderRadius: 'var(--radius-sm)' }} /></span>
      <span className={`mono ${valueClass(value)}`} style={{ minWidth: 72, textAlign: 'right' }}>{formatMoney(value)}</span>
    </>
  )
  if (onClick) return <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 0', border: 0, background: active ? 'var(--color-bg-control)' : 'transparent', color: 'inherit', textAlign: 'left', borderRadius: 'var(--radius-sm)' }}>{content}</button>
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>{content}</div>
}

export function TableCaption({ children }: { children: ReactNode }) {
  return <p style={{ ...chartCaption, marginBottom: 8 }}>{children}</p>
}
