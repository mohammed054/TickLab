import { describe, it, expect, vi, beforeEach } from 'vitest';
import { freshDb, seedToken, snapOf } from './helpers';
import { JudgeRunner } from '../../src/main/judge/runner';
import { SourceMonitor } from '../../src/main/pipeline/status';
import { LaunchBatcher } from '../../src/main/ipc/events';
import { Tracker, intervalMultiplier, effectiveInterval, passesTrackFilter } from '../../src/main/pipeline/tracker';
import { Discovery } from '../../src/main/pipeline/discovery';
import { runBackfill } from '../../src/main/pipeline/backfill';
import { runRetention } from '../../src/main/pipeline/retention';
import { classifyHolders, Deep } from '../../src/main/pipeline/deep';
import { jobState, setJobState } from '../../src/main/db/queries/usage';
import { listGaps } from '../../src/main/db/queries/gaps';
import { addWatch } from '../../src/main/db/queries/listLaunches';
import { insertSnapshot } from '../../src/main/db/queries/snapshots';
import { insertTrades } from '../../src/main/db/queries/trades';
import type { PipelineCtx } from '../../src/main/pipeline/context';
import type { NormalizedPool } from '../../src/main/sources/normalize';
import type { Result } from '../../src/shared/types';

const MIN = 60_000, H = 3_600_000;
const NOW0 = new Date(2026, 9, 7, 12, 0, 0).getTime();
let now = NOW0;
const addr = (n: number, p = 'P') => `${p}${String(n).padStart(43, '0')}`;
const np = (i: number, created: number, o: Partial<NormalizedPool['snapshot']> = {}): NormalizedPool => ({
  token: { mint: addr(i, 'M'), symbol: `T${i}`, name: `Tok ${i}`, decimals: 6 },
  pool: { address: addr(i), quoteMint: null, quoteSymbol: 'SOL', dex: 'Raydium', createdAtChain: created },
  snapshot: { priceUsd: 0.001, liquidityUsd: 6000, fdvUsd: null, mcapUsd: null, volM5: 100, volH1: 1000, volH24: null, buysM5: 10, sellsM5: 5, buyersM5: null, sellersM5: null, buysH1: null, sellsH1: null, buyersH1: 30, sellersH1: null, chgM5: 1, chgH1: 1, ...o },
});
type Page = { pools: NormalizedPool[]; skippedQuote: number; rejected: number; rawCount: number; oldestCreatedAt: number | null };
const page = (pools: NormalizedPool[]): Page => ({ pools, skippedQuote: 0, rejected: 0, rawCount: pools.length, oldestCreatedAt: pools.length ? Math.min(...pools.map((p) => p.pool.createdAtChain)) : null });

function mkCtx(gt: Partial<PipelineCtx['gt']> = {}, rpc: Partial<PipelineCtx['rpc']> = {}) {
  const { db, settings } = freshDb();
  const events: [string, unknown][] = []; const batches: number[][] = [];
  const monitor = new SourceMonitor(db, () => now);
  const judge = new JudgeRunner({ db, settings, now: () => now });
  const ctx: PipelineCtx = {
    db, settings, monitor, judge, now: () => now, sleep: async () => undefined, counters: { skippedQuote: 0, rejected: 0 },
    batcher: new LaunchBatcher((ids) => batches.push(ids)), emit: (c, p) => { events.push([c, p]); },
    gt: { newPools: async () => ({ ok: true, value: page([]) }), poolsMulti: async () => ({ ok: true, value: page([]) }), poolTrades: async () => ({ ok: true, value: [] }), ...gt } as PipelineCtx['gt'],
    rpc: { mintInfo: async () => ({ ok: true, value: { mintAuthority: null, freezeAuthority: null, decimals: 6, supply: 1e9 } }), ...rpc } as PipelineCtx['rpc'],
  };
  return { ctx, db, settings, events, batches };
}
beforeEach(() => { now = NOW0; });

