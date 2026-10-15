// P0.2 / T0.2 — poll new_pools every 15 s for --hours, append raw responses to data/p0/gt-newpools.jsonl.
// T0.2 24-hour capture: node scripts/p0/capture.mjs --hours 24
// Safe to stop early (Ctrl+C) or re-run: lines append and fields.mjs analyzes the latest contiguous run.
import { statSync } from 'node:fs';
import { GT_BASE, GT_ACCEPT, getJson, appendJsonl, arg, sleep } from './lib.mjs';

const hours = Number(arg('hours', '0.05'));
const every = Number(arg('every', '15')) * 1000;
const file = 'data/p0/gt-newpools.jsonl';
let startBytes = 0;
try { startBytes = statSync(file).size; } catch { /* file not written yet */ }
const start = Date.now();
const end = start + hours * 3_600_000;
let calls = 0, errors = 0, n429 = 0, first429 = null, longest429 = 0, lastLog = start;
const addrs = new Set();

function summary(extra = {}) {
  const elapsedH = (Date.now() - start) / 3_600_000;
  let bytes = 0;
  try { bytes = statSync(file).size; } catch { /* file not written yet */ }
  const writtenBytes = Math.max(0, bytes - startBytes);
  return {
    calls, errors,
    errorRatePct: calls ? +(100 * errors / calls).toFixed(2) : 0,
    http429: n429,
    longest429Min: +(longest429 / 60000).toFixed(1),
    uniquePools: addrs.size,
    elapsedHours: +elapsedH.toFixed(3),
    bytes,
    writtenThisRunBytes: writtenBytes,
    bytesPerDayEstimate: elapsedH > 0 ? Math.round(writtenBytes / elapsedH * 24) : null,
    file,
    ...extra,
  };
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.info(JSON.stringify(summary({ stoppedEarly: true, note: 'partial run; run fields.mjs to analyze' }), null, 2));
    process.exit(0);
  });
}

while (Date.now() < end) {
  const t0 = Date.now();
  const r = await getJson(`${GT_BASE}/networks/solana/new_pools?include=base_token,quote_token,dex&page=1`, { headers: { Accept: GT_ACCEPT } });
  calls++;
  appendJsonl(file, { at: new Date().toISOString(), status: r.status, ms: r.ms, error: r.error ?? null, body: r.json });
  if (!r.ok) {
    errors++;
    if (r.status === 429) { n429++; first429 ??= Date.now(); longest429 = Math.max(longest429, Date.now() - first429); } else first429 = null;
    console.warn(`error status=${r.status} ${r.error ?? ''}`);
  } else {
    first429 = null;
    for (const p of r.json?.data ?? []) if (p?.attributes?.address) addrs.add(p.attributes.address);
  }
  if (Date.now() - lastLog >= 30 * 60_000) { lastLog = Date.now(); console.info(`progress ${JSON.stringify(summary())}`); }
  await sleep(Math.max(0, every - (Date.now() - t0)));
}
console.info(JSON.stringify(summary(), null, 2));
