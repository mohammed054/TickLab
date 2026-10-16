// docs/09-research-system.md §9.9 — read-only legacy journal archive.
// All write methods (createDecision, createFill, voidFill, paperExit, addNote,
// addEquityEvent, ensureInitialDeposits) were removed in T1.5. The service only
// reads existing rows; DB tables and rows are preserved byte-for-byte.
import type { Db } from '../db/open';
import type { Account } from '../../shared/types';
import { SettingsStore } from '../settings/store';
import { computeRiskState } from './risk';
import { computeStats } from './stats';
import { equityTimeline, loadDecisions } from './outcomes';
import { toCsv } from './exportCsv';

export class JournalService {
  constructor(private db: Db, private settings: SettingsStore, private now: () => number) {}

  /** Read-only: all decisions for an account, newest first. */
  decisions(account: Account, opts: { tokenId?: number } = {}) {
    return loadDecisions(this.db, account, this.now(), opts);
  }

  /** Read-only: journal summary (equity, PnL, risk state) for an account. */
  summary(account: Account) {
    const now = this.now();
    const risk = computeRiskState(this.db, this.settings, account, now);
    const ds = loadDecisions(this.db, account, now);
    const st = computeStats(ds);
    const openExposure = ds.filter((d) => d.status === 'open').reduce((a, d) => a + (d.entry?.usdValue ?? 0), 0);
    return {
      equity: risk.equity, peak: risk.peak, realizedPnl: st.totalPnl, winRate: st.winRate, n: st.n,
      openExposure, drawdownPct: risk.drawdownPct, risk,
    };
  }

  /** Read-only: equity timeline for an account. */
  equity(account: Account) {
    return equityTimeline(this.db, account, this.now()).map((p) => ({ at: p.at, equity: p.equity, kind: p.kind, note: p.note }));
  }

  /** Read-only: CSV export of all decisions for an account. */
  csv(account: Account): string {
    return toCsv(this.decisions(account));
  }
}