describe('discovery', () => {
  it('first poll inserts N launches + N events; identical second poll emits 0 and adds N snapshots', async () => {
    const pools = [1, 2, 3].map((i) => np(i, now - i * MIN));
    const { ctx, db, events } = mkCtx({ newPools: async () => ({ ok: true, value: page(pools) }) });
    const d = new Discovery(ctx, new Tracker(ctx));
    expect((await d.pollOnce()).newLaunches).toBe(3);
    expect(events.filter(([c]) => c === 'evt:launch-new')).toHaveLength(3);
    now += 15_000; events.length = 0;
    expect((await d.pollOnce()).newLaunches).toBe(0);
    expect(events).toHaveLength(0);
    expect(db.prepare('SELECT COUNT(*) c FROM pool_snapshots').get()).toEqual({ c: 6 });
    expect(db.prepare('SELECT COUNT(*) c FROM pools').get()).toEqual({ c: 3 });
  });
  it('failure logs an error but does not advance last_ok_at; status LIVE -> DELAYED -> STALE', async () => {
    let fail = false; const pools = [np(1, now - MIN)];
    const { ctx, db } = mkCtx({ newPools: async (): Promise<Result<Page>> => (fail ? { ok: false, error: { code: 'NET_OFFLINE', message: 'down' } } : { ok: true, value: page(pools) }) });
    const d = new Discovery(ctx, new Tracker(ctx));
    await d.pollOnce(); const ok1 = jobState(db, 'discovery').lastOkAt; expect(ok1).toBe(now);
    expect(ctx.monitor.state('geckoterminal')).toBe('LIVE');
    fail = true; now += 50_000; await d.pollOnce();
    expect(jobState(db, 'discovery').lastOkAt).toBe(ok1);
    expect(db.prepare('SELECT COUNT(*) c FROM error_log').get()).toEqual({ c: 1 });
    expect(ctx.monitor.state('geckoterminal')).toBe('DELAYED');
    now += 140_000; expect(ctx.monitor.state('geckoterminal')).toBe('STALE');
  });
  it('shallow judge runs on new launches and promotion follows the track filter', async () => {
    const pools = [np(1, now - 5 * MIN), np(2, now - 5 * MIN, { liquidityUsd: 1000 }), np(3, now - 40 * MIN)];
    const { ctx, db } = mkCtx({ newPools: async () => ({ ok: true, value: page(pools) }) });
    await new Discovery(ctx, new Tracker(ctx)).pollOnce();
    const tiers = db.prepare('SELECT address, tier FROM pools ORDER BY address').all() as { tier: number }[];
    expect(tiers.map((t) => t.tier)).toEqual([2, 1, 1]);
    expect(db.prepare('SELECT COUNT(*) c FROM judgements').get()).toEqual({ c: 3 });
  });
});

describe('backfill + gaps', () => {
  const setup = (lastOkAgo: number | null, pagesFn: (p: number) => Page) => {
    const calls: number[] = [];
    const m = mkCtx({ newPools: async (p: number) => { calls.push(p); return { ok: true, value: pagesFn(p) }; } });
    if (lastOkAgo !== null) setJobState(m.db, 'discovery', { ok: true }, now - lastOkAgo);
    return { ...m, calls, tracker: new Tracker(m.ctx) };
  };
  it('first run: nothing', async () => { const s = setup(null, () => page([])); expect((await runBackfill(s.ctx, s.tracker)).skipped).toBe('first_run'); expect(s.calls).toHaveLength(0); });
  it('closed 30 min -> pages until overlap, no gap', async () => {
    const s = setup(30 * MIN, (p) => page([np(p * 10, now - (p * 20) * MIN), np(p * 10 + 1, now - (p * 20 + 5) * MIN)]));
    const r = await runBackfill(s.ctx, s.tracker);
    expect(r.gap).toBeNull(); expect(s.calls).toEqual([1, 2]); expect(listGaps(s.db, 10)).toHaveLength(0);
  });
  it('closed 3 h and page cap reached -> backfill_cap gap', async () => {
    const s = setup(3 * H, (p) => page([np(p, now - p * MIN)]));
    const r = await runBackfill(s.ctx, s.tracker);
    expect(r.gap).toBe('backfill_cap'); expect(s.calls).toHaveLength(10);
    const g = listGaps(s.db, 5)[0]; expect(g.reason).toBe('backfill_cap'); expect(g.startAt).toBe(now - 3 * H); expect(g.endAt).toBe(now - 10 * MIN);
  });
  it('closed 10 h -> app_closed gap with zero calls', async () => {
    const s = setup(10 * H, () => page([]));
    expect((await runBackfill(s.ctx, s.tracker)).gap).toBe('app_closed'); expect(s.calls).toHaveLength(0);
    expect(listGaps(s.db, 5)[0]).toMatchObject({ reason: 'app_closed', startAt: now - 10 * H, endAt: now });
  });
  it('network failure during backfill records an outage gap, not a cap gap', async () => {
    const m = mkCtx({ newPools: async () => ({ ok: false, error: { code: 'NET_OFFLINE', message: 'x' } }) });
    setJobState(m.db, 'discovery', { ok: true }, now - H);
    await runBackfill(m.ctx, new Tracker(m.ctx));
    expect(listGaps(m.db, 5)[0].reason).toBe('outage');
  });
});

