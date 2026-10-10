import { useState } from 'react';
import { fmtAddr, fmtDate, fmtUsd } from '@shared/format';
import type { UnlinkedTrade } from '@shared/types';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Select } from '../../components/Input';
import { toast } from '../../components/Toast';
import { invoke, useInvoke } from '../../state/hooks';
import { useStore } from '../../state/store';
import { useDecisions } from './useDecisions';

/** Imported wallet trades (Real account). Linking is always a user click; nothing is linked automatically. */
export function UnlinkedTrades() {
  const list = useInvoke('wallet:unlinked:list', {});
  const { rows: decisions } = useDecisions(undefined, { account: 'real' });
  const [pick, setPick] = useState<Record<number, string>>({});
  const rows = (list.data ?? []).filter((t) => t.linkedFillId === null && !t.dismissed);
  const candidates = (t: UnlinkedTrade) => decisions.filter((d) => d.mint === t.mint && (d.status === 'open' || d.status === 'pending'));
  const link = async (t: UnlinkedTrade, decisionId: number) => {
    const r = await invoke('wallet:unlinked:link', { id: t.id, decisionId, kind: t.side === 'buy' ? 'entry' : 'exit' });
    if (!r.ok) { toast(r.error.message, 'bad'); return; }
    toast('Linked to decision', 'good');
    useStore.getState().bumpJournal(); list.reload();
  };
  const dismiss = async (t: UnlinkedTrade) => {
    const r = await invoke('wallet:unlinked:dismiss', { id: t.id });
    if (!r.ok) toast(r.error.message, 'bad');
    list.reload();
  };
  return (
    <section className="panel" style={{ padding: 12 }}>
      <h3 className="section-title" style={{ marginBottom: 8 }}>Imported wallet trades</h3>
      {rows.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No unlinked trades. Use Sync now in Settings after adding a wallet address.</div> : (
        <table className="dense">
          <thead><tr><th>Time</th><th>Side</th><th>Token</th><th className="r">SOL</th><th className="r">USD</th><th>Link to decision ▾</th><th /></tr></thead>
          <tbody>
            {rows.map((t) => {
              const cands = candidates(t);
              const chosen = pick[t.id] ?? String(t.suggestedDecisionId ?? cands[0]?.id ?? '');
              return (
                <tr key={t.id}>
                  <td className="mono">{fmtDate(t.blockTime)}</td>
                  <td><Chip color={t.side === 'buy' ? 'var(--good)' : 'var(--bad)'}>{t.side.toUpperCase()}</Chip></td>
                  <td>{t.symbol ?? fmtAddr(t.mint)}</td>
                  <td className="num">{t.solAmount.toFixed(4)}</td>
                  <td className="num">{t.usdValue === null ? <span className="muted">price pending</span> : fmtUsd(t.usdValue)}</td>
                  <td>
                    {cands.length === 0 ? <span className="muted">No matching open decision</span> : (
                      <span className="row-flex">
                        <Select aria-label="Decision to link" style={{ width: 180 }} value={chosen} onChange={(e) => setPick((p) => ({ ...p, [t.id]: e.target.value }))}>
                          {cands.map((d) => <option key={d.id} value={d.id}>{`#${d.id} ${d.symbol}${d.id === t.suggestedDecisionId ? ' (suggested)' : ''}`}</option>)}
                        </Select>
                        <Button variant="secondary" disabled={!chosen} onClick={() => { void link(t, Number(chosen)); }}>Link</Button>
                      </span>
                    )}
                  </td>
                  <td><Button variant="ghost" onClick={() => { void dismiss(t); }}>Dismiss</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
