export interface TabItem<T extends string> { id: T; label: string }
export interface TabsProps<T extends string> { tabs: TabItem<T>[]; active: T; onChange: (id: T) => void }

/** Height 32, 12px/600, active has a 2px accent underline. */
export function Tabs<T extends string>({ tabs, active, onChange }: TabsProps<T>) {
  return (
    <div className="tabs" role="tablist" style={{ height: 32 }}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === active} className="tab" style={{ height: 32, padding: '0 12px' }} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export interface SegmentedProps<T extends string> { options: { id: T; label: string }[]; value: T; onChange: (id: T) => void; disabled?: boolean }
export function Segmented<T extends string>({ options, value, onChange, disabled }: SegmentedProps<T>) {
  return (
    <div className="seg" role="group" style={{ height: 28 }}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} disabled={disabled} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