describe('tracker', () => {
  it('track filter boundaries', () => {
    const r = { maxAgeMin: 30, minLiquidityUsd: 3000, minTx5m: 10 };
    const s = (l: number | null, b: number | null, se: number | null) => ({ liquidityUsd: l, buysM5: b, sellsM5: se });
    expect(passesTrackFilter(29 * MIN, s(3000, 5, 5), r)).toBe(true);
    expect(passesTrackFilter(30 * MIN, s(3000, 5, 5), r)).toBe(false);
    expect(passesTrackFilter(1, s(2999, 5, 5), r)).toBe(false);
    expect(passesTrackFilter(1, s(3000, 5, 4), r)).toBe(false);
    expect(passesTrackFilter(1, s(null, 5, 5), r)).toBe(false);
  });
  it('adaptive multiplier: 1 normally, rises past budget, multiple of 15 s', () => {
    expect(intervalMultiplier(120, 0)).toBe(1); // 4 chunks*2 = 8 calls/min <= 12
    const k = intervalMultiplier(200, 0); expect(k).toBeCloseTo(14 / 12);
    expect(effectiveInterval(30_000, k) % 15_000).toBe(0); expect(effectiveInterval(30_000, k)).toBe(45_000);
    expect(effectiveInterval(300_000, k)).toBe(360_000); expect(effectiveInterval(30_000, 1)).toBe(30_000);
  });
  it('due selection per cadence; tracking ends at 24h unless watchlisted', () => {
    const { ctx, db } = mkCtx(); const tr = new Tracker(ctx);
    const young = seedToken(db, 1, now - 10 * MIN, now); const old = seedToken(db, 2, now - 3 * H, now); const ended = seedToken(db, 3, now - 25 * H, now);
    const fresh = seedToken(db, 4, now - 10 * MIN, now);
    for (const t of [young, old, ended, fresh]) db.prepare('UPDATE pools SET tier=2, tracked_since=?, tracked_until=? WHERE id=?').run(now - 30 * H, t === ended ? now - 1 : now + 10 * H, t.poolId);
    db.prepare('UPDATE pools SET last_snapshot_at=? WHERE id=?').run(now - 31_000, young.poolId);
    db.prepare('UPDATE pools SET last_snapshot_at=? WHERE id=?').run(now - 100_000, old.poolId);
    db.prepare('UPDATE pools SET last_snapshot_at=? WHERE id=?').run(now - 10_000, fresh.poolId);
    expect(tr.pickDue().map((r) => r.pool_id)).toEqual([young.poolId]);
    now += 250_000; // old (5 min cadence) becomes due; ended is past tracked_until
    expect(tr.pickDue().map((r) => r.pool_id).sort()).toEqual([young.poolId, old.poolId, fresh.poolId].sort());
    addWatch(db, ended.tokenId, now); tr.ensureForcedTracking(); db.prepare('UPDATE pools SET last_snapshot_at=NULL WHERE id=?').run(ended.poolId);
    expect(tr.pickDue().map((r) => r.pool_id)).toContain(ended.poolId);
  });
  it('tick snapshots due pools in one poolsMulti call and runs the authority check once', async () => {
    const calls: string[][] = []; let mintCalls = 0;
    const { ctx, db } = mkCtx({ poolsMulti: async (a: string[]) => { calls.push(a); const n = np(1, now - 10 * MIN); n.pool.address = `POOL${'1'.padStart(40, '0')}`; n.token.mint = `MINT${'1'.padStart(40, '0')}`; return { ok: true, value: page([n]) }; } }, { mintInfo: async () => { mintCalls++; return { ok: true, value: { mintAuthority: 'AUTH', freezeAuthority: null, decimals: 6, supply: 10 } }; } });
    const t = seedToken(db, 1, now - 10 * MIN, now); db.prepare('UPDATE pools SET tier=2, tracked_until=? WHERE id=?').run(now + H, t.poolId);
    const tr = new Tracker(ctx); now += 40_000; await tr.tick(); await tr.tick();
    expect(calls).toHaveLength(1); expect(mintCalls).toBe(1);
    expect(db.prepare('SELECT mint_authority a, authorities_checked_at c FROM tokens').get()).toEqual({ a: 'AUTH', c: now });
  });
});

