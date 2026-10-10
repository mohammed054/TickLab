// docs/03 §3.4 source status + T2.8 usage meter. LIVE <45 s, DELAYED 45-180 s, STALE >180 s, OFFLINE after 3 consecutive network failures.
import type { Db } from '../db/open';
import type { HttpHooks } from '../net/http';
import type { SourceState, SourceStatus } from '../../shared/types';
import { addUsage, logError, usageToday } from '../db/queries/usage';

export type SourceName = 'geckoterminal' | 'rpc';
const NETWORK_CODES = new Set(['NET_OFFLINE', 'NET_TIMEOUT']);

export class SourceMonitor {
  private lastOk: Record<SourceName, number | null> = { geckoterminal: null, rpc: null };
  private netFails: Record<SourceName, number> = { geckoterminal: 0, rpc: 0 };
  private calls: Record<SourceName, number[]> = { geckoterminal: [], rpc: [] };
  private last429: number | null = null;
  constructor(private db: Db, private now: () => number) {}

  hooks(source: SourceName, creditsPerCall = 0): HttpHooks {
    return {
      onAttempt: () => { const n = this.now(); this.calls[source].push(n); addUsage(this.db, source, n, { calls: 1, credits: creditsPerCall }); },
      onError: (code, message) => { const n = this.now(); addUsage(this.db, source, n, { errors: 1 }); logError(this.db, source, code, message, n); if (NETWORK_CODES.has(code)) this.netFails[source]++; if (code === 'HTTP_429') this.last429 = n; },
    };
  }
  ok(source: SourceName): void { this.lastOk[source] = this.now(); this.netFails[source] = 0; }
  fail(source: SourceName, code: string): void { if (NETWORK_CODES.has(code) && this.netFails[source] === 0) this.netFails[source] = 1; }
  seedLastOk(source: SourceName, at: number | null): void { if (this.lastOk[source] === null) this.lastOk[source] = at; }
  callsLastMinute(source: SourceName): number { const cut = this.now() - 60_000; this.calls[source] = this.calls[source].filter((t) => t > cut); return this.calls[source].length; }
  last429At(): number | null { return this.last429; }

  state(source: SourceName): SourceState {
    if (this.netFails[source] >= 3) return 'OFFLINE';
    const lo = this.lastOk[source];
    if (lo === null) return 'STALE';
    const age = (this.now() - lo) / 1000;
    return age < 45 ? 'LIVE' : age <= 180 ? 'DELAYED' : 'STALE';
  }
  status(): SourceStatus[] {
    const n = this.now();
    return (['geckoterminal', 'rpc'] as SourceName[]).map((s) => {
      const u = usageToday(this.db, s, n);
      const lo = this.lastOk[s];
      return { source: s, state: this.state(s), lastOkAt: lo, ageSec: lo === null ? null : Math.max(0, Math.round((n - lo) / 1000)), callsToday: u.calls, errorsToday: u.errors };
    });
  }
}
