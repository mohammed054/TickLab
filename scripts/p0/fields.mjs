// T0.2 — real GeckoTerminal fixtures + coverage report from the capture JSONL.
// Usage: node scripts/p0/fields.mjs [--hours 2] [--ref-cap 300] [--no-reference] [--file D:\moham\tickLab\gt-newpools.jsonl]
// The raw JSONL may live outside the repo (--file or TICKLAB_CAPTURE_FILE); fixtures and coverage.json stay in the repo.
// Writes fixtures/gt/*.real.json and data/p0/coverage.json. Never writes to docs/ (Planner-owned).
// Independent-reference comparison uses the free public DexScreener API (no key).
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { GT_BASE, GT_ACCEPT, getJson, arg, sleep } from './lib.mjs';

const file = arg('file', process.env.TICKLAB_CAPTURE_FILE || 'data/p0/gt-newpools.jsonl');
const windowHours = Number(arg('hours', '2'));
const refCap = Number(arg('ref-cap', '300'));
const useReference = !process.argv.includes('--no-reference');
const GAP_MS = 10 * 60_000; // a longer pause between polls marks the start of the latest capture run
const REF_BASE = 'https://api.dexscreener.com/latest/dex/tokens';
const UNKNOWN = 'unknown';

if (!existsSync(file)) {
  console.error(`Capture file not found: ${file}\nRun first: node scripts/p0/capture.mjs --hours 24`);
  process.exit(1);
}

const POOL_FIELDS = [
  'address', 'name', 'pool_created_at', 'base_token_price_usd', 'fdv_usd', 'market_cap_usd', 'reserve_in_usd',
  'volume_usd.m5', 'volume_usd.h1', 'volume_usd.h24',
  'price_change_percentage.m5', 'price_change_percentage.h1',
  'transactions.m5.buys', 'transactions.m5.sells', 'transactions.m5.buyers', 'transactions.m5.sellers',
  'transactions.h1.buys', 'transactions.h1.sells', 'transactions.h1.buyers', 'transactions.h1.sellers',
];
const TRADE_FIELDS = [
  'tx_hash', 'tx_from_address', 'kind', 'block_timestamp', 'block_number', 'volume_in_usd',
  'from_token_amount', 'to_token_amount', 'price_from_in_usd', 'price_to_in_usd',
];
const TOKEN_INFO_FIELDS = [
  'address', 'name', 'symbol', 'decimals', 'total_supply', 'price_usd', 'fdv_usd', 'market_cap_usd',
  'total_reserve_in_usd', 'volume_usd.h24', 'websites', 'twitter_handle', 'telegram_handle', 'discord_url', 'description',
  'image_url', 'gt_score', 'gt_verified', 'categories', 'holders', 'mint_authority', 'freeze_authority',
  'is_honeypot', 'developer_address', 'developer_holding_percentage',
];

