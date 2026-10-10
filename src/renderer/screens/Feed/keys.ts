import { useEffect, useRef } from 'react';
import { invoke } from '../../state/hooks';

export type FeedAction = 'watch' | 'paper' | 'search' | 'reset' | null;

/** Pure mapping of the Feed's letter shortcuts (arrows/paging/Home/End live in Table). */
export function feedKeyAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): FeedAction {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key.toLowerCase()) {
    case 'w': return 'watch';
    case 'p': return 'paper';
    case '/': return 'search';
    case 'r': return 'reset';
    default: return null;
  }
}

export const SELECT_DEBOUNCE_MS = 150;

/** Sends `detail:select` 150 ms after the selection settles (rapid key presses collapse to one call). */
export function useDetailSelectSync(tokenId: number | null): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; if (tokenId === null) return; }
    const t = setTimeout(() => { void invoke('detail:select', { tokenId }); }, SELECT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [tokenId]);
}
