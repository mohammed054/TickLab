import type { SourceState, SourceStatus } from '@shared/types';

export const stateColor = (s: SourceState | undefined): string =>
  s === 'LIVE' ? 'var(--good)' : s === 'DELAYED' ? 'var(--warn)' : 'var(--bad)';
export const findSource = (sources: SourceStatus[], name: SourceStatus['source']): SourceStatus | undefined => sources.find((s) => s.source === name);
export const ageSecNow = (s: SourceStatus | undefined, now: number): number | null => (s?.lastOkAt ? Math.max(0, Math.round((now - s.lastOkAt) / 1000)) : null);
export const fmtSecs = (sec: number | null): string => (sec === null ? '' : sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m`);