const get = (o, p) => p.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);
const pct = (arr, p) => {
  if (!arr.length) return UNKNOWN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const round = (n, d = 2) => (Number.isFinite(n) ? +n.toFixed(d) : UNKNOWN);
const toGiB = (b) => round(b / 1024 ** 3, 2);
const normalizeDex = (d) => String(d ?? UNKNOWN).toLowerCase().replace(/^solana_/, '').replace(/[-_ ]/g, '');

// ---------- 1. stream the capture JSONL ----------
const warnings = [];
const http = { calls: 0, ok: 0, errors: 0, http429: 0, statusCounts: {}, firstError: null };
const lineStats = []; // { atMs, ms, status, count, bytes }
const pools = new Map(); // address -> { address, name, mint, dexId, reserveUsd, firstSeenAt, lastSeenAt, presence }
const mints = new Map(); // mint -> { mint, pool, firstSeenAt }
let lastOkBody = null;
let lastOkAt = 0;
let badLines = 0;

function poolUpdate(p, atMs) {
  const a = p?.attributes ?? {};
  const addr = a.address;
  if (!addr) return;
  const mint = String(p?.relationships?.base_token?.data?.id ?? UNKNOWN).replace(/^solana_/, '');
  const dexId = String(p?.relationships?.dex?.data?.id ?? a.dex ?? UNKNOWN);
  const rec = pools.get(addr) ?? { address: addr, name: a.name ?? UNKNOWN, mint, dexId, reserveUsd: -1, firstSeenAt: atMs, lastSeenAt: 0 };
  rec.name = a.name ?? rec.name;
  if (mint !== UNKNOWN) rec.mint = mint;
  if (dexId !== UNKNOWN) rec.dexId = dexId;
  rec.lastSeenAt = atMs;
  const rv = Number(a.reserve_in_usd);
  if (Number.isFinite(rv)) rec.reserveUsd = Math.max(rec.reserveUsd, rv);
  rec.presence = Object.fromEntries(POOL_FIELDS.map((f) => {
    const v = get(a, f);
    return [f, v === undefined ? 'absent' : v === null ? 'null' : 'present'];
  }));
  pools.set(addr, rec);
  if (mint !== UNKNOWN && !mints.has(mint)) mints.set(mint, { mint, pool: addr, firstSeenAt: atMs });
}

let lineNumber = 0;
const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
for await (const raw of rl) {
  lineNumber++;
  const line = raw.trim();
  if (!line) continue;
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    badLines++;
    continue;
  }
  const atMs = Date.parse(o.at);
  if (!Number.isFinite(atMs)) { badLines++; continue; }
  const count = o.body?.data?.length ?? 0;
  lineStats.push({ atMs, ms: Number(o.ms) || 0, status: Number(o.status) || 0, count, bytes: Buffer.byteLength(line) + 1 });
  if (o.status === 200 && o.body) {
    for (const p of o.body.data ?? []) poolUpdate(p, atMs);
    lastOkBody = o.body;
    lastOkAt = atMs;
  }
}
if (lineStats.length === 0) {
  console.error(`No usable capture lines in ${file}. Run: node scripts/p0/capture.mjs --hours 24`);
  process.exit(1);
}

// ---------- 2. isolate the latest contiguous capture run ----------
let runStart = 0;
for (let i = 1; i < lineStats.length; i++) if (lineStats[i].atMs - lineStats[i - 1].atMs > GAP_MS) runStart = i;
const run = lineStats.slice(runStart);
const runFirstAt = run[0].atMs;
const runLastAt = run[run.length - 1].atMs;
const runHours = (runLastAt - runFirstAt) / 3_600_000;
const runBytes = run.reduce((a, l) => a + l.bytes, 0);

for (const l of run) {
  http.calls++;
  http.statusCounts[l.status] = (http.statusCounts[l.status] ?? 0) + 1;
  if (l.status === 200) http.ok++;
  else {
    http.errors++;
    if (l.status === 429) http.http429++;
    if (!http.firstError) http.firstError = { at: new Date(l.atMs).toISOString(), status: l.status };
  }
}
const latencies = run.map((l) => l.ms);
const intervals = run.slice(1).map((l, i) => (l.atMs - run[i].atMs) / 1000);

const runPools = [...pools.values()].filter((p) => p.lastSeenAt >= runFirstAt);
const runMints = [...mints.values()].filter((m) => m.firstSeenAt >= runFirstAt);
const dexCounts = {};
for (const p of runPools) dexCounts[p.dexId] = (dexCounts[p.dexId] ?? 0) + 1;
const presenceTally = {};
for (const f of POOL_FIELDS) presenceTally[f] = { present: 0, null: 0, absent: 0 };
for (const p of runPools) {
  for (const f of POOL_FIELDS) presenceTally[f][p.presence?.[f] ?? 'absent']++;
}
const missingnessFields = Object.fromEntries(Object.entries(presenceTally).map(([f, t]) => {
  const total = t.present + t.null + t.absent;
  return [f, { present: t.present, null: t.null, absent: t.absent, presentPct: total ? round(100 * t.present / total, 1) : UNKNOWN }];
}));

