import type { CSSProperties, ReactNode } from 'react';

export interface ChipProps { color?: string; children: ReactNode; style?: CSSProperties; title?: string }

/** Height 18, padding 0 6, font 11, radius 2; background is the colour at 16% alpha. */
export function Chip({ color = 'var(--text-2)', children, style, title }: ChipProps) {
  return (
    <span
      className="chip"
      title={title}
      style={{ height: 18, padding: '0 6px', fontSize: 11, borderRadius: 2, background: `color-mix(in srgb, ${color} 16%, transparent)`, color, ...style }}
    >
      {children}
    </span>
  );
}
