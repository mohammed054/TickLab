import { describe, it, expect } from 'vitest';
import bs58 from 'bs58';
import { parseSwapFromTx } from '../../src/main/wallet/parseSwap';
import { looksLikeSecret, validateAddress } from '../../src/main/wallet/address';
import { syncWallet, listUnlinked, linkUnlinked } from '../../src/main/wallet/import';
import { freshDb, seedToken, seedJudgement } from './helpers';
import { JournalService } from '../../src/main/journal/service';
import { loadDecisions } from '../../src/main/journal/outcomes';
import { WSOL_MINT } from '../../src/shared/constants';
import type { RpcTx } from '../../src/main/sources/solanaRpc';

const OWNER = bs58.encode(Buffer.alloc(32, 7));
const MINT = bs58.encode(Buffer.alloc(32, 9));
// SYNTHETIC swap transactions (real captures are a Phase 0 owner task, P0.5)
const tb = (mint: string, amount: string, decimals: number) => ({ accountIndex: 1, mint, owner: OWNER, uiTokenAmount: { amount, decimals } });
const tx = (o: { pre: number; post: number; fee?: number; preT?: unknown[]; postT?: unknown[]; err?: unknown; sig?: string; idx?: number }): RpcTx => {
  const keys = [{ pubkey: 'OTHER' }, { pubkey: 'OTHER2' }];
  keys[o.idx ?? 0] = { pubkey: OWNER };
  const pre = [0, 0], post = [0, 0];
  pre[o.idx ?? 0] = o.pre; post[o.idx ?? 0] = o.post;
  return {
    slot: 1, blockTime: 1_700_000_000,
    meta: { err: o.err ?? null, fee: o.fee ?? 5000, preBalances: pre, postBalances: post, preTokenBalances: o.preT ?? [], postTokenBalances: o.postT ?? [] },
    transaction: { signatures: [o.sig ?? 'SIG'], message: { accountKeys: keys, instructions: [] } },
  } as unknown as RpcTx;
};

describe('parseSwapFromTx', () => {
  it('buy: SOL spent by the fee payer, token received; fee excluded from the swap amount', () => {
    const r = parseSwapFromTx(tx({ pre: 2_000_000_000, post: 1_005_000_000, fee: 5000, postT: [tb(MINT, '1500000000', 6)] }), OWNER);
    expect(r).toMatchObject({ mint: MINT, side: 'buy', tokenAmount: 1500, feeSol: 0.000005 });
    expect(r!.solAmount).toBeCloseTo((2_000_000_000 - 1_005_000_000 - 5000) / 1e9, 9);
  });
  it('sell: SOL received, token sent', () => {
    const r = parseSwapFromTx(tx({ pre: 1_000_000_000, post: 1_500_000_000 - 5000, preT: [tb(MINT, '2000000', 6)], postT: [tb(MINT, '0', 6)] }), OWNER);
    expect(r).toMatchObject({ side: 'sell', tokenAmount: 2, mint: MINT });
    expect(r!.solAmount).toBeCloseTo(0.5, 9);
  });
  it('wSOL leg is folded into the SOL total', () => {
    const r = parseSwapFromTx(tx({ pre: 1_000_000_000, post: 1_000_000_000, fee: 0, idx: 1, preT: [tb(WSOL_MINT, '300000000', 9)], postT: [tb(WSOL_MINT, '0', 9), tb(MINT, '5000000', 6)] }), OWNER);
    expect(r).toMatchObject({ side: 'buy', tokenAmount: 5 });
    expect(r!.solAmount).toBeCloseTo(0.3, 9);
  });
  it('non-swap transfer, failed tx, multi-token, same-sign, other owner -> null', () => {
    expect(parseSwapFromTx(tx({ pre: 2e9, post: 1e9 }), OWNER)).toBeNull();
    expect(parseSwapFromTx(tx({ pre: 2e9, post: 1e9, postT: [tb(MINT, '1', 6)], err: { InstructionError: [0, 'x'] } }), OWNER)).toBeNull();
    expect(parseSwapFromTx(tx({ pre: 2e9, post: 1e9, postT: [tb(MINT, '1', 6), tb('Other', '1', 6)] }), OWNER)).toBeNull();
    expect(parseSwapFromTx(tx({ pre: 1e9, post: 2e9, postT: [tb(MINT, '1', 6)] }), OWNER)).toBeNull();
    expect(parseSwapFromTx(null, OWNER)).toBeNull();
    expect(parseSwapFromTx(tx({ pre: 2e9, post: 1e9, postT: [tb(MINT, '1', 6)] }), 'NOTOWNER')).toBeNull();
  });
});

