// T1.5 read-only legacy journal archive. Write methods (createDecision,
// createFill, voidFill, paperExit, addNote, addEquityEvent, ensureInitialDeposits)
// were removed; DB tables and rows are preserved byte-for-byte and displayed as-is.
import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedToken, seedJudgement, snapOf } from './helpers';
import { JournalService } from '../../src/main/journal/service';
import { computeRiskState, canCreateDecision } from '../../src/main/journal/risk';
import { computeStats } from '../../src/main/journal/stats';
import { simulateEntry, simulateExit } from '../../src/main/journal/paperFill';
import { CSV_COLUMNS, csvCell } from '../../src/main/journal/exportCsv';

const T0 = new Date(2026, 9, 7, 10, 0, 0).getTime();
let now = T0; const clock = () => now;
let ctx: ReturnType<typeof freshDb>; let svc: JournalService; let tok: { tokenId: number; poolId: number };
const THESIS = 'Strong early volume and decent liquidity.';

beforeEach(() => {
  now = T0; ctx = freshDb(); svc = new JournalService(ctx.db, ctx.settings, clock);
  tok = seedToken(ctx.db, 1, T0 - 600_000, T0, { priceUsd: 0.001, liquidityUsd: 1000 });
  seedJudgement(ctx.db, tok.tokenId, tok.poolId);
  // explicit starting equity (the archive no longer auto-seeds deposits)
  ctx.db.prepare("INSERT INTO equity_events(account,at,kind,amount_usd,note) VALUES('paper',?,'deposit',200,'starting equity')").run(now);
});

function seedLegacyDecision(account: 'paper' | 'real' = 'paper'): number {
  return Number(ctx.db.prepare(
    `INSERT INTO decisions(account,token_id,pool_id,created_at,size_usd,planned_entry_price,stop_rule,target_rule,thesis,judgement_id,equity_before,risk_state_json)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(account, tok.tokenId, tok.poolId, now, 10, null, 'Exit if liquidity falls 50%', 'Take profit at +50%', THESIS, 1, 200, '{}').lastInsertRowid);
}

// --- pure math still covered by paperFill.ts (kept) ---------------------------

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

// --- risk engine (read-only) --------------------------------------------------
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
});

// --- read-only archive service -----------------------------------------------

describe('read-only archive service', () => {
  it('lists legacy decisions without mutating', () => {
    const id = seedLegacyDecision('paper');
    const rows = svc.decisions('paper');
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].thesis).toBe(THESIS);
    // the source row is unchanged (byte-for-byte preserved)
    const raw = ctx.db.prepare('SELECT thesis FROM decisions WHERE id=?').get(id) as { thesis: string };
    expect(raw.thesis).toBe(THESIS);
  });
  it('summary reflects existing rows only', () => {
    seedLegacyDecision('paper');
    const s = svc.summary('paper');
    expect(typeof s.equity).toBe('number');
    expect(typeof s.risk).toBe('object');
  });
  it('csv export has spec columns and neutralises formulas', () => {
    expect(CSV_COLUMNS.join(',')).toBe('decision_id,account,created_at,symbol,mint,size_usd,score,band,completeness,stop_rule,target_rule,thesis,entry_time,entry_price,exit_time,exit_price,fees_usd,pnl_usd,pnl_pct,status');
    seedLegacyDecision('paper');
    const csv = svc.csv('paper');
    expect(csv.split('\n')[0]).toBe(CSV_COLUMNS.join(','));
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('a,b')).toBe('"a,b"');
  });
});

// --- stats + csv -------------------------------------------------------------

describe('stats + csv', () => {
  it('stats on a seeded set of 12 decisions', () => {
    const rows = Array.from({ length: 12 }, (_, i) => {
      const pnl = i < 7 ? 1 : -2;
      return { id: i, status: 'closed', pnlUsd: pnl, pnlPct: pnl * 10, entry: { feeUsd: 0.2, usdValue: 10 }, exit: { feeUsd: 0.2, occurredAt: i } } as never;
    });
    const s = computeStats(rows);
    expect(s.n).toBe(12); expect(s.winRate).toBeCloseTo(7 / 12); expect(s.totalPnl).toBeCloseTo(7 - 10);
    expect(s.meanPnlPct).toBeCloseTo((70 - 100) / 12); expect(s.worstPnlPct).toBe(-20); expect(s.medianPnlPct).toBe(10);
    expect(s.maxDrawdownUsd).toBeCloseTo(10); expect(s.note).toBe('Small samples are noisy');
    expect(s.costShare).toBeCloseTo(0.04);
  });
  it('csv has exactly the spec columns', () => {
    expect(CSV_COLUMNS.join(',')).toBe('decision_id,account,created_at,symbol,mint,size_usd,score,band,completeness,stop_rule,target_rule,thesis,entry_time,entry_price,exit_time,exit_price,fees_usd,pnl_usd,pnl_pct,status');
    expect(csvCell('a,b')).toBe('"a,b"');
  });
});
