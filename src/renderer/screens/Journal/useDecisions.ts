import { useCallback, useEffect, useRef, useState } from 'react';
import type { Account, DecisionRow } from '@shared/types';
import { invoke } from '../../state/hooks';
import { useStore } from '../../state/store';

type Status = 'open' | 'closed' | 'pending' | 'cancelled';

/** Decisions for one or both accounts, newest first. Reloads when the journal changes. */
export function useDecisions(tokenId?: number, opts: { account?: Account; status?: Status } = {}) {
  const tick = useStore((s) => s.journalTick);
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const { account, status } = opts;
  const load = useCallback(async () => {
    const n = ++seq.current;
    const accounts: Account[] = account ? [account] : ['paper', 'real'];
    const res = await Promise.all(accounts.map((a) => invoke('journal:decisions', { account: a, ...(status ? { status } : {}), ...(tokenId !== undefined ? { tokenId } : {}) })));
    if (n !== seq.current) return;
    setRows(res.flatMap((r) => (r.ok ? r.value : [])).sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  }, [account, status, tokenId]);
  useEffect(() => { void load(); }, [load, tick]);
  return { rows, loading, reload: load };
}
