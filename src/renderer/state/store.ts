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
  checklist: ChecklistItem[];
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
  setChecklistItems: (items: ChecklistItem[]) => void;
  toggleChecklistItem: (id: string) => void;
}

export interface ChecklistItem {
  id: string;
  phase: 'Phase 1' | 'Phase 2' | 'Phase 3' | 'Phase 4' | 'Phase 5';
  title: string;
  description: string;
  verified: boolean;
  completedAt: string | null;
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
  checklist: [
    { id: 'p1-1', phase: 'Phase 1', title: 'Token Feed', description: 'Dashboard with live token feed', verified: false, completedAt: null },
    { id: 'p1-2', phase: 'Phase 1', title: 'Filters', description: 'Token filtering capabilities', verified: false, completedAt: null },
    { id: 'p1-3', phase: 'Phase 1', title: 'Token Details', description: 'Token detail view with risk flags', verified: false, completedAt: null },
    { id: 'p1-4', phase: 'Phase 1', title: 'Charts', description: 'Price charts and technical indicators', verified: false, completedAt: null },
    { id: 'p1-5', phase: 'Phase 1', title: 'Backtest Results', description: 'Historical backtest performance results', verified: false, completedAt: null },
    { id: 'p2-1', phase: 'Phase 2', title: 'Real Data Sources', description: 'Connect blockchain and market-data sources', verified: false, completedAt: null },
    { id: 'p2-2', phase: 'Phase 2', title: 'Discovery Delay', description: 'Measure discovery delay for new tokens', verified: false, completedAt: null },
    { id: 'p2-3', phase: 'Phase 2', title: 'Update Delay', description: 'Measure update delay of data feeds', verified: false, completedAt: null },
    { id: 'p2-4', phase: 'Phase 2', title: 'Missing Records', description: 'Identify missing records in data', verified: false, completedAt: null },
    { id: 'p2-5', phase: 'Phase 2', title: 'Accuracy Verification', description: 'Verify against independent sources', verified: false, completedAt: null },
    { id: 'p2-6', phase: 'Phase 2', title: 'API Limits & Costs', description: 'Measure API rate limits and costs', verified: false, completedAt: null },
    { id: 'p3-1', phase: 'Phase 3', title: 'Risk Checks', description: 'Implement risk verification checks', verified: false, completedAt: null },
    { id: 'p3-2', phase: 'Phase 3', title: 'Fixed Strategy Rules', description: 'Test historical data with realistic fees/slippage', verified: false, completedAt: null },
    { id: 'p3-3', phase: 'Phase 3', title: 'Failed Sells', description: 'Test handling of failed sell orders', verified: false, completedAt: null },
    { id: 'p3-4', phase: 'Phase 3', title: 'Liquidity Constraints', description: 'Test liquidity constraints in backtesting', verified: false, completedAt: null },
    { id: 'p3-5', phase: 'Phase 3', title: 'Unseen Time Periods', description: 'Test backtest on unseen time periods', verified: false, completedAt: null },
    { id: 'p4-1', phase: 'Phase 4', title: 'Paper Trading', description: 'Run system on new coins as they launch', verified: false, completedAt: null },
    { id: 'p4-2', phase: 'Phase 4', title: 'Signal Recording', description: 'Record signals before outcomes are known', verified: false, completedAt: null },
    { id: 'p4-3', phase: 'Phase 4', title: 'Realistic Entries/Exits', description: 'Simulate realistic entries and exits', verified: false, completedAt: null },
    { id: 'p4-4', phase: 'Phase 4', title: 'Signal-to-Trade Delay', description: 'Measure actual signal-to-trade delays', verified: false, completedAt: null },
    { id: 'p4-5', phase: 'Phase 4', title: 'No Selection Bias', description: 'Measure without selecting only pumping coins', verified: false, completedAt: null },
    { id: 'p5-1', phase: 'Phase 5', title: 'Real-Money Test', description: 'Tiny real-money test with capped positions', verified: false, completedAt: null },
    { id: 'p5-2', phase: 'Phase 5', title: 'Affordable Loss', description: 'Use money you can afford to lose', verified: false, completedAt: null },
    { id: 'p5-3', phase: 'Phase 5', title: 'Position Sizing', description: 'Cap position sizes appropriately', verified: false, completedAt: null },
    { id: 'p5-4', phase: 'Phase 5', title: 'Execution Assumptions', description: 'Never assume paper execution matches real', verified: false, completedAt: null },
  ],
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
  setChecklistItems: (items: ChecklistItem[]) => set({ checklist: items }),
  toggleChecklistItem: (id: string) =>
    set((s) => {
      const newChecklist = s.checklist.map((item) =>
        item.id === id ? { ...item, verified: !item.verified, completedAt: item.verified ? null : new Date().toISOString() } : item
      );
      return { checklist: newChecklist };
    }),
}));

export const unseenCount = (alerts: AlertRow[]): number => alerts.filter((a) => !a.seen).length;
