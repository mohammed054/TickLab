import { describe, it, expect } from 'vitest';
import { loadDefaultConfig, parseRuleConfig } from '../../src/main/judge/config';
import { evaluate, bandFor } from '../../src/main/judge/engine';
import { estimateExit, exitImpact } from '../../src/main/judge/exitImpact';
import type { JudgeInput } from '../../src/main/judge/types';
import { R03 } from '../../src/main/judge/rules/R03';
import { R05 } from '../../src/main/judge/rules/R05';
import { R06 } from '../../src/main/judge/rules/R06';
import { R08 } from '../../src/main/judge/rules/R08';
import { R09 } from '../../src/main/judge/rules/R09';
import { R10 } from '../../src/main/judge/rules/R10';
import { R11 } from '../../src/main/judge/rules/R11';
import { R07 } from '../../src/main/judge/rules/R07';
import type { Snapshot, Trade } from '../../src/shared/types';

const cfg = loadDefaultConfig();
const snap = (o: Partial<Snapshot> = {}): Snapshot => ({
  poolId: 1, observedAt: 0, priceUsd: 1, liquidityUsd: 10000, fdvUsd: null, mcapUsd: null, volM5: null, volH1: 1000, volH24: null,
  buysM5: null, sellsM5: null, buyersM5: null, sellersM5: null, buysH1: null, sellsH1: null, buyersH1: 50, sellersH1: null, chgM5: null, chgH1: null, source: 't', ...o,
});
const base = (o: Partial<JudgeInput> = {}): JudgeInput => ({
  now: 1_000_000, token: { id: 1, mint: 'M', creatorWallet: null, mintAuthority: null, freezeAuthority: null, authoritiesCheckedAt: null },
  pool: { id: 1, createdAtChain: 0, firstSeenAt: 0 }, latest: snap(), history: [snap()], trades: null, holders: null,
  creatorPriorTokens: null, earlyBuyerFunders: null, positionUsd: 10, costs: { feePctPerSide: 1, networkFeeUsd: 0.1 }, ...o,
});
const holders = (top1: number | null, top10: number | null) => ({ tokenId: 1, observedAt: 5, supply: 1, top1Pct: top1, top10Pct: top10, programsPct: 0, burnedPct: 0, rows: [] });

describe('config', () => {
  it('loads default and rejects extra/missing keys', () => {
    expect(cfg.version).toBe('rules_v1');
    const bad = JSON.parse(JSON.stringify(cfg)); bad.rules.R01_MINT_AUTH.extra = 1;
    expect(() => parseRuleConfig(bad)).toThrow();
    const miss = JSON.parse(JSON.stringify(cfg)); delete miss.rules.R11_THIN_CROWD;
    expect(() => parseRuleConfig(miss)).toThrow();
  });
});

