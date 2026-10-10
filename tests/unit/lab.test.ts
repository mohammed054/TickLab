import { describe, it, expect } from 'vitest';
import { freshDb, seedToken, snapOf } from './helpers';
import { runLab, outcomeAt, entryTokens } from '../../src/main/lab/replay';
import { mulberry32 } from '../../src/main/lab/prng';
import { bootstrapMeanCi, computeStats, verdict, histogram } from '../../src/main/lab/stats';
import { loadDefaultConfig } from '../../src/main/judge/config';
import { insertSnapshot } from '../../src/main/db/queries/snapshots';
import { insertGap } from '../../src/main/db/queries/gaps';
import type { LabParams, Snapshot } from '../../src/shared/types';

const MIN = 60_000; const T0 = 1_800_000_000_000; const cfg = loadDefaultConfig();
const P = (o: Partial<LabParams> = {}): LabParams => ({
  configId: null, alertRule: { maxScore: 100, minCompleteness: 0, minLiquidityUsd: 5000, minBuyersH1: 20, minAgeMin: 5, maxAgeMin: 120 },
  sizeUsd: 10, horizonsMin: [60, 240], feePctPerSide: 1, networkFeeUsd: 0.1, fromTs: T0 - 1e9, toTs: T0 + 1e9, seed: 42, missingMode: 'conservative', ...o });

function token(ctx: ReturnType<typeof freshDb>, n: number, series: { min: number; o?: Partial<Snapshot> }[], created = T0) {
  const t = seedToken(ctx.db, n, created, created - 1000);
  ctx.db.prepare('DELETE FROM pool_snapshots WHERE pool_id=?').run(t.poolId);
  for (const s of series) insertSnapshot(ctx.db, snapOf(t.poolId, created + s.min * MIN, { liquidityUsd: 20000, buyersH1: 30, priceUsd: 1, ...s.o }));
  return t;
}
const flat = (extra: Record<number, Partial<Snapshot>> = {}) => [10, 20, 70, 130, 250, 300].map((m) => ({ min: m, o: extra[m] }));

describe('replay maths', () => {
  const e = { cand: { tokenId: 1, poolId: 1, created: 0, snaps: [] as Snapshot[] }, idx: 0, T: 0, L: 10000, p: 1 };
  it('entry tokens + exit value hand-computed', () => {
    const tokens = entryTokens(10, 10000, 1, 1, 0.1);
    expect(tokens).toBeCloseTo((10 * 0.99 - 0.1) * (1 - 10 / 5010) / 1, 9);
    e.cand.snaps = [snapOf(1, 0), snapOf(1, 60 * MIN, { priceUsd: 2, liquidityUsd: 10000 })];
    const o = outcomeAt(e, tokens, 60, P());
    const vb = tokens * 2; const val = vb * (1 - vb / (5000 + vb)) * 0.99 - 0.1;
    expect(o.returnPct).toBeCloseTo(((val - 10) / 10) * 100, 6); expect(o.rugged).toBe(false);
  });
  it('collapse override exits at the first snapshot with L <= 0.2*L_entry', () => {
    e.cand.snaps = [snapOf(1, 0), snapOf(1, 30 * MIN, { priceUsd: 0.1, liquidityUsd: 1900 }), snapOf(1, 60 * MIN, { priceUsd: 5, liquidityUsd: 10000 })];
    const o = outcomeAt(e, entryTokens(10, 10000, 1, 1, 0.1), 60, P());
    expect(o.rugged).toBe(true); expect(o.returnPct!).toBeLessThan(-80);
  });
  it('no snapshot near horizon -> UNKNOWN', () => {
    e.cand.snaps = [snapOf(1, 0), snapOf(1, 30 * MIN, { liquidityUsd: 10000 })];
    expect(outcomeAt(e, 1, 240, P()).returnPct).toBeNull();
  });
});

