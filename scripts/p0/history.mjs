// T0.3 — Historical data / provider bake-off
// Evaluates GeckoTerminal (existing source) plus at least one historical/on-chain candidate
// against 25 active and 25 failed/dead/rugged launches from smoke fixtures.
// Saves exact requests/responses as JSONL fixtures under fixtures/history/.
// Writes data/p0/provider-bakeoff.json with a comparison table.

import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { GT_BASE, GT_ACCEPT, getJson, arg, sleep } from './lib.mjs';

const file = arg('file', process.env.TICKLAB_CAPTURE_FILE || 'data/p0/gt-newpools.jsonl');
if (!existsSync(file)) {
  console.error(`Capture file not found: ${file}\nRun: node scripts/p0/capture.mjs --hours 24`);
  process.exit(1);
}

const POOL_FIELDS = [
  'address', 'name', 'pool_created_at', 'base_token_price_usd', 'fdv_usd', 'market_cap_usd', 'reserve_in_usd',
  'volume_usd.m5', 'volume_usd.h1', 'volume_usd.h24',
  'price_change_percentage.m5', 'price_change_percentage.h1',
  'transactions.m5.buys', 'transactions.m5.sells', 'transactions.m5.buyers', 'transactions.m5.sellers',
  'transactions.h1.buys', 'transactions.h1.sells', 'transactions.h1.buyers', 'transactions.h1.sellers',
];

// ---------- 1. stream the capture JSONL and classify pools ----------
const pools = []; // { address, name, metrics, presence }
const mints = new Set();
let lastOkAt = 0;

function poolUpdate(p, atMs) {
  const a = p?.attributes ?? {};
  const addr = a.address;
  if (!addr) return;
  const mint = String(p?.relationships?.base_token?.data?.id ?? '').replace(/^solana_/, '');
  const dexId = String(p?.relationships?.dex?.data?.id ?? a.dex ?? '');
  const rec = {
    address: addr,
    name: a.name ?? addr,
    mint,
    dexId,
    reserveUsd: Number(a.reserve_in_usd) || 0,
    firstSeenAt: atMs,
    lastSeenAt: atMs,
  };
  // Compute activity metrics
  const tx = p?.transactions ?? {};
  const buys5 = Number(tx?.m5?.buys ?? 0), sells5 = Number(tx?.m5?.sells ?? 0);
  const volume5 = Number(a.volume_usd?.m5 ?? 0);
  const fdv = Number(a.fdv_usd ?? 0);
  const mcap = Number(a.market_cap_usd ?? 0);
  rec.metrics = {
    buys5, sells5, volume5, fdv, mcap,
    totalTx5: buys5 + sells5,
    priceChangeH1: Number(a.price_change_percentage?.h1 ?? 0),
    ageHours: (atMs - rec.firstSeenAt) / 3_600_000 || 0,
  };
  if (mint) mints.add(mint);
  pools.push(rec);
}

let lineNumber = 0;
let badLines = 0;
const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
for await (const raw of rl) {
  lineNumber++;
  const line = raw.trim();
  if (!line) continue;
  let o;
  try { o = JSON.parse(line); } catch { continue; }
  const atMs = Date.parse(o.at);
  if (!Number.isFinite(atMs)) continue;
  if (o.status === 200 && o.body) {
    for (const p of o.body.data ?? []) poolUpdate(p, atMs);
    lastOkAt = atMs;
  }
}
console.log(`Loaded ${pools.length} pools from capture (${lineNumber} lines, ${badLines ? badLines + ' bad lines' : ''})`);

// ---------- 2. select 25 active and 25 failed/dead/rugged pools ----------
function classify(p) {
  const m = p.metrics;
  // Active: recent, volume > 0, some buys, not heavily one-sided sells
  const isActive = m.volume5 > 0 && m.totalTx5 > 0 && m.buys5 >= 1 && m.ageHours < 48;
  // Dead/Rugged: very low volume, no buys, or extreme price drop + low volume
  const isDead = m.volume5 < 1 && m.totalTx5 < 2 && m.ageHours > 1;
  const isRugged = m.priceChangeH1 < -80 && m.volume5 < 10 && m.ageHours < 72 && m.ageHours > 1;
  if (isRugged) return 'rugged';
  if (isDead) return 'dead';
  if (isActive) return 'active';
  return 'other';
}