describe('secret rejection', () => {
  it('rejects seed phrases and 64-byte keys; accepts a real address', () => {
    expect(looksLikeSecret('abandon ability able about above absent absorb abstract absurd abuse access accident')).toBe(true);
    expect(looksLikeSecret(bs58.encode(Buffer.alloc(64, 3)))).toBe(true);
    expect(looksLikeSecret(`[${Array(64).fill(1).join(',')}]`)).toBe(true);
    expect(looksLikeSecret('a'.repeat(64))).toBe(true);
    expect(looksLikeSecret(OWNER)).toBe(false);
    expect(validateAddress(OWNER)).toEqual({ ok: true, address: OWNER });
    expect(validateAddress(bs58.encode(Buffer.alloc(64, 3)))).toMatchObject({ ok: false, message: 'That looks like a secret. Never paste secrets here.' });
    expect(validateAddress('hello')).toMatchObject({ ok: false });
  });
});

describe('syncWallet + linking', () => {
  const NOW = 1_700_000_100_000;
  const HOUR = Math.floor(1_700_000_000_000 / 3_600_000) * 3_600_000;
  function setup() {
    const ctx = freshDb();
    ctx.settings.set('wallet.address', OWNER);
    const sigs = [{ signature: 'S2', slot: 2, blockTime: 2, err: null }, { signature: 'S1', slot: 1, blockTime: 1, err: null }];
    const txs: Record<string, RpcTx> = {
      S1: tx({ pre: 2e9, post: 1e9 - 5000, sig: 'S1', postT: [tb(MINT, '1000000000', 6)] }),
      S2: tx({ pre: 1e9, post: 2e9 - 5000, sig: 'S2', preT: [tb(MINT, '1000000000', 6)], postT: [tb(MINT, '0', 6)] }),
    };
    let calls = 0;
    const untils: (string | undefined)[] = [];
    const rpc = {
      signatures: async (_a: string, o: { until?: string }) => { untils.push(o.until); return { ok: true as const, value: calls++ === 0 ? sigs : [] }; },
      transaction: async (s: string) => ({ ok: true as const, value: txs[s] ?? null }),
    } as never;
    return { ...ctx, rpc, untils };
  }
  it('imports parsed swaps idempotently (twice = same rows) and uses a cursor', async () => {
    const s = setup();
    s.db.prepare('INSERT INTO sol_usd(hour_ts,price) VALUES(?,?)').run(HOUR, 150);
    const d = { db: s.db, settings: s.settings, rpc: s.rpc, now: () => NOW };
    expect(await syncWallet(d)).toEqual({ ok: true, value: { imported: 2, unlinked: 2 } });
    expect(await syncWallet(d)).toEqual({ ok: true, value: { imported: 0, unlinked: 2 } });
    expect(s.untils).toEqual([undefined, 'S2']);
    const rows = listUnlinked(s.db, NOW);
    expect(rows.map((r) => r.side).sort()).toEqual(['buy', 'sell']);
    expect(rows[0].usdValue).toBeCloseTo(rows[0].solAmount * 150);
  });
  it('requires an address', async () => {
    const s = setup();
    s.settings.set('wallet.address', null);
    expect(await syncWallet({ db: s.db, settings: s.settings, rpc: s.rpc, now: () => NOW })).toMatchObject({ ok: false });
  });
  it('linking creates a wallet fill; suggestion shown; never auto-links', async () => {
    const s = setup();
    const t = seedToken(s.db, 1, NOW - 1e6, NOW, { liquidityUsd: 1000 });
    s.db.prepare('UPDATE tokens SET mint=? WHERE id=?').run(MINT, t.tokenId);
    seedJudgement(s.db, t.tokenId, t.poolId);
    const svc = new JournalService(s.db, s.settings, () => NOW);
    svc.ensureInitialDeposits();
    const dec = svc.createDecision({ account: 'real', tokenId: t.tokenId, poolId: t.poolId, sizeUsd: 10, stopRule: 's', targetRule: 't', thesis: 'a sufficiently long thesis text', acknowledgedFlags: true });
    if (!dec.ok) throw new Error(dec.error.message);
    s.db.prepare('INSERT INTO sol_usd(hour_ts,price) VALUES(?,?)').run(HOUR, 150);
    await syncWallet({ db: s.db, settings: s.settings, rpc: s.rpc, now: () => NOW });
    const buy = listUnlinked(s.db, NOW).find((r) => r.side === 'buy')!;
    expect(buy.suggestedDecisionId).toBe(dec.value.decisionId);
    expect(loadDecisions(s.db, 'real', NOW)[0].entry).toBeNull();
    expect(linkUnlinked(s.db, svc, buy.id, dec.value.decisionId, 'exit').ok).toBe(false);
    expect(linkUnlinked(s.db, svc, buy.id, dec.value.decisionId, 'entry').ok).toBe(true);
    const d = loadDecisions(s.db, 'real', NOW)[0];
    expect(d.entry?.source).toBe('wallet');
    expect(d.entry?.txSig).toBeTruthy();
    expect(linkUnlinked(s.db, svc, buy.id, dec.value.decisionId, 'entry').ok).toBe(false);
  });
});
