import { useEffect, useState } from 'react';
import { fmtDate, fmtUsd } from '@shared/format';
import type { Account } from '@shared/types';
import { Button } from '../../components/Button';
import { Field, Input, Select } from '../../components/Input';
import { Modal, ModalButtons } from '../../components/Modal';
import { toast } from '../../components/Toast';
import { invoke, useInvoke } from '../../state/hooks';
import { useStore } from '../../state/store';
import { THEME } from '../../theme';
import { toTime, useChart } from '../Detail/chartUtil';
import { safeRemove } from '../Detail/chartUtil';

type Kind = 'deposit' | 'withdraw' | 'adjust';

function EquityModal({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<Kind>('deposit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const n = Number(amount);
  const ok = amount.trim() !== '' && Number.isFinite(n) && (kind === 'adjust' ? n !== 0 : n > 0);
  const save = async () => {
    const r = await invoke('journal:equity:add', { account, kind, amountUsd: n, note: note.trim() });
    if (!r.ok) { toast(r.error.message, 'bad'); return; }
    useStore.getState().bumpJournal(); onSaved(); onClose();
  };
  return (
    <Modal open onClose={onClose} width={400} title="Add deposit or withdrawal">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Kind"><option value="deposit">Deposit</option><option value="withdraw">Withdrawal</option><option value="adjust">Adjustment (can be negative)</option></Select></Field>
        <Field label="Amount USD"><Input numeric type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount USD" /></Field>
        <Field label="Note"><Input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" /></Field>
      </div>
      <ModalButtons><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ok} onClick={() => { void save(); }}>Save</Button></ModalButtons>
    </Modal>
  );
}

export function EquityTab({ account }: { account: Account }) {
  const tick = useStore((s) => s.journalTick);
  const q = useInvoke('journal:equity:list', { account }, { intervalMs: 0 });
  const [open, setOpen] = useState(false);
  const { ref, chart } = useChart();
  useEffect(() => { q.reload(); }, [tick, q.reload]);//  /exhaustive-deps
  const pts = q.data ?? [];
  useEffect(() => {
    if (!chart || pts.length === 0) return;
    const seen = new Set<number>();
    const data = pts.map((p) => ({ time: toTime(p.at), value: p.equity })).sort((a, b) => a.time - b.time).filter((p) => !seen.has(p.time) && !!seen.add(p.time));
    const s = chart.addLineSeries({ color: THEME.accent, lineWidth: 2, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
    s.setData(data);
    chart.timeScale().fitContent();
    return () => safeRemove(chart, s);
  }, [chart, pts]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="panel" style={{ height: 260, position: 'relative' }}>
        <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
        {pts.length === 0 ? <div className="center-fill" style={{ position: 'absolute', inset: 0 }}>No equity events yet.</div> : null}
      </div>
      <div className="row-flex"><span className="section-title">Equity events</span><span className="spacer" /><Button variant="secondary" onClick={() => setOpen(true)}>Add deposit/withdrawal</Button></div>
      <table className="dense">
        <thead><tr><th>Time</th><th>Kind</th><th className="r">Equity</th><th>Note</th></tr></thead>
        <tbody>{[...pts].reverse().map((p, i) => <tr key={`${p.at}-${i}`}><td className="mono">{fmtDate(p.at)}</td><td>{p.kind}</td><td className="num">{fmtUsd(p.equity)}</td><td>{p.note}</td></tr>)}</tbody>
      </table>
      {open ? <EquityModal account={account} onClose={() => setOpen(false)} onSaved={q.reload} /> : null}
    </div>
  );
}
