import { useState } from 'react';
import type { DecisionRow } from '@shared/types';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { Field, Input } from '../../components/Input';
import { Modal, ModalButtons } from '../../components/Modal';
import { toast } from '../../components/Toast';
import { invoke } from '../../state/hooks';

const p2 = (n: number) => String(n).padStart(2, '0');
export const toLocalInput = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };

export interface FillFormProps { decision: DecisionRow; kind: 'entry' | 'exit'; onClose: () => void; onSaved: () => void }

/** Manual fill. Required: time, price, tokens, USD, fee. Exit must come after entry. A failed position is recorded as USD 0 with a note. */
export function FillForm({ decision, kind, onClose, onSaved }: FillFormProps) {
  const [when, setWhen] = useState(toLocalInput(Date.now()));
  const [price, setPrice] = useState('');
  const [tokens, setTokens] = useState('');
  const [usd, setUsd] = useState('');
  const [fee, setFee] = useState('0');
  const [slip, setSlip] = useState('');
  const [tx, setTx] = useState('');
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
  const at = new Date(when).getTime();
  const entryAt = decision.entry?.occurredAt ?? 0;
  const eff = failed ? { price: 0, tokens: decision.entry?.tokenAmount ?? 0, usd: 0 } : { price: num(price), tokens: num(tokens), usd: num(usd) };
  const problems: string[] = [];
  if (!Number.isFinite(at)) problems.push('Enter a valid time.');
  if (kind === 'exit' && !decision.entry) problems.push('Record the entry fill first.');
  if (kind === 'exit' && decision.entry && at <= entryAt) problems.push('The exit must be after the entry.');
  if (kind === 'entry' && decision.entry) problems.push('This decision already has an entry fill.');
  if (!Number.isFinite(eff.price) || eff.price < 0 || (!failed && eff.price <= 0)) problems.push('Price is required.');
  if (!Number.isFinite(eff.tokens) || eff.tokens < 0) problems.push('Token amount is required.');
  if (!Number.isFinite(eff.usd) || eff.usd < 0) problems.push('USD value is required.');
  if (!Number.isFinite(num(fee)) || num(fee) < 0) problems.push('Fee is required (0 is fine).');
  if ((failed || eff.usd === 0) && !note.trim()) problems.push('A note is required when the USD value is 0.');
  const submit = async () => {
    setBusy(true); setError(null);
    const s = num(slip), t = tx.trim(), n = note.trim();
    const r = await invoke('journal:fill:create', {
      decisionId: decision.id, kind, occurredAt: at, priceUsd: eff.price, tokenAmount: eff.tokens, usdValue: eff.usd, feeUsd: num(fee),
      ...(Number.isFinite(s) ? { slippagePct: s } : {}), ...(t ? { txSig: t } : {}), ...(n ? { note: n } : {}),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error.message); return; }
    toast(kind === 'entry' ? 'Entry fill recorded' : 'Exit fill recorded', 'good');
    onSaved(); onClose();
  };
  return (
    <Modal open onClose={onClose} width={480} title={kind === 'entry' ? 'Record entry fill' : 'Record exit fill'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Time"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Fill time" /></Field>
        {kind === 'exit' ? <Checkbox checked={failed} onChange={setFailed}>Position failed or cannot be sold (record as a full loss)</Checkbox> : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Price USD"><Input numeric type="number" min={0} step="any" disabled={failed} value={failed ? '0' : price} onChange={(e) => setPrice(e.target.value)} aria-label="Price USD" /></Field>
          <Field label="Token amount"><Input numeric type="number" min={0} step="any" disabled={failed} value={failed ? String(eff.tokens) : tokens} onChange={(e) => setTokens(e.target.value)} aria-label="Token amount" /></Field>
          <Field label="USD value"><Input numeric type="number" min={0} step="any" disabled={failed} value={failed ? '0' : usd} onChange={(e) => setUsd(e.target.value)} aria-label="USD value" /></Field>
          <Field label="Fee USD"><Input numeric type="number" min={0} step="any" value={fee} onChange={(e) => setFee(e.target.value)} aria-label="Fee USD" /></Field>
          <Field label="Slippage % (optional)"><Input numeric type="number" step="any" value={slip} onChange={(e) => setSlip(e.target.value)} aria-label="Slippage percent" /></Field>
          <Field label="Transaction signature (optional)"><Input value={tx} maxLength={100} onChange={(e) => setTx(e.target.value)} aria-label="Transaction signature" /></Field>
        </div>
        <Field label="Note"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} aria-label="Note" /></Field>
      </div>
      {problems.length > 0 ? <ul className="meta" style={{ margin: '8px 0 0', paddingLeft: 16 }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      {error ? <div role="alert" className="bad" style={{ fontSize: 12, marginTop: 8 }}>{error}</div> : null}
      <ModalButtons><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={problems.length > 0 || busy} onClick={() => { void submit(); }}>Save fill</Button></ModalButtons>
    </Modal>
  );
}
