import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SolanaRpc } from '../../src/main/sources/solanaRpc';

const fx = (n: string) => JSON.parse(readFileSync(`fixtures/rpc/${n}.json`, 'utf8'));
function rpc(respond: (m: string, p: unknown[]) => unknown, credits: Record<string, number> = { default: 1 }) {
  const calls: { m: string; url: string }[] = []; const used: [string, number][] = [];
  const fetchImpl = (async (url: string, init: { body: string }) => { const b = JSON.parse(init.body); calls.push({ m: b.method, url }); return new Response(JSON.stringify(respond(b.method, b.params)), { status: 200 }); }) as unknown as typeof fetch;
  return { r: new SolanaRpc({ url: () => 'https://rpc.example/', apiKey: () => 'KEY', creditCost: () => credits, onCredits: (m, c) => used.push([m, c]), fetchImpl, sleep: async () => undefined }), calls, used };
}
const M = 'So11111111111111111111111111111111111111112';

describe('SolanaRpc (synthetic fixtures)', () => {
  it('mintInfo: active authority, revoked authority, decimals, supply', async () => {
    const a = await rpc(() => fx('getAccountInfo.mint-authority-active.synthetic')).r.mintInfo(M);
    expect(a).toEqual({ ok: true, value: { mintAuthority: '4DE7eXJcULzPG87VsMzFjAMnPmRv2b2na2sMEgQ2cJ3j', freezeAuthority: null, decimals: 6, supply: 1e9 } });
    const b = await rpc(() => fx('getAccountInfo.mint-revoked.synthetic')).r.mintInfo(M);
    expect(b.ok && b.value.mintAuthority).toBeNull();
  });
  it('credit accounting uses the cost table and default', async () => {
    const { r, used } = rpc(() => ({ result: { value: [] } }), { default: 1, getTokenLargestAccounts: 5 });
    await r.largestAccounts(M); await r.multipleAccounts([M]);
    expect(used).toEqual([['getTokenLargestAccounts', 5], ['getMultipleAccounts', 1]]);
  });
  it('api key appended to the URL, never to the body', async () => {
    const { r, calls } = rpc(() => ({ result: { value: [] } }));
    await r.largestAccounts(M); expect(calls[0].url).toBe('https://rpc.example/?api-key=KEY');
  });
  it('RPC error and bad shapes become Results', async () => {
    expect(await rpc(() => ({ error: { code: -32005, message: 'rate limited' } })).r.largestAccounts(M)).toMatchObject({ ok: false, error: { code: 'RPC_ERROR' } });
    expect(await rpc(() => ({ result: 'nope' })).r.largestAccounts(M)).toMatchObject({ ok: false, error: { code: 'PARSE_FAIL' } });
    expect(await rpc(() => ({ result: { value: null } })).r.mintInfo(M)).toMatchObject({ ok: false, error: { code: 'PARSE_FAIL' } });
  });
  it('multipleAccounts maps missing accounts to exists=false', async () => {
    const { r } = rpc(() => ({ result: { value: [null, { owner: '11111111111111111111111111111111', lamports: 5, data: { parsed: { type: 'x' } } }] } }));
    const res = await r.multipleAccounts(['A', 'B']);
    expect(res.ok && res.value.map((x) => x.exists)).toEqual([false, true]);
  });
});
