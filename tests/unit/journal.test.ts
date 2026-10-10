import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedToken, seedJudgement, snapOf } from './helpers';
import { insertSnapshot } from '../../src/main/db/queries/snapshots';
import { JournalService } from '../../src/main/journal/service';
import { computeRiskState, canCreateDecision, acknowledgeRisk } from '../../src/main/journal/risk';
import { simulateEntry, simulateExit } from '../../src/main/journal/paperFill';
import { computeStats } from '../../src/main/journal/stats';
import { toCsv, CSV_COLUMNS, csvCell } from '../../src/main/journal/exportCsv';
import { loadDecisions } from '../../src/main/journal/outcomes';

const H = 3_600_000;
const T0 = new Date(2026, 9, 7, 10, 0, 0).getTime();
let now = T0; const clock = () => now;
let ctx: ReturnType<typeof freshDb>; let svc: JournalService; let tok: { tokenId: number; poolId: number };
const THESIS = 'Strong early volume and decent liquidity.';
const mkInput = (o: Record<string, unknown> = {}) => ({ account: 'paper' as const, tokenId: tok.tokenId, poolId: tok.poolId, sizeUsd: 10, stopRule: 'Exit if liquidity falls 50%', targetRule: 'Take profit at +50%', thesis: THESIS, acknowledgedFlags: true as const, ...o });

beforeEach(() => {
  now = T0; ctx = freshDb(); svc = new JournalService(ctx.db, ctx.settings, clock); svc.ensureInitialDeposits();
  tok = seedToken(ctx.db, 1, T0 - 600_000, T0, { priceUsd: 0.001, liquidityUsd: 1000 });
  seedJudgement(ctx.db, tok.tokenId, tok.poolId);
});

describe('paper fills (hand-computed)', () => {
  it('entry S=10 L=1000 p=0.001 fee1% net0.10', () => {
    const f = simulateEntry(10, snapOf(1, T0, { priceUsd: 0.001, liquidityUsd: 1000 }), { feePctPerSide: 1, networkFeeUsd: 0.1 }, T0);
    if (!f.ok) throw new Error('x');
    const impact = 10 / 510; const tokens = ((10 * 0.99 - 0.1) * (1 - impact)) / 0.001;
    expect(f.value.tokenAmount).toBeCloseTo(tokens, 6); expect(f.value.tokenAmount).toBeCloseTo(9_607.84, 1);
    expect(f.value.feeUsd).toBeCloseTo(0.2, 9); expect(f.value.usdValue).toBe(10); expect(f.value.slippagePct).toBeCloseTo(1.9608, 3);
  });
  it('exit math and stale refusal', () => {
    const s = snapOf(1, T0, { priceUsd: 0.001, liquidityUsd: 1000 });
    const f = simulateExit(9607.84, s, { feePctPerSide: 1, networkFeeUsd: 0.1 }, T0);
    if (!f.ok) throw new Error('x');
    const vb = 9607.84 * 0.001; const usd = vb * (1 - vb / (500 + vb));
    expect(f.value.usdValue).toBeCloseTo(usd, 6); expect(f.value.feeUsd).toBeCloseTo(usd * 0.01 + 0.1, 6);
    expect(simulateExit(1, s, { feePctPerSide: 1, networkFeeUsd: 0.1 }, T0 + 16 * 60_000).ok).toBe(false);
    expect(simulateEntry(10, s, { feePctPerSide: 1, networkFeeUsd: 0.1 }, T0 + 16 * 60_000).ok).toBe(false);
    expect(simulateEntry(10, snapOf(1, T0, { liquidityUsd: null }), { feePctPerSide: 1, networkFeeUsd: 0.1 }, T0).ok).toBe(false);
  });
});

