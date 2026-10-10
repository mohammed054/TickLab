import { forwardRef } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> { numeric?: boolean }

/** Height 28; number inputs are mono and right-aligned. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ numeric, className, style, ...rest }, ref) {
  const cls = ['input', numeric ? 'input-num' : '', className ?? ''].filter(Boolean).join(' ');
  return <input ref={ref} className={cls} style={{ height: 28, padding: '0 8px', fontSize: 12, ...style }} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, style, ...rest }, ref) {
  return <textarea ref={ref} className={['input', className ?? ''].join(' ')} style={{ padding: '6px 8px', fontSize: 12, ...style }} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, style, children, ...rest }, ref) {
  return (
    <select ref={ref} className={['input', className ?? ''].join(' ')} style={{ height: 28, padding: '0 8px', fontSize: 12, ...style }} {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="meta" style={{ display: 'block', marginTop: 2 }}>{hint}</span> : null}
    </label>
  );
}