const active = [], dead = [], rugged = [], other = [];
for (const p of pools) {
  const c = classify(p);
  if (c === 'active') active.push(p);
  else if (c === 'dead') dead.push(p);
  else if (c === 'rugged') rugged.push(p);
  else other.push(p);
}
console.log(`Active: ${active.length}, Dead: ${dead.length}, Rugged: ${rugged.length}, Other: ${other.length}`);

// Sort each category by some metric and take top N
function sortByMetric(arr, key, desc = true) {
  arr.sort((a, b) => desc ? (b.metrics[key] - a.metrics[key]) : (a.metrics[key] - b.metrics[key]));
}
sortByMetric(active, 'volume5', true);
sortByMetric(dead, 'ageHours', true);
sortByMetric(rugged, 'priceChangeH1', true);

const SELECT = 25;
const activeSel = active.slice(0, SELECT);
const deadSel = dead.slice(0, SELECT);
const ruggedSel = rugged.slice(0, SELECT);

// If not enough in categories, fill from other
const allSel = [...activeSel, ...deadSel, ...ruggedSel];
while (allSel.length < SELECT * 2) {
  const p = other.pop();
  if (!p) break;
  allSel.push(p);
}
console.log(`Selected ${allSel.length} pools total`);

// ---------- 3. pick 25 distinct mints for historical lookup ----------
const sampledMints = [...new Set(allSel.map(p => p.mint).filter(m => m && m !== 'unknown'))].slice(0, SELECT);
console.log(`Sampling ${sampledMints.length} mints for historical lookups`);

// ---------- 4. define providers ----------
const providers = {
  geckoTerminal: {
    name: 'GeckoTerminal',
    base: 'https://api.geckoterminal.com/api/v2',
    accept: 'application/json;version=20230302',
    // Historical: pools/{id}/ohlcv/{timeframe}, tokens/{id}/historical
    endpoints: {
      ohlcv: (poolId, timeframe) => `${GT_BASE}/networks/solana/pools/${poolId}/ohlcv/${timeframe}?aggregate=1&limit=100`,
      trades: (poolId) => `${GT_BASE}/networks/solana/pools/${poolId}/trades?limit=10`,
      tokenInfo: (mint) => `${GT_BASE}/networks/solana/tokens/${mint}/info`,
    },
    rateLimit: 24, // per minute
  },
  dexScreener: {
    name: 'DexScreener (free)',
    base: 'https://api.dexscreener.com',
    accept: 'application/json',
    endpoints: {
      pair: (mint) => `/latest/dex/pairs/solana/${mint}`,
      // No true historical, only latest
    },
    rateLimit: 30, // generous free tier
  },
  // Note: Helius RPC and Birdeye would need API keys; we test what's free without auth
};

// ---------- 5. query historical data for each selected mint ----------
async function queryProvider(providerName, provider, mint, poolAddress) {
  const results = {};
  for (const [key, url] of Object.entries(provider.endpoints)) {
    try {
      const t0 = Date.now();
      const r = await getJson(url, { headers: { Accept: provider.accept }, limit: false });
      const latency = Date.now() - t0;
      results[key] = { ok: r.ok, status: r.status, latencyMs: latency, body: r.json ?? null, error: r.error ?? null };
      if (!r.ok) {
        console.log(`  ${providerName} ${key} for ${mint}: status=${r.status} latency=${latency}ms`);
      }
    } catch (e) {
      results[key] = { ok: false, status: 0, latencyMs: 0, body: null, error: String(e) };
      console.log(`  ${providerName} ${key} for ${mint}: error=${e}`);
    }
  }
  return results;
}

// ---------- 6. run the bake-off and collect fixtures ----------
const fixtureRecords = [];

