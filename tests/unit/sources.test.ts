import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { indexIncluded, normalizePool, normalizeTrade, cleanText, num, isBase58Addr } from '../../src/main/sources/normalize';
import { GeckoTerminalClient } from '../../src/main/sources/geckoterminal';
import { TokenBucket } from '../../src/main/net/tokenBucket';

const fx = (n: string) => JSON.parse(readFileSync(`fixtures/gt/${n}.json`, 'utf8'));
const np = fx('new_pools.synthetic'), tr = fx('trades.synthetic'), oh = fx('ohlcv.synthetic');
const inc = indexIncluded(np.included);

describe('normalizePool (synthetic fixture)', () => {
  it('parses a normal pool; null mcap stays null; FDV not substituted', () => {
    const r = normalizePool(np.data[0], inc);
    if (!r.ok || r.value.kind !== 'ok') throw new Error('x');
    const v = r.value.value;
    expect(v.token.symbol).toBe('ONE'); expect(v.pool.quoteSymbol).toBe('SOL'); expect(v.pool.dex).toBe('Raydium');
    expect(v.snapshot.liquidityUsd).toBe(4000); expect(v.snapshot.mcapUsd).toBeNull(); expect(v.snapshot.fdvUsd).toBe(100000);
    expect(v.snapshot.buyersH1).toBe(31); expect(v.pool.createdAtChain).toBe(Date.parse('2026-10-07T11:59:00Z'));
    expect(isBase58Addr(v.token.mint)).toBe(true);
  });
  it('truncates, strips control chars, keeps hostile text as plain data', () => {
    const r = normalizePool(np.data[2], inc);
    if (!r.ok || r.value.kind !== 'ok') throw new Error('x');
    expect(r.value.value.token.name.length).toBeLessThanOrEqual(64);
    // eslint-disable-next-line no-control-regex
    expect(r.value.value.token.name).not.toMatch(/[\u0000-\u001f]/);
    expect(r.value.value.token.symbol.length).toBeLessThanOrEqual(32);
  });
  it('skips non SOL/USDC/USDT quotes and rejects invalid base58', () => {
    const s = normalizePool(np.data[3], inc); expect(s).toEqual({ ok: true, value: { kind: 'skipped', reason: 'quote' } });
    const b = normalizePool(np.data[4], inc); expect(b).toMatchObject({ ok: false, error: { code: 'PARSE_FAIL' } });
  });
  it('garbage input -> PARSE_FAIL, never throws', () => {
    for (const g of [null, 1, 'x', {}, { attributes: {} }, { attributes: { address: 'a' } }]) expect(normalizePool(g, inc).ok).toBe(false);
  });
  it('helpers', () => {
    expect(num('1.5')).toBe(1.5); expect(num('abc')).toBeNull(); expect(num(Infinity)).toBeNull(); expect(num(null)).toBeNull(); expect(num('')).toBeNull();
    expect(cleanText('a\u0000b\n c', 10)).toBe('ab c'); expect(cleanText('x'.repeat(100), 5)).toBe('xxxxx');
  });
});

describe('normalizeTrade', () => {
  it('maps buy/sell sides to base-token amount and price', () => {
    const b = normalizeTrade(tr.data[0], 7, 1); const s = normalizeTrade(tr.data[1], 7, 1);
    expect(b).toMatchObject({ ok: true, value: { side: 'buy', tokenAmount: 15000, priceUsd: 0.0001, usdValue: 225, poolId: 7 } });
    expect(s).toMatchObject({ ok: true, value: { side: 'sell', tokenAmount: 8000, priceUsd: 0.00013 } });
    expect(normalizeTrade(tr.data[2], 7, 1).ok).toBe(false);
  });
});

function client(respond: (url: string) => { status: number; body: unknown }) {
  const urls: string[] = [];
  const fetchImpl = (async (u: string) => { urls.push(u); const r = respond(u); return new Response(JSON.stringify(r.body), { status: r.status }); }) as unknown as typeof fetch;
  const bucket = new TokenBucket(6, 10);
  return { c: new GeckoTerminalClient({ bucket, fetchImpl, sleep: async () => undefined }), urls, bucket };
}

describe('GeckoTerminalClient', () => {
  it('newPools parses fixture: 3 ok, 1 skipped, 1 rejected', async () => {
    const { c, urls } = client(() => ({ status: 200, body: np }));
    const r = await c.newPools(2);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.pools).toHaveLength(3); expect(r.value.skippedQuote).toBe(1); expect(r.value.rejected).toBe(1);
    expect(urls[0]).toContain('/networks/solana/new_pools?include=base_token,quote_token,dex&page=2');
    expect(r.value.oldestCreatedAt).toBe(Date.parse('2026-10-07T11:57:00Z'));
  });
  it('unknown shape -> PARSE_FAIL not a throw', async () => {
    const { c } = client(() => ({ status: 200, body: { hello: 'world' } }));
    expect(await c.newPools()).toMatchObject({ ok: false, error: { code: 'PARSE_FAIL' } });
    const { c: c2 } = client(() => ({ status: 200, body: { data: [{ nope: 1 }, { nope: 2 }] } }));
    expect(await c2.newPools()).toMatchObject({ ok: false, error: { code: 'PARSE_FAIL' } });
  });
  it('429 penalizes the bucket', async () => {
    const { c, bucket } = client(() => ({ status: 429, body: {} }));
    expect(await c.newPools()).toMatchObject({ ok: false, error: { code: 'HTTP_429' } });
    expect(bucket.penalizedUntil).toBeGreaterThan(Date.now() + 50_000);
  });
  it('trades, ohlcv and poolsMulti validation', async () => {
    const { c } = client((u) => ({ status: 200, body: u.includes('ohlcv') ? oh : tr }));
    const t = await c.poolTrades('P', 1); expect(t.ok && t.value).toHaveLength(2);
    const t2 = await c.poolTrades('P', 1, 200); expect(t2.ok && t2.value).toHaveLength(1);
    const o = await c.poolOhlcv('P', '5m'); expect(o.ok && o.value[0].t).toBeLessThan(o.ok ? o.value[5].t : 0);
    expect(o.ok && o.value[0].o).toBe(1);
    expect((await c.poolsMulti([])).ok).toBe(false); expect((await c.poolsMulti(Array(31).fill('x'))).ok).toBe(false);
  });
});
