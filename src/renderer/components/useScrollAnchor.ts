import { useLayoutEffect, useRef } from 'react';

/**
 * Keeps the viewport stable when rows are inserted above it. When the key list changes the anchor
 * (the previously selected row, else the first visible row) is looked up in both lists and scrollTop
 * shifts by the index difference. Does nothing at scrollTop 0 so a fresh feed stays pinned to the top.
 */
export function useScrollAnchor(el: React.RefObject<HTMLElement>, keys: string[], selectedKey: string | null, rowHeight: number): void {
  const prev = useRef<{ keys: string[]; selected: string | null }>({ keys: [], selected: null });
  useLayoutEffect(() => {
    const node = el.current;
    const old = prev.current;
    if (node && node.scrollTop > 0 && old.keys.length > 0 && old.keys !== keys) {
      const sel = old.selected !== null && old.keys.includes(old.selected) ? old.selected : null;
      const anchor = sel ?? old.keys[Math.min(old.keys.length - 1, Math.floor(node.scrollTop / rowHeight))] ?? null;
      if (anchor !== null) {
        const oldIdx = old.keys.indexOf(anchor);
        const newIdx = keys.indexOf(anchor);
        if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) node.scrollTop += (newIdx - oldIdx) * rowHeight;
      }
    }
    prev.current = { keys, selected: selectedKey };
  }, [el, keys, selectedKey, rowHeight]);
}