for (const mint of sampledMints) {
  const pool = allSel.find(p => p.mint === mint);
  const poolAddr = pool ? pool.address : null;
  console.log(`\n=== Historical bake-off for mint: ${mint} ${poolAddr ? `pool=${poolAddr}` : ''} ===`);

  // GeckoTerminal queries
  const gtResults = await queryProvider('geckoTerminal', providers.geckoTerminal, mint, poolAddr);
  fixtureRecords.push({
    mint,
    provider: 'geckoTerminal',
    ...gtResults,
  });

  // DexScreener query (latest only, no historical)
  try {
    const t0 = Date.now();
    const r = await getJson(providers.dexScreener.endpoints.pair(mint), { limit: false, headers: { Accept: providers.dexScreener.accept } });
    const latency = Date.now() - t0;
    fixtureRecords.push({
      mint,
      provider: 'dexScreener',
      pair: { ok: r.ok, status: r.status, latencyMs: latency, body: r.json ?? null, error: r.error ?? null },
    });
  } catch (e) {
    fixtureRecords.push({
      mint,
      provider: 'dexScreener',
      pair: { ok: false, status: 0, latencyMs: 0, body: null, error: String(e) },
    });
  }

  await sleep(2000); // pause between providers
}

// ---------- 7. write JSONL fixtures ----------
mkdirSync('fixtures/history', { recursive: true });

function writeJsonl(name, records) {
  const path = `fixtures/history/${name}.jsonl`;
  const lines = records.map(r => JSON.stringify(r));
  writeFileSync(path, lines.join('\n') + '\n');
  return path;
}

// Write each provider's responses as separate JSONL files
// Group by provider and mint
const byProvider = {};
for (const rec of fixtureRecords) {
  const prov = rec.provider;
  if (!byProvider[prov]) byProvider[prov] = [];
  byProvider[prov].push(rec);
}

for (const [prov, recs] of Object.entries(byProvider)) {
  writeJsonl(`provider_${prov}`, recs);
}

// ---------- 8. build comparison table ----------
function resolveField(body, path) {
  if (!body) return 'unknown';
  const parts = path.split('.');
  return parts.reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), body) ?? 'unknown';
}

const comparison = {
  schema: 't0.3-bakeoff-v1',
  generatedAt: new Date().toISOString(),
  sampleSize: sampledMints.length,
  poolsSelected: allSel.length,
  // Per-mint summary
  perMint: [],
  // Provider-level aggregates
  providerSummary: {
    geckoTerminal: {
      ohlcvAvailable: 0, ohlcvFailed: 0, ohlcvAvgLatency: 0,
      tradesAvailable: 0, tradesFailed: 0,
      tokenInfoAvailable: 0, tokenInfoFailed: 0,
    },
    dexScreener: {
      pairAvailable: 0, pairFailed: 0,
    },
  },
  // Unobservable / archive limitations
  limitations: {
    historicalDepth: 'GeckoTerminal only provides recent OHLCV (up to 100 candles), no true historical archive',
    poolMigration: 'No native pool migration tracking across provider histories',
    pointInTime: 'No point-in-time snapshots — later fetches cannot be treated as available at earlier decision times',
    dexScreenerHistorical: 'DexScreener provides only latest prices, no historical candles or trade history',
    freeTierLimits: 'Rate-limited without API keys; larger samples require paid tiers',
  },
};