describe('rules boundaries', () => {
  it('R03 top1 20.0 clear, 20.01 hit, null unknown', () => {
    const c = cfg.rules.R03_TOP1_HOLDER;
    expect(R03(base({ holders: holders(20, 1) }), c).status).toBe('clear');
    expect(R03(base({ holders: holders(20.01, 1) }), c).status).toBe('hit');
    expect(R03(base({ holders: holders(null, 1) }), c).status).toBe('unknown');
    expect(R03(base(), c).status).toBe('unknown');
  });
  it('R05 3 priors/2 dumped hit; 1 dumped clear; no creator unknown', () => {
    const c = cfg.rules.R05_CREATOR_SERIAL;
    const t = (dump: boolean) => ({ tokenId: 1, maxLiqUsd: 10000, liqAt24hUsd: dump ? 1000 : 9000, ageMs: 86_400_000 });
    const tok = { ...base().token, creatorWallet: 'C' };
    expect(R05(base({ token: tok, creatorPriorTokens: [t(true), t(true), t(false)] }), c).status).toBe('hit');
    expect(R05(base({ token: tok, creatorPriorTokens: [t(true), t(false), t(false)] }), c).status).toBe('clear');
    expect(R05(base({ creatorPriorTokens: [] }), c).status).toBe('unknown');
  });
  const trade = (sec: number, side: 'buy' | 'sell', w: string): Trade => ({ poolId: 1, txSig: `${sec}${w}`, blockTime: sec * 1000, slot: null, side, wallet: w, usdValue: 1, tokenAmount: 1, priceUsd: 1, observedAt: 0 });
  it('R06 window logic and unknown cases', () => {
    const c = cfg.rules.R06_EARLY_SYNC;
    const sync = ['a', 'b', 'c', 'd', 'e', 'f'].map((w, i) => trade(10 + (i % 2), 'buy', w));
    const late = trade(200, 'sell', 'z');
    expect(R06(base({ trades: [...sync, late] }), c).status).toBe('hit');
    expect(R06(base({ trades: [...sync.slice(0, 5), late] }), c).status).toBe('clear');
    expect(R06(base({ trades: sync }), c).status).toBe('unknown'); // no trade beyond early window
    expect(R06(base({ trades: [trade(60, 'buy', 'a'), late] }), c).status).toBe('unknown'); // early trades missed
    expect(R06(base({ trades: null }), c).status).toBe('unknown');
    const spread = ['a', 'b', 'c', 'd', 'e', 'f'].map((w, i) => trade(10 + i * 5, 'buy', w));
    expect(R06(base({ trades: [...spread, late] }), c).status).toBe('clear');
  });
  it('R07 shared funder', () => {
    const c = { ...cfg.rules.R07_SHARED_FUNDER, enabled: true };
    const f = (w: string, funder: string | null) => ({ wallet: w, funder });
    expect(R07(base({ earlyBuyerFunders: [f('a', 'X'), f('b', 'X'), f('c', 'X'), f('d', null)] }), c).status).toBe('hit');
    expect(R07(base({ earlyBuyerFunders: [f('a', 'X'), f('b', 'X'), f('c', null)] }), c).status).toBe('clear');
    expect(R07(base(), c).status).toBe('unknown');
  });
  it('R08 tiers: 0.03 clear, 0.0301 hit(10), 0.08 -> 10, 0.0801 -> 20', () => {
    const c = cfg.rules.R08_EXIT_IMPACT;
    // impact = S/(L/2+S) -> L = 2*S*(1/imp - 1)
    const L = (imp: number) => 2 * 10 * (1 / imp - 1);
    const run = (imp: number) => R08(base({ latest: snap({ liquidityUsd: L(imp) }) }), c);
    expect(run(0.03).status).toBe('clear');
    expect(run(0.0301).points).toBe(10);
    expect(run(0.08).points).toBe(10);
    expect(run(0.0801).points).toBe(20);
    expect(R08(base({ latest: snap({ liquidityUsd: null }) }), c).status).toBe('unknown');
  });
  it('R09 tiers', () => {
    const c = cfg.rules.R09_LOW_LIQ;
    const run = (l: number | null) => R09(base({ latest: snap({ liquidityUsd: l }) }), c);
    expect(run(5000).status).toBe('clear'); expect(run(4999).points).toBe(10);
    expect(run(1500).points).toBe(10); expect(run(1499).points).toBe(20); expect(run(null).status).toBe('unknown');
  });
  it('R10 needs >=3 snapshots', () => {
    const c = cfg.rules.R10_LIQ_DROP;
    const h = (...l: number[]) => l.map((x) => snap({ liquidityUsd: x }));
    expect(R10(base({ history: h(10000, 4000) }), c).status).toBe('unknown');
    expect(R10(base({ history: h(10000, 8000, 5000) }), c).status).toBe('hit');
    expect(R10(base({ history: h(10000, 8000, 5001) }), c).status).toBe('clear');
    expect(R10(base({ history: h(2900, 1000, 500) }), c).status).toBe('clear'); // peak < min
  });
  it('R11', () => {
    const c = cfg.rules.R11_THIN_CROWD;
    expect(R11(base({ latest: snap({ buyersH1: 14, volH1: 20001 }) }), c).status).toBe('hit');
    expect(R11(base({ latest: snap({ buyersH1: 15, volH1: 20001 }) }), c).status).toBe('clear');
    expect(R11(base({ latest: snap({ buyersH1: null, volH1: 20001 }) }), c).status).toBe('unknown');
  });
});

describe('engine', () => {
  it('bands at 24/25, 49/50, 74/75', () => {
    expect([24, 25, 49, 50, 74, 75].map((s) => bandFor(s, cfg.bands))).toEqual(['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH', 'EXTREME']);
  });
  it('caps score at 100 and is pure/deterministic', () => {
    const input = base({
      token: { id: 1, mint: 'M', creatorWallet: null, mintAuthority: 'A', freezeAuthority: 'B', authoritiesCheckedAt: 1 },
      holders: holders(50, 90), latest: snap({ liquidityUsd: 1000, buyersH1: 5, volH1: 50000 }),
      history: [snap({ liquidityUsd: 9000 }), snap({ liquidityUsd: 5000 }), snap({ liquidityUsd: 1000 })],
    });
    const a = evaluate(input, cfg), b = evaluate(input, cfg);
    expect(a.score).toBe(100); expect(a.band).toBe('EXTREME');
    expect(a.inputsHash).toBe(b.inputsHash);
    expect(a).toEqual(b);
  });
  it('completeness excludes disabled rules; unknown never counts as clear', () => {
    const j = evaluate(base(), cfg);
    expect(j.results.find((r) => r.ruleId === 'R07_SHARED_FUNDER')).toBeUndefined();
    expect(j.results).toHaveLength(10);
    // known: R08,R09,R10(1 snapshot->unknown),R11 -> 3 of 10
    expect(j.completeness).toBeCloseTo(3 / 10);
    const none = parseRuleConfig({ ...cfg, rules: Object.fromEntries(Object.entries(cfg.rules).map(([k, v]) => [k, { ...v, enabled: false }])) });
    expect(evaluate(base(), none).completeness).toBe(0);
  });
  it('hash changes when inputs change', () => {
    expect(evaluate(base(), cfg).inputsHash).not.toBe(evaluate(base({ latest: snap({ liquidityUsd: 9000 }) }), cfg).inputsHash);
  });
});

describe('exit estimate', () => {
  it('S=10, L=1000 -> 1.96%', () => {
    expect(exitImpact(10, 1000)! * 100).toBeCloseTo(1.9608, 3);
    const e = estimateExit(10, 1000, 1, 0.1)!;
    expect(e.impactPct).toBeCloseTo(1.96, 2);
    expect(e.receivedUsd).toBeCloseTo(10 * (1 - 10 / 510) * 0.99 - 0.1, 6);
    expect(estimateExit(10, null, 1, 0.1)).toBeNull();
    expect(estimateExit(10, 0, 1, 0.1)).toBeNull();
  });
});
