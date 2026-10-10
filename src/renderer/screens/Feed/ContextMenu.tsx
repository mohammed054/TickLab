import { useEffect, useRef } from 'react';

export interface MenuItem { label: string; onClick: () => void; disabled?: boolean }
export interface ContextMenuProps { x: number; y: number; items: MenuItem[]; onClose: () => void }

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const btns = Array.from(ref.current?.querySelectorAll('button') ?? []);
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key, true); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 216);
  const top = Math.min(y, window.innerHeight - items.length * 28 - 16);
  return (
    <div ref={ref} className="menu" role="menu" style={{ left, top }}>
      {items.map((it) => (
        <button key={it.label} type="button" role="menuitem" disabled={it.disabled} style={it.disabled ? { opacity: 0.4 } : undefined} onClick={() => { onClose(); it.onClick(); }}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
