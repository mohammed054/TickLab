import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
  /** Icon-only buttons are 28x28 and need an aria-label. */
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', icon, iconOnly = false, className, style, children, type = 'button', ...rest }, ref,
) {
  const cls = ['btn', `btn-${variant}`, iconOnly ? 'btn-icon' : '', className ?? ''].filter(Boolean).join(' ');
  const dims = iconOnly ? { height: 28, width: 28, padding: 0 } : { height: 28, padding: '0 12px' };
  return (
    <button ref={ref} type={type} className={cls} style={{ ...dims, fontSize: 12, fontWeight: 600, borderRadius: 2, ...style }} {...rest}>
      {icon}
      {iconOnly ? null : children}
    </button>
  );
});
