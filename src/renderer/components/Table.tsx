import { useMemo, useRef, useEffect } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useVirtualizer, observeElementRect } from '@tanstack/react-virtual';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useScrollAnchor } from './useScrollAnchor';

export interface Column<T> {
  id: string;
  header: string;
  width: number;
  /** A flex column takes the leftover width; `width` is its minimum. */
  flex?: boolean;
  align?: 'left' | 'right' | 'center';
  sortKey?: string;
  render: (row: T) => ReactNode;
}
export interface TableSort { col: string; dir: 'asc' | 'desc' }

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectedKey?: string | null;
  onSelect?: (row: T, index: number) => void;
  onActivate?: (row: T) => void;
  onContextMenu?: (row: T, e: MouseEvent) => void;
  /** Runs before the built-in navigation keys; call e.preventDefault() to swallow a key. */
  onKeyDown?: (e: KeyboardEvent, row: T | null) => void;
  sort?: TableSort;
  onSortChange?: (sortKey: string) => void;
  rowClassName?: (row: T) => string | undefined;
  rowHeight?: number;
  /** Height used when the element has no layout yet (first paint, tests). */
  fallbackHeight?: number;
  emptyText?: ReactNode;
}

const HEADER_H = 28;

/** Virtualized table: sticky 28px header, 24px rows, overscan 10, keyboard selection. */
export function Table<T>({ columns, rows, rowKey, selectedKey = null, onSelect, onActivate, onContextMenu, onKeyDown, sort, onSortChange, rowClassName, rowHeight = 24, fallbackHeight = 600, emptyText }: TableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const keys = useMemo(() => rows.map(rowKey), [rows, rowKey]);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    initialRect: { width: 800, height: fallbackHeight },
    observeElementRect: (inst, cb) => observeElementRect(inst, (r) => cb(r.height === 0 ? { width: r.width, height: fallbackHeight } : r)),
  });
  useScrollAnchor(scrollRef, keys, selectedKey, rowHeight);
  const selIdx = selectedKey === null ? -1 : keys.indexOf(selectedKey);
  const selIdxRef = useRef(selIdx);
  selIdxRef.current = selIdx;
  // Only follow the selection when the selection itself changes, never when rows shift around it.
  useEffect(() => { if (selectedKey !== null && selIdxRef.current >= 0) virt.scrollToIndex(selIdxRef.current, { align: 'auto' }); }, [selectedKey, virt]);

  const template = columns.map((c) => (c.flex ? `minmax(${c.width}px,1fr)` : `${c.width}px`)).join(' ');
  const minW = columns.reduce((a, c) => a + c.width, 0);

  const move = (to: number) => {
    const i = Math.max(0, Math.min(rows.length - 1, to));
    const row = rows[i];
    if (row !== undefined && i !== selIdx) onSelect?.(row, i);
  };
  const handleKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const cur = selIdx >= 0 ? (rows[selIdx] ?? null) : null;
    onKeyDown?.(e, cur);
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const base = selIdx < 0 ? 0 : selIdx;
    const map: Record<string, number | undefined> = {
      ArrowDown: selIdx < 0 ? 0 : base + 1, ArrowUp: selIdx < 0 ? 0 : base - 1, PageDown: base + 10, PageUp: base - 10, Home: 0, End: rows.length - 1,
    };
    const target = map[e.key];
    if (target !== undefined) { e.preventDefault(); move(target); }
    else if (e.key === 'Enter' && cur !== null) { e.preventDefault(); onActivate?.(cur); }
  };

  return (
    <div ref={scrollRef} role="grid" aria-rowcount={rows.length} tabIndex={0} onKeyDown={handleKey} data-testid="table-scroll"
      style={{ height: '100%', overflow: 'auto', position: 'relative', outline: 'none' }}>
      <div style={{ minWidth: minW, width: '100%' }}>
        <div role="row" className="t-head" style={{ gridTemplateColumns: template, height: HEADER_H }}>
          {columns.map((c) => {
            const active = !!c.sortKey && sort?.col === c.sortKey;
            const just = c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start';
            return c.sortKey ? (
              <div key={c.id} role="columnheader" aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" style={{ justifyContent: just }} onClick={() => onSortChange?.(c.sortKey as string)}>
                  {c.header}
                  {active ? (sort?.dir === 'asc' ? <ChevronUp size={8} strokeWidth={1.5} /> : <ChevronDown size={8} strokeWidth={1.5} />) : null}
                </button>
              </div>
            ) : (
              <div key={c.id} role="columnheader" style={{ padding: '0 8px', textAlign: c.align ?? 'left' }}>{c.header}</div>
            );
          })}
        </div>
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((v) => {
            const row = rows[v.index];
            if (row === undefined) return null;
            const key = keys[v.index] as string;
            return (
              <div key={key} role="row" data-row="" aria-selected={key === selectedKey} className={`t-row ${rowClassName?.(row) ?? ''}`}
                style={{ top: v.start, height: rowHeight, gridTemplateColumns: template }}
                onClick={() => onSelect?.(row, v.index)} onDoubleClick={() => onActivate?.(row)} onContextMenu={(e) => { if (onContextMenu) { e.preventDefault(); onSelect?.(row, v.index); onContextMenu(row, e); } }}>
                {columns.map((c) => (
                  <div key={c.id} role="gridcell" className="t-cell" style={{ textAlign: c.align ?? 'left', ...(c.align === 'right' ? { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' } : null) }}>
                    {c.render(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {rows.length === 0 && emptyText ? <div className="center-fill" style={{ position: 'absolute', inset: `${HEADER_H}px 0 0 0` }}>{emptyText}</div> : null}
      </div>
    </div>
  );
}