describe('holders + deep', () => {
  const ta = (addr: string, owner: string) => ({ address: addr, owner: 'Tokenkeg', lamports: 1, exists: true, parsed: { info: { owner } } });
  it('classifies wallet/program/burn and computes top1/top10 on wallets only', () => {
    const largest = [{ address: 'T1', uiAmount: 300 }, { address: 'T2', uiAmount: 200 }, { address: 'T3', uiAmount: 100 }, { address: 'T4', uiAmount: 50 }, { address: 'T5', uiAmount: 10 }];
    const tas = [ta('T1', 'POOLPDA'), ta('T2', 'W2'), ta('T3', '1nc1nerator11111111111111111111111111111111'), ta('T4', 'W4'), ta('T5', 'GONE')];
    const owners = [
      { address: 'POOLPDA', owner: 'RaydiumProgram', lamports: 1, exists: true, parsed: null }, { address: 'W2', owner: '11111111111111111111111111111111', lamports: 1, exists: true, parsed: null },
      { address: '1nc1nerator11111111111111111111111111111111', owner: '11111111111111111111111111111111', lamports: 1, exists: true, parsed: null },
      { address: 'W4', owner: '11111111111111111111111111111111', lamports: 1, exists: true, parsed: null }, { address: 'GONE', owner: null, lamports: null, exists: false, parsed: null },
    ];
    const r = classifyHolders(largest, tas, owners, 1000);
    expect(r.rows.map((x) => x.class)).toEqual(['program', 'wallet', 'burn', 'wallet', 'program']);
    expect(r.top1Pct).toBeCloseTo(20); expect(r.top10Pct).toBeCloseTo(25); expect(r.programsPct).toBeCloseTo(31); expect(r.burnedPct).toBeCloseTo(10);
    expect(classifyHolders([], [], [], 1000).top1Pct).toBeNull();
  });
  it('holders refresh throttled to 10 min; creator derived from fee payer; stops 60 s after close', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let largestCalls = 0;
    const { ctx, db } = mkCtx({}, {
      tokenSupply: async () => ({ ok: true, value: 1000 }),
      largestAccounts: async () => { largestCalls++; return { ok: true, value: [{ address: 'T1', uiAmount: 250 }] }; },
      multipleAccounts: async (a: string[]) => ({ ok: true, value: a.map((x) => (x === 'T1' ? ta('T1', 'W1') : { address: x, owner: '11111111111111111111111111111111', lamports: 1, exists: true, parsed: null })) }),
      signatures: async () => ({ ok: true, value: [{ signature: 'SIG2', slot: 2, blockTime: 2, err: null }, { signature: 'SIG1', slot: 1, blockTime: 1, err: null }] }),
      transaction: async () => ({ ok: true, value: { slot: 1, blockTime: 1, meta: null, transaction: { signatures: [], message: { accountKeys: [{ pubkey: 'CREATOR' }], instructions: [] } } } }),
    });
    const t = seedToken(db, 1, now - 20 * MIN, now);
    const deep = new Deep(ctx); deep.setSelected(t.tokenId, null);
    await deep.tick(); expect(largestCalls).toBe(1);
    now += 5 * MIN; await deep.tick(); expect(largestCalls).toBe(1);
    now += 6 * MIN; await deep.tick(); expect(largestCalls).toBe(2);
    expect(db.prepare('SELECT creator_wallet c FROM tokens').get()).toEqual({ c: 'CREATOR' });
    expect(db.prepare('SELECT COUNT(*) c FROM holder_snapshots').get()).toEqual({ c: 2 });
    deep.setSelected(null, t.tokenId); expect(deep.activeTokenIds()).toEqual([t.tokenId]);
    vi.advanceTimersByTime(59_000); expect(deep.activeTokenIds()).toHaveLength(1);
    vi.advanceTimersByTime(2000); expect(deep.activeTokenIds()).toHaveLength(0);
    for (let i = 0; i < 20; i++) deep.setSelected(i + 1, i === 0 ? null : i);
    expect(deep.timerCount()).toBeLessThanOrEqual(20);
    deep.stopAll(); expect(deep.timerCount()).toBe(0);
    vi.useRealTimers();
  });
});

