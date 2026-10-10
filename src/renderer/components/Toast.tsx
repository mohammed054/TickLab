import { useEffect, useRef } from 'react';
import { create } from 'zustand';

export type ToastType = 'info' | 'good' | 'warn' | 'bad';
export interface ToastItem { id: number; type: ToastType; text: string; onClick?: () => void }
export const TOAST_MS = 5000;
export const TOAST_MAX = 3;
const COLORS: Record<ToastType, string> = { info: 'var(--accent)', good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' };

interface ToastStore { items: ToastItem[]; push: (t: Omit<ToastItem, 'id'>) => void; dismiss: (id: number) => void; clear: () => void }
let nextId = 1;
export const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items, { ...t, id: nextId++ }] })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
  clear: () => set({ items: [] }),
}));

export const toast = (text: string, type: ToastType = 'info', onClick?: () => void): void => useToastStore.getState().push({ text, type, onClick });

function ToastView({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const remaining = useRef(TOAST_MS);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    startedAt.current = Date.now();
    timer.current = setTimeout(() => dismiss(item.id), remaining.current);
  };
  const pause = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
  };
  useEffect(() => {
    start();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);
  return (
    <div
      className="toast"
      role="status"
      data-testid="toast"
      style={{ width: 320, borderLeftColor: COLORS[item.type], padding: '8px 12px', fontSize: 12 }}
      onMouseEnter={pause}
      onMouseLeave={() => { if (!timer.current) start(); }}
      onClick={() => { item.onClick?.(); dismiss(item.id); }}
    >
      {item.text}
    </div>
  );
}

/** Top-right stack, 12px from the edges, 8px gap, at most 3 visible; the rest wait in order. */
export function ToastHost() {
  const items = useToastStore((s) => s.items);
  return (
    <div className="toast-host" style={{ top: 12, right: 12, gap: 8 }} aria-live="polite">
      {items.slice(0, TOAST_MAX).map((t) => <ToastView key={t.id} item={t} />)}
    </div>
  );
}
