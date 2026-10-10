import { useState } from 'react';
import { fmtDate } from '@shared/format';
import type { Account, RiskState } from '@shared/types';
import { Button } from '../../components/Button';
import { Modal, ModalButtons } from '../../components/Modal';
import { TextArea } from '../../components/Input';
import { toast } from '../../components/Toast';
import { invoke } from '../../state/hooks';
import { useStore } from '../../state/store';
import { activeText, pausedText } from './riskText';

/** Full-width 56px panel: green ACTIVE line or red PAUSED line with the review button. */
export function RiskPanel({ account, risk, onChanged }: { account: Account; risk: RiskState | null; onChanged: () => void }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const setRisk = useStore((s) => s.setRisk);
  if (!risk) return <div className="panel" style={{ height: 56 }} />;
  const ack = async () => {
    const r = await invoke('journal:risk:ack', { account, reason: reason.trim() });
    if (!r.ok) { toast(r.error.message, 'bad'); return; }
    setRisk(account, r.value);
    setAsking(false); setReason('');
    onChanged();
  };
  return (
    <div className="panel" style={{ height: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderColor: risk.active ? 'var(--border)' : 'var(--bad)' }}>
      <span style={{ fontWeight: 700, color: risk.active ? 'var(--good)' : 'var(--bad)' }}>{risk.active ? 'ACTIVE' : 'PAUSED'}</span>
      <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{risk.active ? `— ${activeText(risk)}` : `— ${pausedText(risk)}`}</span>
      {risk.pendingLimits.length > 0 ? <span className="meta">{risk.pendingLimits.length} limit change(s) pending, next at {fmtDate(Math.min(...risk.pendingLimits.map((p) => p.effectiveAt)))}</span> : null}
      <span className="spacer" />
      {!risk.active && risk.pausedReason === 'drawdown' ? <Button variant="secondary" disabled={!risk.canAck} onClick={() => setAsking(true)} title={risk.canAck ? undefined : 'Available 24 hours after the last equity change'}>I reviewed this</Button> : null}
      <Modal open={asking} onClose={() => setAsking(false)} width={400} title="Confirm review">
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>Write what you reviewed. The peak resets to current equity once you confirm.</p>
        <TextArea aria-label="Review note" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%' }} />
        <ModalButtons><Button variant="ghost" onClick={() => setAsking(false)}>Cancel</Button><Button variant="primary" disabled={!reason.trim()} onClick={() => { void ack(); }}>Confirm</Button></ModalButtons>
      </Modal>
    </div>
  );
}