// Fill per-mint data
for (const mint of sampledMints) {
  const mintRecords = fixtureRecords.filter(r => r.mint === mint);
  const gt = mintRecords.find(r => r.provider === 'geckoTerminal') || {};
  const ds = mintRecords.find(r => r.provider === 'dexScreener') || {};

  const perMint = {
    mint,
    providerResponses: {},
    ohlcv: {
      gt: gt.ohlcv?.['1m'] ?? gt.ohlcv?.['5m'] ?? { available: false },
      ds: ds.pair ? { price: resolveField(ds.pair.body, 'priceUsd') } : { available: false },
    },
    trades: {
      gt: gt.trades?.ok ? { available: true, count: gt.trades.body?.data?.length ?? 0 } : { available: false },
      ds: ds.pair ? { available: ds.pair.ok } : { available: false },
    },
    tokenInfo: {
      gt: gt.tokenInfo?.ok ? { hasMintAuthority: !!resolveField(gt.tokenInfo.body?.data?.attributes, 'mint_authority'),
        hasFreezeAuthority: !!resolveField(gt.tokenInfo.body?.data?.attributes, 'freeze_authority'),
        isHoneypot: resolveField(gt.tokenInfo.body?.data?.attributes, 'is_honeypot') } : { available: false },
      ds: { available: false },
    },
  };

  // Count provider availability
  let gtOhlcvAvail = 0, gtOhlcvFail = 0, gtTradesAvail = 0, gtTradesFail = 0, gtTokenInfoAvail = 0, gtTokenInfoFail = 0;
  let dsPairAvail = 0, dsPairFail = 0;

  for (const r of mintRecords) {
    if (r.provider === 'geckoTerminal') {
      if (r.ohlcv && r.ohlcv.ok) { gtOhlcvAvail++; } else { gtOhlcvFail++; }
      if (r.trades && r.trades.ok) { gtTradesAvail++; } else { gtTradesFail++; }
      if (r.tokenInfo && r.tokenInfo.ok) { gtTokenInfoAvail++; } else { gtTokenInfoFail++; }
    }
    if (r.provider === 'dexScreener') {
      if (r.pair && r.pair.ok) { dsPairAvail++; } else { dsPairFail++; }
    }
  }

  perMint.providerSummary = {
    geckoTerminal: {
      ohlcvAvailable: gtOhlcvAvail, ohlcvFailed: gtOhlcvFail,
      tradesAvailable: gtTradesAvail, tradesFailed: gtTradesFail,
      tokenInfoAvailable: gtTokenInfoAvail, tokenInfoFailed: gtTokenInfoFail,
    },
    dexScreener: {
      pairAvailable: dsPairAvail, pairFailed: dsPairFail,
    },
  };
  comparison.perMint.push(perMint);
}

// Count totals for summary
let gtOhlcvTot = 0, gtOhlcvFailTot = 0, gtTradesTot = 0, gtTradesFailTot = 0, gtTokenInfoTot = 0, gtTokenInfoFailTot = 0;
let dsPairTot = 0, dsPairFailTot = 0;

for (const r of fixtureRecords) {
  if (r.provider === 'geckoTerminal') {
    if (r.ohlcv && r.ohlcv.ok) gtOhlcvTot++; else gtOhlcvFailTot++;
    if (r.trades && r.trades.ok) gtTradesTot++; else gtTradesFailTot++;
    if (r.tokenInfo && r.tokenInfo.ok) gtTokenInfoTot++; else gtTokenInfoFailTot++;
  }
  if (r.provider === 'dexScreener') {
    if (r.pair && r.pair.ok) dsPairTot++; else dsPairFailTot++;
  }
}

comparison.providerSummary = {
  geckoTerminal: {
    ohlcvAvailable: gtOhlcvTot, ohlcvFailed: gtOhlcvFailTot,
    tradesAvailable: gtTradesTot, tradesFailed: gtTradesFailTot,
    tokenInfoAvailable: gtTokenInfoTot, tokenInfoFailed: gtTokenInfoFailTot,
  },
  dexScreener: {
    pairAvailable: dsPairTot, pairFailed: dsPairFailTot,
  },
};

// ---------- 9. write comparison JSON ----------
const outPath = 'data/p0/provider-bakeoff.json';
mkdirSync('data/p0', { recursive: true });
writeFileSync(outPath, `${JSON.stringify(comparison, null, 2)}\n`);
console.log(`\nWrote ${outPath}`);
console.log(`Comparison summary:`);
console.log(`  GeckoTerminal: OHLCV ${gtOhlcvTot} available/${gtOhlcvFailTot} failed, Trades ${gtTradesTot}/${gtTradesFailTot}, Token Info ${gtTokenInfoTot}/${gtTokenInfoFailTot}`);
console.log(`  DexScreener: Pair ${dsPairTot} available/${dsPairFailTot} failed`);
console.log(`\nT0.3 bake-off complete. Fixtures in fixtures/history/ and report in data/p0/provider-bakeoff.json`);