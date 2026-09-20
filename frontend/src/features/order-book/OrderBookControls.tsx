import type { DepthLevel, PriceAggregation, BookMode } from './types'

interface OrderBookControlsProps {
  depth: DepthLevel
  aggregation: PriceAggregation
  mode: BookMode
  onDepthChange: (d: DepthLevel) => void
  onAggregationChange: (a: PriceAggregation) => void
  onModeChange: (m: BookMode) => void
}

const DEPTHS: DepthLevel[] = [5, 10, 25, 50, 100]
const AGGREGATIONS: PriceAggregation[] = ['0.1', '0.5', '1', '5']
const MODES: { value: BookMode; label: string }[] = [
  { value: 'ladder', label: 'Ladder' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'depth-profile', label: 'Depth' },
  { value: 'imbalance', label: 'Imbalance' },
  { value: 'microstructure', label: 'Micro' },
  { value: 'replay', label: 'Replay' },
]

function SegmentedControl<T extends string>({ options, value, onChange, labels }: { options: T[]; value: T; onChange: (v: T) => void; labels?: Record<T, string> }) {
  return (
    <div style={{ display: 'flex', gap: '0' }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{
            padding: '2px 8px',
            background: o === value ? 'var(--color-info)' : 'var(--color-bg-base)',
            border: '1px solid var(--color-border-subtle)',
            color: o === value ? '#fff' : 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-xs)',
            borderRadius: 0,
          }}
        >
          {labels ? labels[o] : o}
        </button>
      ))}
    </div>
  )
}

export function OrderBookControls({ depth, aggregation, mode, onDepthChange, onAggregationChange, onModeChange }: OrderBookControlsProps) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Levels</span>
        <SegmentedControl options={DEPTHS} value={depth} onChange={onDepthChange} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Agg</span>
        <SegmentedControl options={AGGREGATIONS} value={aggregation} onChange={onAggregationChange} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <SegmentedControl
          options={MODES.map((m) => m.value)}
          value={mode}
          onChange={onModeChange}
          labels={Object.fromEntries(MODES.map((m) => [m.value, m.label])) as Record<BookMode, string>}
        />
      </div>
    </div>
  )
}