const windowMs = Math.min(windowHours, runHours) * 3_600_000;
const windowStartMs = runLastAt - windowMs;
const windowPools = runPools.filter((p) => p.firstSeenAt >= windowStartMs);
const windowMintsAll = [...new Set(windowPools.map((p) => p.mint).filter((m) => m !== UNKNOWN))].sort((a, b) => (mints.get(a)?.firstSeenAt ?? 0) - (mints.get(b)?.firstSeenAt ?? 0));
const sampledMints = windowMintsAll.slice(0, refCap);
const sampledSet = new Set(sampledMints);

const coverage = {
  schema: 't0.2-coverage-v1',
  generatedAt: new Date().toISOString(),
  sourceFile: file,
  captureRun: {
    firstCallAt: new Date(runFirstAt).toISOString(),
    lastCallAt: new Date(runLastAt).toISOString(),
    durationHours: round(runHours, 3),
    calls: run.length,
    priorLinesOutsideRun: runStart,
    gapThresholdSec: GAP_MS / 1000,
  },
  http: { ...http, errorRatePct: round(100 * http.errors / http.calls, 2) },
  latencyMs: { p50: pct(latencies, 50), p95: pct(latencies, 95), max: Math.max(...latencies), samples: latencies.length },
  polling: {
    effectiveIntervalSec: { p50: round(pct(intervals, 50)), p95: round(pct(intervals, 95)), max: round(Math.max(...intervals)) },
    callsPerMinute: round(http.calls / Math.max(runHours * 60, 1 / 60), 2),
  },
  launches: {
    uniquePoolsInRun: runPools.length,
    uniqueBaseMintsInRun: runMints.length,
    poolsPerResponse: { p50: pct(run.map((l) => l.count), 50), max: Math.max(...run.map((l) => l.count)) },
    dexCounts,
  },
  missingness: { basedOnPools: runPools.length, note: 'presence over each pool\'s latest observed attributes; null and absent counted separately', fields: missingnessFields },
  bytesPerDay: {
    measuredBytes: runBytes,
    runHours: round(runHours, 3),
    bytesPerDay: runHours > 0 ? Math.round(runBytes / runHours * 24) : UNKNOWN,
    projection30DaysGiB: runHours > 0 ? toGiB(runBytes / runHours * 24 * 30) : UNKNOWN,
    projection90DaysGiB: runHours > 0 ? toGiB(runBytes / runHours * 24 * 90) : UNKNOWN,
  },
  badLines,
};

// ---------- 3. real fixtures (GeckoTerminal) ----------
mkdirSync('fixtures/gt', { recursive: true });
const H = { headers: { Accept: GT_ACCEPT } };
// GeckoTerminal can reject short bursts with 429 even under the per-minute cap; pace calls and retry.
async function gtGet(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await getJson(url, H);
    if (r.ok) return r;
    if (r.status === 429 && attempt < 3) { warnings.push(`429 on ${url} (attempt ${attempt}), retrying`); await sleep(attempt * 5000); continue; }
    return r;
  }
  return { ok: false, status: 429, error: 'rate-limited after retries' };
}
function writeFixture(name, provenance, responseBody) {
  const path = `fixtures/gt/${name}.real.json`;
  writeFileSync(path, `${JSON.stringify({ fixtureVersion: 1, provenance, responseBody }, null, 2)}\n`);
  return path;
}
const evidence = [];
function evidenceFromFields(endpoint, fixture, body, paths, subject) {
  if (!body) {
    evidence.push({ endpoint, fixture: null, status: 'NOT-CAPTURED', subject: subject ?? null, fields: [] });
    return;
  }
  evidence.push({
    endpoint, fixture, status: 'captured', subject: subject ?? null,
    fields: paths.map((f) => ({ field: f, status: get(body, f) !== undefined ? 'present' : 'MISSING' })),
  });
}

const candidates = [...runPools].sort((a, b) => (b.reserveUsd - a.reserveUsd) || (b.firstSeenAt - a.firstSeenAt)).slice(0, 40);