describe('risk engine', () => {
  it('start state: equity 200, max position $10, active', () => {
    const r = computeRiskState(ctx.db, ctx.settings, 'paper', now);
    expect(r.equity).toBe(200); expect(r.maxPositionUsd).toBeCloseTo(10); expect(r.active).toBe(true); expect(r.drawdownPct).toBe(0);
  });
  it('canCreateDecision rules', () => {
    const r = computeRiskState(ctx.db, ctx.settings, 'paper', now);
    expect(canCreateDecision(r, 10).ok).toBe(true); expect(canCreateDecision(r, 10.005).ok).toBe(true);
    expect(canCreateDecision(r, 10.01).ok).toBe(false); expect(canCreateDecision(r, 0).ok).toBe(false);
    expect(canCreateDecision({ ...r, openCount: 3 }, 5).ok).toBe(false);
    const bad = canCreateDecision({ ...r, pausedReason: 'drawdown', active: false }, 5);
    expect(!bad.ok && bad.error.code).toBe('RISK_BLOCKED');
  });
  it('pauses at exactly 25.0% drawdown', () => {
    ctx.db.prepare("INSERT INTO equity_events(account,at,kind,amount_usd,note) VALUES('paper',?,'withdraw',-50,'x')").run(now);
    const r = computeRiskState(ctx.db, ctx.settings, 'paper', now);
    expect(r.drawdownPct).toBeCloseTo(25); expect(r.pausedReason).toBe('drawdown'); expect(r.canAck).toBe(false);
    now += 25 * H;
    const r2 = computeRiskState(ctx.db, ctx.settings, 'paper', now);
    expect(r2.canAck).toBe(true);
    const a = acknowledgeRisk(ctx.db, ctx.settings, 'paper', 'reviewed', now);
    expect(a.ok && a.value.pausedReason).toBe(null);
    expect(computeRiskState(ctx.db, ctx.settings, 'paper', now).peak).toBeCloseTo(150);
  });
  it('3 losing trades pause for the day and clear at local midnight', () => {
    for (let i = 0; i < 3; i++) {
      const d = svc.createDecision(mkInput({ sizeUsd: 5 })); if (!d.ok) throw new Error(d.error.message);
      // closing exit at a collapsed price -> loss
      insertSnapshot(ctx.db, snapOf(tok.poolId, now + 1000 * (i + 1), { priceUsd: 0.0005, liquidityUsd: 1000 }));
      now += 1000 * (i + 1);
      const x = svc.paperExit(d.value.decisionId); if (!x.ok) throw new Error(x.error.message);
    }
    const r = computeRiskState(ctx.db, ctx.settings, 'paper', now);
    expect(r.losingToday).toBe(3); expect(r.pausedReason).toBe('daily_losses');
    expect(svc.createDecision(mkInput({ sizeUsd: 1 })).ok).toBe(false);
    now = new Date(2026, 9, 8, 0, 0, 1).getTime();
    expect(computeRiskState(ctx.db, ctx.settings, 'paper', now).pausedReason).toBe(null);
  });
  it('loosening cooldown keeps old max until effective', () => {
    ctx.settings.set('risk.maxPositionPct', 10, now);
    expect(computeRiskState(ctx.db, ctx.settings, 'paper', now).maxPositionUsd).toBeCloseTo(10);
    const r = computeRiskState(ctx.db, ctx.settings, 'paper', now);
    expect(r.pendingLimits).toHaveLength(1);
    expect(computeRiskState(ctx.db, ctx.settings, 'paper', now + 25 * H).maxPositionUsd).toBeCloseTo(20);
  });
});

