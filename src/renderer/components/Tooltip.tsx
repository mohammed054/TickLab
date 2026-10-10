import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipProps { content: ReactNode; children: ReactNode; delay?: number; block?: boolean }

/** Shows after `delay` ms (300 by default). Text only. */
export function Tooltip({ content, children, delay = 300, block = false }: TooltipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clear, []);
  const show = () => {
    clear();
    timer.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 296)), y: r.bottom + 4 > window.innerHeight - 40 ? Math.max(8, r.top - 32) : r.bottom + 4 });
    }, delay);
  };
  const hide = () => { clear(); setPos(null); };
  if (content === null || content === undefined || content === '') return <>{children}</>;
  return (
    <span ref={ref} style={{ display: block ? 'block' : 'inline-flex', minWidth: 0 }} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos ? createPortal(<div role="tooltip" className="tooltip" style={{ left: pos.x, top: pos.y }}>{content}</div>, document.body) : null}
    </span>
  );
}
