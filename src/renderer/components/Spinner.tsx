export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" aria-label={label ?? 'Loading'} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
      {label ? <span className="muted" style={{ fontSize: 13 }}>{label}</span> : null}
    </span>
  );
}