// new_pools: taken from the capture itself (exact body, dated by the capture)
let newPoolsFixture = null;
if (lastOkBody) {
  newPoolsFixture = writeFixture('new_pools', {
    capturedAt: new Date(lastOkAt).toISOString(),
    captureMethod: 'from-capture-jsonl', sourceFile: file, accept: GT_ACCEPT,
    endpoint: 'GET /networks/solana/new_pools?include=base_token,quote_token,dex&page=1', httpStatus: 200,
  }, lastOkBody);
}
evidenceFromFields('new_pools', newPoolsFixture, lastOkBody?.data?.[0]?.attributes, POOL_FIELDS);

// pools/multi: live fetch for the most liquid pools seen in the run
let multiBody = null;
let multiFixture = null;
const multiAddrs = candidates.slice(0, 10).map((p) => p.address);
if (multiAddrs.length > 0) {
  const r = await gtGet(`${GT_BASE}/networks/solana/pools/multi/${multiAddrs.join(',')}?include=base_token,quote_token,dex`);
  if (r.ok && r.json) {
    multiBody = r.json;
    multiFixture = writeFixture('pools_multi', {
      capturedAt: new Date().toISOString(), captureMethod: 'live-fetch', accept: GT_ACCEPT, latencyMs: r.ms,
      endpoint: `GET /networks/solana/pools/multi/{${multiAddrs.length} pool addresses}?include=base_token,quote_token,dex`,
      httpStatus: r.status,
    }, r.json);
  } else warnings.push(`pools/multi fetch failed: status ${r.status} ${r.error ?? ''}`);
  await sleep(600);
}
evidenceFromFields('pools/multi', multiFixture, multiBody?.data?.[0]?.attributes, POOL_FIELDS, { poolsRequested: multiAddrs.length, poolsReturned: multiBody?.data?.length ?? 0 });

// trades + ohlcv (+ token info): first candidate pool that serves both
let tradesBody = null, tradesFixture = null, ohlcvBody = null, ohlcvFixture = null, infoBody = null, infoFixture = null, subject = null;
for (const cand of candidates.slice(0, 5)) {
  const tr = await gtGet(`${GT_BASE}/networks/solana/pools/${cand.address}/trades`);
  await sleep(600);
  if (!tr.ok || !tr.json) { warnings.push(`trades failed for ${cand.address}: status ${tr.status}`); continue; }
  const oh = await gtGet(`${GT_BASE}/networks/solana/pools/${cand.address}/ohlcv/minute?aggregate=1&limit=100`);
  await sleep(600);
  if (!oh.ok || !oh.json) { warnings.push(`ohlcv failed for ${cand.address}: status ${oh.status}`); continue; }
  subject = { pool: cand.address, mint: cand.mint };
  tradesBody = tr.json;
  tradesFixture = writeFixture('trades', {
    capturedAt: new Date().toISOString(), captureMethod: 'live-fetch', accept: GT_ACCEPT, latencyMs: tr.ms,
    endpoint: `GET /networks/solana/pools/${cand.address}/trades`, httpStatus: tr.status,
  }, tr.json);
  ohlcvBody = oh.json;
  ohlcvFixture = writeFixture('ohlcv', {
    capturedAt: new Date().toISOString(), captureMethod: 'live-fetch', accept: GT_ACCEPT, latencyMs: oh.ms,
    endpoint: `GET /networks/solana/pools/${cand.address}/ohlcv/minute?aggregate=1&limit=100`, httpStatus: oh.status,
  }, oh.json);
  if (cand.mint && cand.mint !== UNKNOWN) {
    const inf = await gtGet(`${GT_BASE}/networks/solana/tokens/${cand.mint}/info`);
    if (inf.ok && inf.json) {
      infoBody = inf.json;
      infoFixture = writeFixture('token_info', {
        capturedAt: new Date().toISOString(), captureMethod: 'live-fetch', accept: GT_ACCEPT, latencyMs: inf.ms,
        endpoint: `GET /networks/solana/tokens/${cand.mint}/info`, httpStatus: inf.status,
      }, inf.json);
    } else warnings.push(`token info failed for mint ${cand.mint}: status ${inf.status}`);
  }
  break;
}
if (!tradesFixture) warnings.push('no candidate pool produced a trades fixture');
evidenceFromFields('trades', tradesFixture, tradesBody?.data?.[0]?.attributes, TRADE_FIELDS, subject);
if (ohlcvBody) {
  const list = get(ohlcvBody, 'data.attributes.ohlcv_list');
  evidence.push({
    endpoint: 'ohlcv', fixture: ohlcvFixture, status: 'captured', subject,
    fields: [
      { field: 'data.attributes.ohlcv_list is array', status: Array.isArray(list) ? 'present' : 'MISSING' },
      { field: 'ohlcv rows', status: Array.isArray(list) ? String(list.length) : 'MISSING' },
      { field: 'first row [timestamp,open,high,low,close,volume]', status: Array.isArray(list?.[0]) && list[0].length === 6 ? 'present' : 'MISSING' },
    ],
  });
} else evidenceFromFields('ohlcv', null, null, []);
evidenceFromFields('tokens/info', infoFixture, infoBody?.data?.attributes, TOKEN_INFO_FIELDS, subject ? { mint: subject.mint } : null);
coverage.fieldEvidence = evidence;

