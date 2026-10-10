import { useCallback, useEffect, useRef, useState } from 'react';
import type { LaunchRow } from '@shared/types';
import { invoke, useDebounced, useInvoke, useIpcEvent, useThrottledCall } from '../../state/hooks';
import { useStore } from '../../state/store';

export interface FeedData { rows: LaunchRow[]; loaded: boolean; error: string | null }

/** Loads launches for the current filters/sort. Live events trigger a throttled re-query (server batches at 1 s). */
export function useFeedRows(): FeedData {
  const filters = useStore((s) => s.filters);
  const sort = useStore((s) => s.sort);
  const tick = useStore((s) => s.refreshTick);
  const dFilters = useDebounced(filters, 200);
  const maxRows = useInvoke('settings:get', { keys: ['ui.feedMaxRows'] }).data?.['ui.feedMaxRows'];
  const limit = typeof maxRows === 'number' && maxRows > 0 ? Math.min(20000, Math.floor(maxRows)) : 5000;
  const [data, setData] = useState<FeedData>({ rows: [], loaded: false, error: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    const r = await invoke('launches:list', { filters: dFilters, sort, limit });
    if (n !== seq.current) return;
    if (r.ok) {
      const st = useStore.getState();
      st.addDexes(r.value.map((x) => x.dex));
      st.clearWatchOverrides();
      setData({ rows: r.value, loaded: true, error: null });
    } else setData((d) => ({ ...d, loaded: true, error: r.error.message }));
  }, [dFilters, sort, limit]);
  useEffect(() => { void load(); }, [load, tick]);
  const reload = useThrottledCall(() => { void load(); }, 500);
  useIpcEvent('evt:launches-updated', reload);
  useIpcEvent('evt:launch-new', reload);
  useIpcEvent('evt:judgement-updated', reload);
  return data;
}
