import { describe, it, expect, vi, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TokenBucket } from '../../src/main/net/tokenBucket';
import { getJson } from '../../src/main/net/http';

afterEach(() => { vi.useRealTimers(); });

describe('TokenBucket (fake clock)', () => {
  it('burst of 6 passes, 7th waits for refill', async () => {
    vi.useFakeTimers();
    const b = new TokenBucket(6, 0.4);
    const done: number[] = [];
    for (let i = 0; i < 7; i++) void b.take(1).then(() => done.push(i));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(2600);
    expect(done).toHaveLength(7);
  });
  it('penalize(60000) blocks everything for 60 s', async () => {
    vi.useFakeTimers();
    const b = new TokenBucket(6, 0.4);
    b.penalize(60_000);
    let got = false; void b.take(1, 2, 120_000).then((r) => { got = r.ok; });
    await vi.advanceTimersByTimeAsync(59_000); expect(got).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000); expect(got).toBe(true);
  });
  it('respects priority order, FIFO within priority', async () => {
    vi.useFakeTimers();
    const b = new TokenBucket(1, 1);
    await b.take(1); // drain
    const order: string[] = [];
    void b.take(1, 3).then(() => order.push('bg')); void b.take(1, 1).then(() => order.push('disc1'));
    void b.take(1, 0).then(() => order.push('user')); void b.take(1, 1).then(() => order.push('disc2'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(order).toEqual(['user', 'disc1', 'disc2', 'bg']);
  });
  it('times out after max wait', async () => {
    vi.useFakeTimers();
    const b = new TokenBucket(1, 0.001, 30_000); await b.take(1);
    let res: unknown; void b.take(1).then((r) => { res = r; });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(res).toMatchObject({ ok: false, error: { code: 'RATE_WAIT_TIMEOUT' } });
  });
});

describe('getJson (local mock server)', () => {
  let srv: Server;
  const serve = async (handler: Parameters<typeof createServer>[1]) => { srv = createServer(handler); await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${(srv.address() as AddressInfo).port}/`; };
  afterEach(() => new Promise<void>((r) => (srv ? srv.close(() => r()) : r())));
  const noSleep = async () => undefined;

  it('success parses JSON and counts one attempt', async () => {
    const url = await serve((_q, s) => { s.end('{"a":1}'); });
    let attempts = 0;
    const r = await getJson(url, { onAttempt: () => attempts++, sleep: noSleep });
    expect(r).toEqual({ ok: true, value: { status: 200, json: { a: 1 } } }); expect(attempts).toBe(1);
  });
  it('500 retries twice then fails (3 attempts, 3 errors)', async () => {
    let hits = 0; const url = await serve((_q, s) => { hits++; s.statusCode = 500; s.end('x'); });
    let attempts = 0, errors = 0; const waits: number[] = [];
    const r = await getJson(url, { onAttempt: () => attempts++, onError: () => errors++, sleep: async (ms) => { waits.push(ms); } });
    expect(r).toMatchObject({ ok: false, error: { code: 'HTTP_5XX' } }); expect(hits).toBe(3); expect(attempts).toBe(3); expect(errors).toBe(3); expect(waits).toEqual([1000, 3000]);
  });
  it('429 is not retried', async () => {
    let hits = 0; const url = await serve((_q, s) => { hits++; s.statusCode = 429; s.end('{}'); });
    expect(await getJson(url, { sleep: noSleep })).toMatchObject({ ok: false, error: { code: 'HTTP_429' } }); expect(hits).toBe(1);
  });
  it('404 -> HTTP_4XX without retry; bad JSON -> PARSE_FAIL', async () => {
    let hits = 0; const url = await serve((_q, s) => { hits++; s.statusCode = 404; s.end('{}'); });
    expect(await getJson(url, { sleep: noSleep })).toMatchObject({ ok: false, error: { code: 'HTTP_4XX' } }); expect(hits).toBe(1);
    await new Promise<void>((r) => srv.close(() => r()));
    const u2 = await serve((_q, s) => { s.end('<html>'); });
    expect(await getJson(u2, { sleep: noSleep })).toMatchObject({ ok: false, error: { code: 'PARSE_FAIL' } });
  });
  it('timeout retries then NET_TIMEOUT', async () => {
    let hits = 0; const url = await serve(() => { hits++; /* never respond */ });
    const r = await getJson(url, { timeoutMs: 50, retries: 1, sleep: noSleep });
    expect(r).toMatchObject({ ok: false, error: { code: 'NET_TIMEOUT' } }); expect(hits).toBe(2);
    srv.closeAllConnections();
  });
  it('unreachable host -> NET_OFFLINE', async () => {
    const r = await getJson('http://127.0.0.1:1/', { retries: 0, sleep: noSleep });
    expect(r).toMatchObject({ ok: false, error: { code: 'NET_OFFLINE' } });
  });
});