describe('journal service', () => {
  it('creates a paper decision with an entry fill, snapshotting risk + equity', () => {
    const r = svc.createDecision(mkInput()); expect(r.ok).toBe(true);
    const d = loadDecisions(ctx.db, 'paper', now)[0];
    expect(d.status).toBe('open'); expect(d.entry?.source).toBe('paper_sim'); expect(d.equityBefore).toBe(200);
  });
  it('rejects: short thesis, oversize, no judgement, paused', () => {
    expect(svc.createDecision(mkInput({ thesis: 'too short' })).ok).toBe(false);
    const o = svc.createDecision(mkInput({ sizeUsd: 11 })); expect(!o.ok && o.error.code).toBe('RISK_BLOCKED');
    const t2 = seedToken(ctx.db, 2, T0, T0);
    const n = svc.createDecision(mkInput({ tokenId: t2.tokenId, poolId: t2.poolId })); expect(!n.ok && n.error.code).toBe('VALIDATION');
  });
  it('is atomic: failed paper entry leaves no decision row', () => {
    now += 20 * 60_000; // snapshot now stale
    expect(svc.createDecision(mkInput()).ok).toBe(false);
    expect(ctx.db.prepare('SELECT COUNT(*) c FROM decisions').get()).toEqual({ c: 0 });
  });
  it('real decision: manual fills, closed PnL formula, void excluded', () => {
    const d = svc.createDecision(mkInput({ account: 'real' })); if (!d.ok) throw new Error('x');
    const id = d.value.decisionId;
    expect(loadDecisions(ctx.db, 'real', now)[0].status).toBe('pending');
    expect(svc.createFill({ decisionId: id, kind: 'exit', occurredAt: now, priceUsd: 1, tokenAmount: 1, usdValue: 1, feeUsd: 0 }).ok).toBe(false); // entry first
    const e = svc.createFill({ decisionId: id, kind: 'entry', occurredAt: now, priceUsd: 0.001, tokenAmount: 9000, usdValue: 10, feeUsd: 0.2 });
    if (!e.ok) throw new Error('x');
    const x = svc.createFill({ decisionId: id, kind: 'exit', occurredAt: now + 1000, priceUsd: 0.0012, tokenAmount: 9000, usdValue: 12, feeUsd: 0.3 });
    if (!x.ok) throw new Error('x');
    let dec = loadDecisions(ctx.db, 'real', now)[0];
    expect(dec.status).toBe('closed'); expect(dec.pnlUsd).toBeCloseTo(12 - 0.3 - 10 - 0.2, 9); expect(dec.pnlPct).toBeCloseTo(15, 6);
    svc.voidFill(x.value.fillId, 'typo');
    dec = loadDecisions(ctx.db, 'real', now)[0];
    expect(dec.status).toBe('open'); expect(dec.pnlUsd).toBeNull();
    expect(svc.voidFill(x.value.fillId, 'again').ok).toBe(false);
  });
  it('zero-USD exit needs a note and counts as a full loss', () => {
    const d = svc.createDecision(mkInput({ account: 'real' })); if (!d.ok) throw new Error('x');
    const id = d.value.decisionId;
    svc.createFill({ decisionId: id, kind: 'entry', occurredAt: now, priceUsd: 0.001, tokenAmount: 9000, usdValue: 10, feeUsd: 0.2 });
    expect(svc.createFill({ decisionId: id, kind: 'exit', occurredAt: now + 1, priceUsd: 0, tokenAmount: 9000, usdValue: 0, feeUsd: 0 }).ok).toBe(false);
    expect(svc.createFill({ decisionId: id, kind: 'exit', occurredAt: now + 1, priceUsd: 0, tokenAmount: 9000, usdValue: 0, feeUsd: 0, note: 'rugged, cannot sell' }).ok).toBe(true);
    const dec = loadDecisions(ctx.db, 'real', now)[0];
    expect(dec.pnlUsd).toBeCloseTo(-10.2); expect(computeStats([dec]).winRate).toBe(0);
  });
  it('cancel only before entry; pending expires after 30 min', () => {
    const d = svc.createDecision(mkInput({ account: 'real' })); if (!d.ok) throw new Error('x');
    expect(loadDecisions(ctx.db, 'real', now + 31 * 60_000)[0].status).toBe('expired');
    expect(svc.addNote(d.value.decisionId, 'cancel', 'changed my mind').ok).toBe(true);
    expect(loadDecisions(ctx.db, 'real', now)[0].status).toBe('cancelled');
  });
  it('append-only: decisions cannot be edited via SQL', () => {
    const d = svc.createDecision(mkInput()); if (!d.ok) throw new Error('x');
    expect(() => ctx.db.prepare('UPDATE decisions SET size_usd=1').run()).toThrow('append-only');
  });
});

describe('stats + csv', () => {
  it('stats on a seeded set of 12 decisions', () => {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const pnl = i < 7 ? 1 : -2; // 7 wins, 5 losses
      return { id: i, status: 'closed', pnlUsd: pnl, pnlPct: pnl * 10, entry: { feeUsd: 0.2, usdValue: 10 }, exit: { feeUsd: 0.2, occurredAt: i } } as never;
    });
    const s = computeStats(rows);
    expect(s.n).toBe(12); expect(s.winRate).toBeCloseTo(7 / 12); expect(s.totalPnl).toBeCloseTo(7 - 10);
    expect(s.meanPnlPct).toBeCloseTo((70 - 100) / 12); expect(s.worstPnlPct).toBe(-20); expect(s.medianPnlPct).toBe(10);
    expect(s.maxDrawdownUsd).toBeCloseTo(10); expect(s.note).toBe('Small samples are noisy');
    expect(s.costShare).toBeCloseTo(0.04);
  });
  it('csv has exactly the spec columns and neutralises formulas', () => {
    expect(CSV_COLUMNS.join(',')).toBe('decision_id,account,created_at,symbol,mint,size_usd,score,band,completeness,stop_rule,target_rule,thesis,entry_time,entry_price,exit_time,exit_price,fees_usd,pnl_usd,pnl_pct,status');
    const d = svc.createDecision(mkInput()); if (!d.ok) throw new Error('x');
    const csv = toCsv(loadDecisions(ctx.db, 'paper', now));
    expect(csv.split('\n')[0]).toBe(CSV_COLUMNS.join(','));
    expect(csv.split('\n')).toHaveLength(3);
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('a,b')).toBe('"a,b"');
  });
});
