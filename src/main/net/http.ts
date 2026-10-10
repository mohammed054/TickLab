// docs/03 §3.3 — JSON GET with timeout, retries (network/timeout/5xx: 1 s then 3 s), no retry on 429 / other 4xx.
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';

export interface HttpHooks {
  /** Called once per attempt (increments api_usage.calls). */
  onAttempt?: () => void;
  /** Called for every failed attempt (increments errors + error_log). */
  onError?: (code: string, message: string) => void;
}
export interface GetJsonOpts extends HttpHooks {
  headers?: Record<string, string>; timeoutMs?: number; retries?: number;
  fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>;
}
export interface JsonResponse { status: number; json: unknown }
export const RETRY_WAITS_MS = [1000, 3000];
const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function once(url: string, init: RequestInit & { method: string }, o: GetJsonOpts): Promise<Result<JsonResponse> & { retry?: boolean }> {
  const f = o.fetchImpl ?? fetch;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), o.timeoutMs ?? 10_000);
  try {
    const res = await f(url, { ...init, signal: ac.signal });
    const text = await res.text();
    if (res.status === 429) return { ...err('HTTP_429', 'Rate limited (HTTP 429)') };
    if (res.status >= 500) return { ...err('HTTP_5XX', `Server error (HTTP ${res.status})`), retry: true };
    if (res.status >= 400) return { ...err('HTTP_4XX', `HTTP ${res.status}`) };
    try { return ok({ status: res.status, json: JSON.parse(text) as unknown }); } catch { return err('PARSE_FAIL', 'Response was not valid JSON'); }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { ...(aborted ? err('NET_TIMEOUT', 'Request timed out') : err('NET_OFFLINE', 'Network unreachable')), retry: true };
  } finally { clearTimeout(timer); }
}

export async function requestJson(url: string, init: RequestInit & { method: string }, o: GetJsonOpts = {}): Promise<Result<JsonResponse>> {
  const retries = o.retries ?? 2;
  const sleep = o.sleep ?? defaultSleep;
  let last: Result<JsonResponse> = err('NET_OFFLINE', 'No attempt made');
  for (let a = 0; a <= retries; a++) {
    o.onAttempt?.();
    const r = await once(url, { ...init, headers: { ...(o.headers ?? {}), ...((init.headers as Record<string, string> | undefined) ?? {}) } }, o);
    if (r.ok) return { ok: true, value: r.value };
    last = { ok: false, error: r.error };
    o.onError?.(r.error.code, r.error.message);
    if (!r.retry || a === retries) break;
    await sleep(RETRY_WAITS_MS[Math.min(a, RETRY_WAITS_MS.length - 1)]);
  }
  return last;
}
export const getJson = (url: string, o: GetJsonOpts = {}): Promise<Result<JsonResponse>> => requestJson(url, { method: 'GET' }, o);
export const postJson = (url: string, body: unknown, o: GetJsonOpts = {}): Promise<Result<JsonResponse>> =>
  requestJson(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, o);