// ---------- 4. independent public reference (DexScreener) ----------
coverage.referenceComparison = { reference: 'api.dexscreener.com (free, no key)', status: 'skipped', sampleHours: round(windowMs / 3_600_000, 2) };
coverage.unsupportedVenues = { status: 'not-evaluated', list: [], note: 'venue set-difference vs reference; full venue coverage is T0.3' };
if (useReference && sampledMints.length > 0) {
  const ref = {
    reference: 'api.dexscreener.com (free, no key)',
    status: 'ok',
    sampleHours: round(windowMs / 3_600_000, 2),
    windowPools: windowPools.length,
    windowMints: windowMintsAll.length,
    mintsSampled: sampledMints.length,
    mintsTruncated: windowMintsAll.length > sampledMints.length,
    batches: 0, batchesOk: 0, batchesFailed: 0, batchErrors: [],
    refDexIds: [], dexIdsInCaptureWindow: [], dexIdsOnReferenceNotInCapture: [],
  };
  const refDexIds = new Set();
  const refDexCounts = {};
  const refPairsByPool = new Map();
  const knownMints = new Set();
  for (let i = 0; i < sampledMints.length; i += 30) {
    const batch = sampledMints.slice(i, i + 30);
    ref.batches++;
    let r;
    try {
      const res = await fetch(`${REF_BASE}/${batch.join(',')}`, { signal: AbortSignal.timeout(15_000) });
      r = { ok: res.ok, status: res.status, json: res.ok ? await res.json() : null };
    } catch (e) {
      r = { ok: false, status: 0, error: String(e?.name === 'TimeoutError' ? 'timeout' : e) };
    }
    if (r.ok && r.json) {
      ref.batchesOk++;
      const pairs = r.json.pairs ?? [];
      for (const pair of pairs) {
        if (pair.chainId !== 'solana') continue;
        const dexId = String(pair.dexId ?? UNKNOWN);
        refDexIds.add(dexId);
        refDexCounts[dexId] = (refDexCounts[dexId] ?? 0) + 1;
        if (pair.pairAddress) refPairsByPool.set(pair.pairAddress, { dexId, pairCreatedAt: pair.pairCreatedAt ?? null, baseToken: pair.baseToken?.address ?? null });
      }
      for (const m of batch) {
        if (pairs.some((p) => p.chainId === 'solana' && (p.baseToken?.address === m || p.quoteToken?.address === m))) knownMints.add(m);
      }
    } else {
      ref.batchesFailed++;
      ref.batchErrors.push({ status: r.status, error: r.error ?? null });
    }
    await sleep(1500);
  }
  if (ref.batchesOk === 0) {
    ref.status = 'failed';
    warnings.push('DexScreener reference comparison failed for every batch');
  }
  const windowPoolsSampled = windowPools.filter((p) => sampledSet.has(p.mint));
  const windowPoolAddrSet = new Set(windowPools.map((p) => p.address));
  const windowPoolsOnRef = windowPoolsSampled.filter((p) => refPairsByPool.has(p.address)).length;
  const missingFromCapture = [];
  for (const [addr, p] of refPairsByPool) {
    const created = typeof p.pairCreatedAt === 'number' ? p.pairCreatedAt : null;
    if (created !== null && created >= windowStartMs && !windowPoolAddrSet.has(addr) && sampledSet.has(p.baseToken)) {
      missingFromCapture.push({ pairAddress: addr, dexId: p.dexId, baseToken: p.baseToken, pairCreatedAt: new Date(created).toISOString() });
    }
  }
  const captureDexNorm = new Set(windowPools.map((p) => normalizeDex(p.dexId)));
  ref.dexIdsOnReferenceNotInCapture = [...refDexIds].filter((d) => !captureDexNorm.has(normalizeDex(d)));
  ref.mintsKnownToReference = knownMints.size;
  ref.mintsKnownToReferencePct = sampledMints.length ? round(100 * knownMints.size / sampledMints.length, 1) : UNKNOWN;
  ref.windowPoolsSampled = windowPoolsSampled.length;
  ref.windowPoolsSampledOnReference = windowPoolsOnRef;
  ref.windowPoolsSampledOnReferencePct = windowPoolsSampled.length ? round(100 * windowPoolsOnRef / windowPoolsSampled.length, 1) : UNKNOWN;
  ref.refDexIds = [...refDexIds];
  ref.refDexPairCounts = refDexCounts;
  ref.dexIdsInCaptureWindow = [...new Set(windowPools.map((p) => p.dexId))];
  ref.referencePoolsCreatedInWindowMissingFromCapture = missingFromCapture.slice(0, 50);
  ref.referencePoolsCreatedInWindowMissingFromCaptureCount = missingFromCapture.length;
  ref.notes = [
    'DexScreener dexId labels differ from GeckoTerminal dex ids; the set difference is indicative, not a mapping.',
    'Missing-from-capture counts only cover mints sampled above for the chosen window.',
  ];
  coverage.referenceComparison = ref;
  coverage.unsupportedVenues = {
    status: ref.batchesOk === 0 ? 'failed' : 'indicative-sample',
    list: ref.dexIdsOnReferenceNotInCapture,
    note: 'venues seen on the independent reference for sampled mints but not in the capture window; confirm names in T0.3',
  };
}

// ---------- 5. write + print ----------
const outFile = 'data/p0/coverage.json';
mkdirSync('data/p0', { recursive: true });
writeFileSync(outFile, `${JSON.stringify(coverage, null, 2)}\n`);
console.info(JSON.stringify({
  http: coverage.http,
  latencyMs: coverage.latencyMs,
  polling: coverage.polling.effectiveIntervalSec,
  launches: coverage.launches,
  bytesPerDay: coverage.bytesPerDay,
  fixtures: evidence.map((e) => ({ endpoint: e.endpoint, fixture: e.fixture, status: e.status })),
  reference: {
    status: coverage.referenceComparison.status,
    mintsSampled: coverage.referenceComparison.mintsSampled,
    knownPct: coverage.referenceComparison.mintsKnownToReferencePct,
    windowPoolsOnReferencePct: coverage.referenceComparison.windowPoolsSampledOnReferencePct,
    missingFromCapture: coverage.referenceComparison.referencePoolsCreatedInWindowMissingFromCaptureCount,
  },
  warnings,
}, null, 2));
console.info(`Wrote ${outFile}. Field evidence is in coverage.fieldEvidence; Planner folds verified fields into docs/build-spec/FIELDS.md.`);
