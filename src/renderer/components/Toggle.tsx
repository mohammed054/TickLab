export interface ToggleProps { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }

/** 28x16 track with a 12px knob. */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="toggle" style={{ width: 28, height: 16 }} onClick={() => onChange(!checked)}>
      <span className="toggle-knob" />
    </button>
  );
}
