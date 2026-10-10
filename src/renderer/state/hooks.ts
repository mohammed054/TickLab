import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiMap } from '@shared/api';
import type { EventMap } from '@shared/api';
import type { EventChannel } from '@shared/ipc';
import type { Result } from '@shared/types';

/** Typed invoke wrapper. Never throws: a missing bridge or a rejected promise becomes an error Result. */
export async function invoke<C extends keyof ApiMap>(channel: C, payload: ApiMap[C]['req']): Promise<Result<ApiMap[C]['res']>> {
  try {
    return await window.api.invoke(channel, payload);
  } catch (e) {
    return { ok: false, error: { code: 'IPC_FAIL', message: e instanceof Error ? e.message : 'IPC failed' } };
  }
}

/** Subscribe to a main->renderer event; unsubscribes on unmount. The callback may change freely without resubscribing. */
export function useIpcEvent<E extends EventChannel>(channel: E, cb: (payload: EventMap[E]) => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const off = window.api.on(channel, (p) => ref.current(p));
    return () => off();
  }, [channel]);
}

export interface InvokeState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}
export interface InvokeOpts { enabled?: boolean; intervalMs?: number }

/** Load once (and again when the payload changes or reload() is called). Stale responses are dropped. */
export function useInvoke<C extends keyof ApiMap>(channel: C, payload: ApiMap[C]['req'], opts: InvokeOpts = {}): InvokeState<ApiMap[C]['res']> {
  const { enabled = true, intervalMs } = opts;
  const [data, setData] = useState<ApiMap[C]['res'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(payload);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    void invoke(channel, payloadRef.current).then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.ok) { setData(r.value); setError(null); } else setError(r.error.message);
    });
    return () => { live = false; };
  }, [channel, key, enabled, tick]);
  useEffect(() => {
    if (!intervalMs || !enabled) return;
    const t = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, enabled]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** Ticking clock for relative ages. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Calls fn at most once per `ms` (trailing edge), safe to call from event handlers. */
export function useThrottledCall(fn: () => void, ms: number): () => void {
  const ref = useRef(fn);
  ref.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => { timer.current = null; ref.current(); }, ms);
  }, [ms]);
}