describe('retention', () => {
  it('deletes old data except watchlisted/decision-linked; journal untouched', () => {
    const { db } = freshDb();
    const a = seedToken(db, 1, now - 40 * 24 * H, now - 40 * 24 * H); const b = seedToken(db, 2, now - 40 * 24 * H, now - 40 * 24 * H); const c = seedToken(db, 3, now - 40 * 24 * H, now - 40 * 24 * H);
    const fresh = seedToken(db, 4, now, now);
    addWatch(db, b.tokenId, now);
    db.prepare("INSERT INTO judgements(token_id,pool_id,rules_version,computed_at,score,band,completeness,inputs_hash) VALUES(?,?,?,?,?,?,?,?)").run(c.tokenId, c.poolId, 'v', now - 40 * 24 * H, 10, 'LOW', 1, 'hh');
    const jid = Number(db.prepare("INSERT INTO judgements(token_id,pool_id,rules_version,computed_at,score,band,completeness,inputs_hash) VALUES(?,?,?,?,?,?,?,?)").run(c.tokenId, c.poolId, 'v', now - 39 * 24 * H, 10, 'LOW', 1, 'h2').lastInsertRowid);
    db.prepare("INSERT INTO decisions(account,token_id,pool_id,created_at,size_usd,stop_rule,target_rule,thesis,judgement_id,equity_before,risk_state_json) VALUES('paper',?,?,?,10,'s','t','a long enough thesis here',?,200,'{}')").run(c.tokenId, c.poolId, now - 40 * 24 * H, jid);
    insertTrades(db, [{ poolId: a.poolId, txSig: 's', blockTime: now - 40 * 24 * H, slot: 1, side: 'buy', wallet: 'w', usdValue: 1, tokenAmount: 1, priceUsd: 1, observedAt: now }]);
    db.prepare('INSERT INTO error_log(at,source,code,message) VALUES(?,?,?,?)').run(now - 31 * 24 * H, 's', 'c', 'm');
    const r = runRetention(db, now, 30, 30);
    const left = db.prepare('SELECT pool_id FROM pool_snapshots ORDER BY pool_id').all().map((x) => (x as { pool_id: number }).pool_id);
    expect(left).toEqual([b.poolId, c.poolId, fresh.poolId]);
    expect(r.trades).toBe(1); expect(r.errors).toBe(1);
    expect(db.prepare('SELECT COUNT(*) c FROM decisions').get()).toEqual({ c: 1 });
    expect(db.prepare('SELECT COUNT(*) c FROM judgements').get()).toEqual({ c: 1 }); // decision-linked kept, the old unreferenced one (not latest) removed
    void insertSnapshot; void snapOf;
  });
});
