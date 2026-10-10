// Phase 0 helpers (P0.1): getJson with 10 s timeout + 24 calls/min limiter, appendJsonl, tiny .env loader.
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GT_BASE = 'https://api.geckoterminal.com/api/v2';
export const GT_ACCEPT = 'application/json;version=20230302'; // VERIFY in Phase 0
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function loadEnv(file = new URL('./.env', import.meta.url)) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2];
  }
  return out;
}

/** Sliding-window limiter: at most `perMinute` calls in any 60 s window. */
export function makeLimiter(perMinute = 24, now = () => Date.now(), wait = sleep) {
  const stamps = [];
  return async function take() {
    for (;;) {
      const cut = now() - 60_000;
      while (stamps.length && stamps[0] <= cut) stamps.shift();
      if (stamps.length < perMinute) { stamps.push(now()); return; }
      await wait(stamps[0] + 60_000 - now() + 5);
    }
  };
}
const limiter = makeLimiter(24);

export async function getJson(url, { headers = {}, timeoutMs = 10_000, limit = true } = {}) {
  if (limit) await limiter();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: ctl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep null; raw text returned */ }
    return { status: res.status, ok: res.ok, json, text, ms: Date.now() - started };
  } catch (e) {
    return { status: 0, ok: false, json: null, text: '', error: String(e?.name === 'AbortError' ? 'timeout' : e), ms: Date.now() - started };
  } finally { clearTimeout(t); }
}

export function appendJsonl(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(obj) + '\n');
}

export function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--selftest')) {
  let t = 0; const delays = [];
  const take = makeLimiter(24, () => t, async (ms) => { delays.push(ms); t += ms; });
  for (let i = 1; i <= 25; i++) await take();
  const ok = delays.length >= 1 && delays[0] >= 59_000;
  console.info(`25th call was delayed ${delays[0] ?? 0} ms (virtual clock)`);
  console.info(ok ? 'OK' : 'FAIL');
  process.exit(ok ? 0 : 1);
}
