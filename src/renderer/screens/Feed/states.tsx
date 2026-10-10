import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import type { SourceState } from '@shared/types';

export type FeedViewState = 'waiting' | 'nomatch' | 'rows';

/** Pure: which empty state (if any) the table area shows. */
export function pickFeedState(rowCount: number, loaded: boolean, totalLaunches: number | null): FeedViewState {
  if (rowCount > 0) return 'rows';
  if (!loaded || !totalLaunches) return 'waiting';
  return 'nomatch';
}
export const isOffline = (s: SourceState | undefined): boolean => s === 'OFFLINE' || s === 'STALE';

export function WaitingState() {
  return <div className="center-fill"><Spinner /><span>Waiting for the first poll…</span></div>;
}
export function NoMatchState({ onReset }: { onReset: () => void }) {
  return (
    <div className="center-fill">
      <span>No launches match these filters.</span>
      <Button variant="secondary" onClick={onReset}>Reset filters</Button>
    </div>
  );
}
/** 28px amber banner across the top of the table; the table still shows rows. */
export function OfflineBanner() {
  return (
    <div role="alert" style={{ height: 28, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 12, background: 'color-mix(in srgb, var(--warn) 16%, transparent)', color: 'var(--warn)', borderBottom: '1px solid var(--border)' }}>
      Can't reach GeckoTerminal. Showing saved data.
    </div>
  );
}
