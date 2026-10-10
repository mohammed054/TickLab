// docs/03 §3.1A — GeckoTerminal client. All calls go through the token bucket + http client and return Result.
import type { Result, Snapshot, Trade, Candle } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { GT_BASE, GT_ACCEPT } from '../../shared/constants';
import { getJson, type HttpHooks } from '../net/http';
import type { TokenBucket } from '../net/tokenBucket';
import { clock } from '../clock';
import { indexIncluded, normalizePool, normalizeTrade, type NormalizedPool } from './normalize';

export interface PoolsPage { pools: NormalizedPool[]; skippedQuote: number; rejected: number; rawCount: number; oldestCreatedAt: number | null }
export type GtPriority = 0 | 1 | 2 | 3;

export interface GtDeps { bucket: TokenBucket; hooks?: HttpHooks; baseUrl?: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }

export class GeckoTerminalClient {
  constructor(private d: GtDeps) {}

  private async call(path: string, prio: GtPriority): Promise<Result<unknown>> {
    const slot = await this.d.bucket.take(1, prio);
    if (!slot.ok) return slot;
    const r = await getJson(`${this.d.baseUrl ?? GT_BASE}${path}`, { headers: { Accept: GT_ACCEPT }, ...this.d.hooks, fetchImpl: this.d.fetchImpl, sleep: this.d.sleep });
    if (!r.ok) { if (r.error.code === 'HTTP_429') this.d.bucket.penalize(60_000); return r; }
    return ok(r.value.json);
  }

  private parsePools(json: unknown, observedAt: number): Result<PoolsPage> {
    const root = json as { data?: unknown; included?: unknown } | null;
    if (!root || !Array.isArray(root.data)) return err('PARSE_FAIL', 'unexpected response shape (no data array)');
    const inc = indexIncluded(root.included);
    const page: PoolsPage = { pools: [], skippedQuote: 0, rejected: 0, rawCount: root.data.length, oldestCreatedAt: null };
    for (const p of root.data) {
      const n = normalizePool(p, inc);
      if (!n.ok) { page.rejected++; continue; }
      if (n.value.kind === 'skipped') { page.skippedQuote++; continue; }
      page.pools.push(n.value.value);
      const c = n.value.value.pool.createdAtChain;
      if (page.oldestCreatedAt === null || c < page.oldestCreatedAt) page.oldestCreatedAt = c;
    }
    void observedAt;
    // Every raw item rejected = shape drift, not a quiet market.
    if (page.rawCount > 0 && page.pools.length + page.skippedQuote === 0) return err('PARSE_FAIL', `all ${page.rawCount} pools failed validation`);
    return ok(page);
  }

  async newPools(page = 1, prio: GtPriority = 1): Promise<Result<PoolsPage>> {
    const r = await this.call(`/networks/solana/new_pools?include=base_token,quote_token,dex&page=${page}`, prio);
    return r.ok ? this.parsePools(r.value, clock.now()) : r;
  }
  async poolsMulti(addrs: string[], prio: GtPriority = 2): Promise<Result<PoolsPage>> {
    if (addrs.length === 0 || addrs.length > 30) return err('VALIDATION', 'poolsMulti takes 1-30 addresses');
    const r = await this.call(`/networks/solana/pools/multi/${addrs.join(',')}?include=base_token,quote_token,dex`, prio);
    return r.ok ? this.parsePools(r.value, clock.now()) : r;
  }
  async poolTrades(address: string, poolId: number, minUsd?: number, prio: GtPriority = 0): Promise<Result<Trade[]>> {
    // VERIFY the min-USD filter param name in Phase 0; until then filter client-side.
    const r = await this.call(`/networks/solana/pools/${address}/trades`, prio);
    if (!r.ok) return r;
    const data = (r.value as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) return err('PARSE_FAIL', 'unexpected trades response');
    const now = clock.now(); const out: Trade[] = [];
    for (const t of data) { const n = normalizeTrade(t, poolId, now); if (n.ok && (minUsd === undefined || (n.value.usdValue ?? 0) >= minUsd)) out.push(n.value); }
    if (data.length > 0 && out.length === 0 && minUsd === undefined) return err('PARSE_FAIL', 'all trades failed validation');
    return ok(out);
  }
  /** Hourly candles (used for the SOL/USD reference pool). */
  async poolOhlcvHour(address: string, prio: GtPriority = 3): Promise<Result<Candle[]>> {
    const r = await this.call(`/networks/solana/pools/${address}/ohlcv/hour?aggregate=1&limit=200`, prio);
    if (!r.ok) return r;
    return parseOhlcv(r.value);
  }
  async poolOhlcv(address: string, tf: '1m' | '5m' | '15m', prio: GtPriority = 0): Promise<Result<Candle[]>> {
    const [unit, agg] = tf === '1m' ? ['minute', 1] : tf === '5m' ? ['minute', 5] : ['minute', 15];
    const r = await this.call(`/networks/solana/pools/${address}/ohlcv/${unit}?aggregate=${agg}&limit=200`, prio);
    if (!r.ok) return r;
    return parseOhlcv(r.value);
  }
}

function parseOhlcv(json: unknown): Result<Candle[]> {
  const list = (json as { data?: { attributes?: { ohlcv_list?: unknown } } } | null)?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return err('PARSE_FAIL', 'unexpected ohlcv response');
  const out: Candle[] = [];
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [t, o, h, l, c, v] = row.map(Number);
    if ([t, o, h, l, c, v].every(Number.isFinite)) out.push({ t: t * 1000, o, h, l, c, v });
  }
  return ok(out.sort((a, b) => a.t - b.t).slice(-200));
}
export type { Snapshot };
