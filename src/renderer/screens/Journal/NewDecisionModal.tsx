import { useEffect, useMemo, useState } from 'react';
import { fmtUsd } from '@shared/format';
import type { Account } from '@shared/types';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { Field, Input, Select, TextArea } from '../../components/Input';
import { Modal, ModalButtons } from '../../components/Modal';
import { ScoreChip } from '../../components/ScoreChip';
import { Segmented } from '../../components/Tabs';
import { toast } from '../../components/Toast';
import { invoke, useInvoke } from '../../state/hooks';
import { useStore } from '../../state/store';
import { ruleName } from '../../rules';
import { usdPrice } from '../Feed/columns';
import { blockReason } from './riskText';

export const STOP_RULES = ['Exit if liquidity falls 50%', 'Exit if price falls 30%', 'Time stop: exit after 1 hour'];
export const TARGET_RULES = ['Take profit at +50%', 'Take profit at +100%', 'Time stop: exit after 4 hours'];
export const MIN_THESIS = 20;
const CUSTOM = '__custom';

export interface NewDecisionModalProps { tokenId: number; onClose: () => void; onCreated?: (decisionId: number, account: Account) => void }

function RulePick({ label, options, value, custom, onValue, onCustom }: { label: string; options: string[]; value: string; custom: string; onValue: (v: string) => void; onCustom: (v: string) => void }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onValue(e.target.value)} aria-label={label}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={CUSTOM}>Custom</option>
      </Select>
      {value === CUSTOM ? <Input style={{ marginTop: 4 }} aria-label={`${label} (custom)`} maxLength={200} value={custom} onChange={(e) => onCustom(e.target.value)} placeholder="Describe your rule" /> : null}
    </Field>
  );
}

/** Pre-registered plan for one token (docs/05 §5.9). Size is capped at the risk engine's maximum. */
export function NewDecisionModal({ tokenId, onClose, onCreated }: NewDecisionModalProps) {
  const detail = useInvoke('launches:get', { tokenId }).data;
  const [account, setAccount] = useState<Account>('paper');
  const summary = useInvoke('journal:summary', { account });
  const risk = summary.data?.risk ?? null;
  const [size, setSize] = useState<string | null>(null);
  const [stop, setStop] = useState(STOP_RULES[0] as string);
  const [stopCustom, setStopCustom] = useState('');
  const [target, setTarget] = useState(TARGET_RULES[0] as string);
  const [targetCustom, setTargetCustom] = useState('');
  const [thesis, setThesis] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setSize(null); }, [account]);
  const max = risk?.maxPositionUsd ?? 0;
  const sizeNum = Number(size ?? max);
  const block = blockReason(risk);
  const hits = useMemo(() => (detail?.judgement?.results ?? []).filter((r) => r.status === 'hit').sort((a, b) => b.points - a.points).slice(0, 5), [detail]);
  const stopRule = stop === CUSTOM ? stopCustom.trim() : stop;
  const targetRule = target === CUSTOM ? targetCustom.trim() : target;
  const sizeOk = Number.isFinite(sizeNum) && sizeNum > 0 && sizeNum <= max + 0.005;
  const valid = !!detail?.judgement && !!risk && sizeOk && thesis.trim().length >= MIN_THESIS && ack && !block && !!stopRule && !!targetRule;

  const submit = async () => {
    if (!detail || !valid) return;
    setBusy(true); setError(null);
    const r = await invoke('journal:decision:create', { account, tokenId, poolId: detail.pool.id, sizeUsd: Math.round(sizeNum * 100) / 100, stopRule, targetRule, thesis: thesis.trim(), acknowledgedFlags: true });
    if (!r.ok) { setBusy(false); setError(r.error.message); return; }
    useStore.getState().bumpJournal();
    if (account === 'paper') {
      const list = await invoke('journal:decisions', { account, tokenId });
      const entry = list.ok ? list.value.find((d) => d.id === r.value.decisionId)?.entry : null;
      toast(entry ? `Paper entry recorded at ${usdPrice(entry.priceUsd)} (est.)` : 'Paper decision recorded', 'good');
    }
    setBusy(false);
    onCreated?.(r.value.decisionId, account);
    onClose();
  };

  return (
    <Modal open onClose={onClose} width={560} title="New decision">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Token">
          <div className="row-flex" style={{ height: 28 }}>
            <b>{detail?.token.symbol ?? '…'}</b>
            {detail?.judgement ? <ScoreChip score={detail.judgement.score} band={detail.judgement.band} completeness={detail.judgement.completeness} /> : <span className="meta">No judgement yet</span>}
          </div>
        </Field>
        <Field label="Account"><Segmented options={[{ id: 'paper', label: 'Paper' }, { id: 'real', label: 'Real' }]} value={account} onChange={setAccount} /></Field>
        <Field label="Size USD" hint={risk ? `Max ${fmtUsd(max)} (${risk.equity > 0 ? Math.round((max / risk.equity) * 1000) / 10 : 0}% of ${fmtUsd(risk.equity)})` : undefined}>
          <Input numeric type="number" min={0} step="0.01" max={max} value={size ?? (risk ? String(max) : '')} onChange={(e) => setSize(e.target.value)} aria-label="Size USD" />
        </Field>
        <RulePick label="Stop rule" options={STOP_RULES} value={stop} custom={stopCustom} onValue={setStop} onCustom={setStopCustom} />
        <RulePick label="Target rule" options={TARGET_RULES} value={target} custom={targetCustom} onValue={setTarget} onCustom={setTargetCustom} />
        <Field label="Thesis" hint={`${thesis.trim().length}/${MIN_THESIS} characters minimum`}>
          <TextArea style={{ height: 80, width: '100%' }} value={thesis} maxLength={2000} onChange={(e) => setThesis(e.target.value)} aria-label="Thesis" />
        </Field>
        <div>
          <span className="field-label">Risk flags</span>
          {hits.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No rules triggered. This does not mean the token is safe.</div> : hits.map((r) => <div key={r.ruleId} style={{ fontSize: 12 }}>+{r.points} {ruleName(r.ruleId)}</div>)}
        </div>
        <Checkbox checked={ack} onChange={setAck}>I read the risk flags above</Checkbox>
      </div>
      {block ? <div role="alert" className="bad" style={{ fontSize: 12, marginTop: 12 }}>{block}</div> : null}
      {error ? <div role="alert" className="bad" style={{ fontSize: 12, marginTop: 8 }}>{error}</div> : null}
      <ModalButtons>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!valid || busy} onClick={() => { void submit(); }}>Record decision</Button>
      </ModalButtons>
    </Modal>
  );
}
