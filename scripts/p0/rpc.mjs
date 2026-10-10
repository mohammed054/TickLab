// P0.4 — probe RPC methods on up to 50 tokens from the capture; success % + latency per method; save one fixture per method.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { loadEnv, arg, sleep } from './lib.mjs';

const env = loadEnv();
const url = process.env.SOLANA_RPC_URL || env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const file = 'data/p0/gt-newpools.jsonl';
if (!existsSync(file)) { console.error('Run capture.mjs first (needs data/p0/gt-newpools.jsonl).'); process.exit(1); }
const mints = new Map();
for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
  const o = JSON.parse(line);
  for (const p of o.body?.data ?? []) {
    const id = p?.relationships?.base_token?.data?.id;
    if (typeof id === 'string') mints.set(id.replace(/^solana_/, ''), p.attributes?.pool_created_at ?? null);
  }
}
const sample = [...mints.keys()].slice(0, Number(arg('n', '50')));
mkdirSync('fixtures/rpc', { recursive: true });
const stats = {}; const saved = new Set();
async function rpc(method, params, key) {
  const t0 = Date.now(); let ok = false, result = null;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
    const j = await res.json(); ok = res.ok && j.result !== undefined && !j.error; result = j;
  } catch { /* counted as failure */ }
  const s = (stats[key ?? method] ??= { calls: 0, ok: 0, ms: [] }); s.calls++; if (ok) s.ok++; s.ms.push(Date.now() - t0);
  if (ok && !saved.has(key ?? method)) { saved.add(key ?? method); writeFileSync(`fixtures/rpc/${key ?? method}.json`, JSON.stringify(result, null, 2)); }
  await sleep(150);
  return ok ? result.result : null;
}
for (const mint of sample) {
  await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }], 'getAccountInfo');
  await rpc('getTokenSupply', [mint], 'getTokenSupply');
  const big = await rpc('getTokenLargestAccounts', [mint], 'getTokenLargestAccounts');
  const addrs = (big?.value ?? []).slice(0, 20).map((a) => a.address);
  if (addrs.length) await rpc('getMultipleAccounts', [addrs, { encoding: 'jsonParsed' }], 'getMultipleAccounts');
  await rpc('getSignaturesForAddress', [mint, { limit: 10 }], 'getSignaturesForAddress');
}
const table = Object.entries(stats).map(([method, s]) => ({ method, calls: s.calls, successPct: +(100 * s.ok / s.calls).toFixed(1), medianMs: s.ms.sort((a, b) => a - b)[s.ms.length >> 1] }));
console.table(table);
console.info('Spec gates (03 §3.10): mint check success >= 95%. Creator derivation (>= 70% for tokens < 6 h) must be judged from getSignaturesForAddress + getTransaction fixtures; record provider dashboard credits before/after by hand.');
