import { create } from 'zustand';
import { DEFAULT_FILTERS } from '@shared/ipc';
import type { Account, AlertRow, Filters, RiskState, SortSpec, SourceStatus } from '@shared/types';

export const DEFAULT_SORT: SortSpec = { col: 'age', dir: 'asc' };
export const freshFilters = (): Filters => ({ ...DEFAULT_FILTERS, bands: [...DEFAULT_FILTERS.bands], dexes: null });

export interface PendingDrawer { decisionId: number; fill?: 'entry' | 'exit' }

export interface AppState {
  filters: Filters;
  sort: SortSpec;
  selectedTokenId: number | null;
  sources: SourceStatus[];
  alerts: AlertRow[];
  risk: Record<Account, RiskState | null>;
  pinned: boolean;
  knownDexes: string[];
  watchOverrides: Record<number, boolean>;
  refreshTick: number;
  journalTick: number;
  pendingDrawer: PendingDrawer | null;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  setSort: (sort: SortSpec) => void;
  select: (tokenId: number | null) => void;
  setSources: (s: SourceStatus[]) => void;
  setAlerts: (a: AlertRow[]) => void;
  pushAlert: (a: AlertRow) => void;
  markAllSeen: () => void;
  setRisk: (account: Account, risk: RiskState) => void;
  setPinned: (p: boolean) => void;
  addDexes: (dexes: (string | null)[]) => void;
  setWatchOverride: (tokenId: number, v: boolean) => void;
  clearWatchOverrides: () => void;
  bump: () => void;
  bumpJournal: () => void;
  setPendingDrawer: (p: PendingDrawer | null) => void;
}

export const useStore = create<AppState>((set) => ({
  filters: freshFilters(),
  sort: DEFAULT_SORT,
  selectedTokenId: null,
  sources: [],
  alerts: [],
  risk: { paper: null, real: null },
  pinned: false,
  knownDexes: [],
  watchOverrides: {},
  refreshTick: 0,
  journalTick: 0,
  pendingDrawer: null,
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: freshFilters() }),
  setSort: (sort) => set({ sort }),
  select: (selectedTokenId) => set({ selectedTokenId }),
  setSources: (sources) => set({ sources }),
  setAlerts: (alerts) => set({ alerts: alerts.slice(0, 50) }),
  pushAlert: (a) => set((s) => ({ alerts: [a, ...s.alerts.filter((x) => x.id !== a.id)].slice(0, 50) })),
  markAllSeen: () => set((s) => ({ alerts: s.alerts.map((a) => ({ ...a, seen: true })) })),
  setRisk: (account, risk) => set((s) => ({ risk: { ...s.risk, [account]: risk } })),
  setPinned: (pinned) => set({ pinned }),
  addDexes: (dexes) =>
    set((s) => {
      const add = dexes.filter((d): d is string => !!d && !s.knownDexes.includes(d));
      return add.length ? { knownDexes: [...s.knownDexes, ...add] } : s;
    }),
  setWatchOverride: (tokenId, v) => set((s) => ({ watchOverrides: { ...s.watchOverrides, [tokenId]: v } })),
  clearWatchOverrides: () => set({ watchOverrides: {} }),
  bump: () => set((s) => ({ refreshTick: s.refreshTick + 1 })),
  bumpJournal: () => set((s) => ({ journalTick: s.journalTick + 1 })),
  setPendingDrawer: (pendingDrawer) => set({ pendingDrawer }),
}));

export const unseenCount = (alerts: AlertRow[]): number => alerts.filter((a) => !a.seen).length;