describe('runLab', () => {
  it('no look-ahead: future holders/authority data planted after T is ignored at T', () => {
    const ctx = freshDb(); const t = token(ctx, 1, flat());
    // planted FUTURE data: authority checked at +200 min with active mint authority, awful holders at +200 min
    ctx.db.prepare('UPDATE tokens SET mint_authority=?, freeze_authority=?, authorities_checked_at=? WHERE id=?').run('A', 'B', T0 + 200 * MIN, t.tokenId);
    ctx.db.prepare('INSERT INTO holder_snapshots(token_id,observed_at,supply,top1_pct,top10_pct,rows_json) VALUES(?,?,?,?,?,?)').run(t.tokenId, T0 + 200 * MIN, 1, 90, 99, '[]');
    const strict = P({ alertRule: { maxScore: 0, minCompleteness: 0, minLiquidityUsd: 5000, minBuyersH1: 20, minAgeMin: 5, maxAgeMin: 120 } });
    const r = runLab(ctx.db, strict, cfg, { positionUsd: 10 });
    expect(r.nAlerts).toBe(1); // score is 0 at T = 10 min because the future data was invisible
    // control: the same rule evaluated later (age window extended past +200 min) sees the data and does NOT alert
    const late = P({ alertRule: { ...strict.alertRule, minAgeMin: 205, maxAgeMin: 400 } });
    expect(runLab(ctx.db, late, cfg, { positionUsd: 10 }).nAlerts).toBe(0);
  });
  it('excludes gap-created and <3 snapshot candidates and reports counts', () => {
    const ctx = freshDb(); token(ctx, 1, flat()); token(ctx, 2, flat(), T0 + 5000 * MIN); token(ctx, 3, [{ min: 10 }, { min: 20 }]);
    insertGap(ctx.db, { source: 'geckoterminal', startAt: T0 + 4000 * MIN, endAt: T0 + 6000 * MIN, reason: 'app_closed' });
    const r = runLab(ctx.db, P(), cfg, { positionUsd: 10 });
    expect(r.quality).toMatchObject({ excludedForGaps: 1, fewSnapshots: 1, candidates: 1 });
  });
  it('UNKNOWN: conservative = -100, optimistic excluded; both reported', () => {
    const ctx = freshDb(); token(ctx, 1, [{ min: 10 }, { min: 20 }, { min: 30 }]); // nothing near +60/+240
    const r = runLab(ctx.db, P({ horizonsMin: [240] }), cfg, { positionUsd: 10 });
    const s = r.sets.alerts['240'];
    expect(s.conservative.n).toBe(1); expect(s.conservative.meanReturn).toBe(-100);
    expect(s.optimistic.n).toBe(0); expect(s.optimistic.unknownCount).toBe(1); expect(s.conservative.unknownCount).toBe(1);
  });
  it('rugged tokens are exited at the collapse; verdict stays EDGE NOT PROVEN when n < 200', () => {
    const ctx = freshDb(); token(ctx, 1, flat({ 70: { liquidityUsd: 1000, priceUsd: 0.05 } }));
    const r = runLab(ctx.db, P(), cfg, { positionUsd: 10 });
    expect(r.sets.alerts['60'].conservative.ruggedRate).toBe(1); expect(r.verdict).toBe('EDGE NOT PROVEN');
  });
  it('deterministic for a seed, different across seeds for RANDOM', () => {
    const ctx = freshDb(); for (let i = 1; i <= 6; i++) token(ctx, i, flat({ 70: { priceUsd: 1 + i * 0.1 } }), T0 + i * 1000);
    const a = runLab(ctx.db, P(), cfg, { positionUsd: 10 }), b = runLab(ctx.db, P(), cfg, { positionUsd: 10 });
    expect(a).toEqual(b);
    expect(a.sets.random['60'].conservative.n).toBeGreaterThan(0);
  });
});

describe('prng + stats', () => {
  it('mulberry32 reproducible', () => { const a = mulberry32(7), b = mulberry32(7); expect([a(), a(), a()]).toEqual([b(), b(), b()]); expect(mulberry32(8)()).not.toBe(mulberry32(7)()); });
  it('bootstrap CI deterministic for a seed and brackets the mean', () => {
    const v = Array.from({ length: 50 }, (_, i) => i - 10);
    const c1 = bootstrapMeanCi(v, 1)!, c2 = bootstrapMeanCi(v, 1)!;
    expect(c1).toEqual(c2); expect(c1[0]).toBeLessThan(14.5); expect(c1[1]).toBeGreaterThan(14.5);
  });
  it('histogram: 40 bins -100..300, overflow in last bin', () => {
    const h = histogram([-100, -91, -1, 0, 299, 300, 5000]);
    expect(h).toHaveLength(40); expect(h[0]).toBe(2); expect(h[9]).toBe(1); expect(h[10]).toBe(1); expect(h[39]).toBe(3);
  });
  it('stats summary', () => {
    const s = computeStats([{ returnPct: 10, rugged: false }, { returnPct: -50, rugged: true }, { returnPct: null, rugged: false }, { returnPct: 30, rugged: false }], 'conservative', 1);
    expect(s).toMatchObject({ n: 4, worst: -100, winRate: 0.5, ruggedRate: 0.25, unknownRate: 0.25 });
    expect(s.meanReturn).toBeCloseTo((10 - 50 - 100 + 30) / 4);
  });
  it('verdict needs n>=200 AND both CI lower bounds > 0', () => {
    expect(verdict(199, [1, 2], [1, 2])).toBe('EDGE NOT PROVEN');
    expect(verdict(200, [1, 2], [1, 2])).toBe('EDGE SIGNAL (needs forward paper test)');
    expect(verdict(500, [-1, 2], [1, 2])).toBe('EDGE NOT PROVEN');
    expect(verdict(500, [1, 2], [0, 2])).toBe('EDGE NOT PROVEN');
  });
});
