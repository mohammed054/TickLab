import { describe, it, expect } from 'vitest';
import { freshDb, seedToken, snapOf } from './helpers';
import { JudgeRunner } from '../../src/main/judge/runner';
import { insertSnapshot } from '../../src/main/db/queries/snapshots';
import { alertRulePasses, worthALookText } from '../../src/main/judge/alerts';
import { addWatch } from '../../src/main/db/queries/listLaunches';
import type { AlertRow } from '../../src/shared/types';

const NOW = 10_000_000_000;
function setup(o = {}) {
  const ctx = freshDb(); const t = seedToken(ctx.db, 1, NOW - 30 * 60_000, NOW, { liquidityUsd: 20000, buyersH1: 30, volH1: 5000, ...o });
  const alerts: AlertRow[] = []; let judged = 0;
  const runner = new JudgeRunner({ db: ctx.db, settings: ctx.settings, now: () => NOW, emitAlert: (a) => alerts.push(a), emitJudgement: () => judged++ });
  return { ...ctx, t, runner, alerts, judged: () => judged };
}

describe('judge runner', () => {
  it('unchanged data -> no new row; changed liquidity -> new row', () => {
    const s = setup();
    expect(s.runner.run(s.t.tokenId)).not.toBeNull();
    expect(s.runner.run(s.t.tokenId)).toBeNull();
    insertSnapshot(s.db, snapOf(s.t.poolId, NOW + 1, { liquidityUsd: 900, buyersH1: 30, volH1: 5000 }));
    expect(s.runner.run(s.t.tokenId)).not.toBeNull();
    expect(s.db.prepare('SELECT COUNT(*) c FROM judgements').get()).toEqual({ c: 2 });
    expect(s.judged()).toBe(2);
  });
  it('shallow data: only R08/R09/R11 known, others unknown (completeness 0.3)', () => {
    const s = setup(); const j = s.runner.run(s.t.tokenId)!;
    expect(j.results.filter((r) => r.status !== 'unknown').map((r) => r.ruleId).sort()).toEqual(['R08_EXIT_IMPACT', 'R09_LOW_LIQ', 'R11_THIN_CROWD']);
    expect(j.completeness).toBeCloseTo(0.3);
  });
  it('alert text and one-per-token', () => {
    expect(worthALookText('ABC', 12, 'LOW', 0.72)).toBe('ABC: risk 12 LOW, data 72%. Passed your filters. This is not advice.');
    const rule = { maxScore: 30, minCompleteness: 0.6, minLiquidityUsd: 5000, minBuyersH1: 20, minAgeMin: 5, maxAgeMin: 120 };
    const f = { score: 30, completeness: 0.6, liquidityUsd: 5000, buyersH1: 20, ageMin: 5 };
    expect(alertRulePasses(rule, f)).toBe(true);
    for (const bad of [{ score: 31 }, { completeness: 0.59 }, { liquidityUsd: 4999 }, { buyersH1: 19 }, { ageMin: 4.9 }, { ageMin: 120.1 }, { liquidityUsd: null }]) expect(alertRulePasses(rule, { ...f, ...bad })).toBe(false);
  });
  it('live: completeness below 0.6 (shallow data) blocks the alert', () => {
    const s = setup(); s.runner.run(s.t.tokenId);
    expect(s.alerts).toHaveLength(0);
  });
  it('liq_drop alert only for watchlisted tokens', () => {
    const s = setup(); addWatch(s.db, s.t.tokenId, NOW);
    insertSnapshot(s.db, snapOf(s.t.poolId, NOW + 1, { liquidityUsd: 8000 })); insertSnapshot(s.db, snapOf(s.t.poolId, NOW + 2, { liquidityUsd: 3000 }));
    s.runner.run(s.t.tokenId);
    const a = s.alerts.find((x) => x.kind === 'liq_drop');
    expect(a?.text).toBe('TK1: liquidity fell 85% from peak.');
    const u = setup(); insertSnapshot(u.db, snapOf(u.t.poolId, NOW + 1, { liquidityUsd: 8000 })); insertSnapshot(u.db, snapOf(u.t.poolId, NOW + 2, { liquidityUsd: 3000 }));
    u.runner.run(u.t.tokenId); expect(u.alerts.find((x) => x.kind === 'liq_drop')).toBeUndefined();
  });
});
