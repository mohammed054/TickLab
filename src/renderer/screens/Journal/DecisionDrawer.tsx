import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fmtDate, fmtUsd } from '@shared/format';
import type { FillRow } from '@shared/types';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Input, TextArea } from '../../components/Input';
import { ScoreChip } from '../../components/ScoreChip';
import { toast } from '../../components/Toast';
import { invoke } from '../../state/hooks';
import { useStore } from '../../state/store';
import { usdPrice } from '../Feed/columns';
import { FillForm } from './FillForm';
import { useDecisions } from './useDecisions';

type Prompt = null | { kind: 'cancel' | 'note' } | { kind: 'void'; fillId: number };

function FillBlock({ label, fill, onVoid }: { label: string; fill: FillRow | null; onVoid: (id: number) => void }) {
  return (
    <div className="panel" style={{ padding: 8, marginBottom: 8 }}>
      <div className="row-flex"><b style={{ fontSize: 12 }}>{label}</b><span className="spacer" />{fill ? <Button variant="ghost" onClick={() => onVoid(fill.id)}>Void</Button> : null}</div>
      {fill ? (
        <div className="mono" style={{ fontSize: 11, lineHeight: '16px', color: 'var(--text-2)' }}>
          {fmtDate(fill.occurredAt)} · {usdPrice(fill.priceUsd)} · {fill.tokenAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens · {fmtUsd(fill.usdValue)} · fee {fmtUsd(fill.feeUsd)} · {fill.source}
          {fill.note ? <div style={{ fontFamily: 'var(--font-ui)' }}>{fill.note}</div> : null}
        </div>
      ) : <div className="meta">Not recorded.</div>}
    </div>
  );
}

export function DecisionDrawer({ decisionId, onClose, initialFill }: { decisionId: number; onClose: () => void; initialFill?: 'entry' | 'exit' }) {
  const { rows, reload } = useDecisions();
  const d = rows.find((x) => x.id === decisionId) ?? null;
  const [fill, setFill] = useState<'entry' | 'exit' | null>(initialFill ?? null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !fill && !prompt) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, fill, prompt]);
  const changed = () => { useStore.getState().bumpJournal(); void reload(); };
  const sendPrompt = async () => {
    if (!d || !prompt || !text.trim()) return;
    const t = text.trim();
    const r = prompt.kind === 'void' ? await invoke('journal:fill:void', { fillId: prompt.fillId, reason: t }) : await invoke('journal:note:add', { decisionId: d.id, kind: prompt.kind === 'cancel' ? 'cancel' : 'note', text: t });
    if (!r.ok) { setMsg(r.error.message); return; }
    setPrompt(null); setText(''); setMsg(null); changed();
  };
  const simulateExit = async () => {
    if (!d) return;
    const r = await invoke('journal:paperExit', { decisionId: d.id });
    if (!r.ok) { setMsg(r.error.message); return; }
    setMsg(null); toast('Simulated exit recorded (est.)', 'good'); changed();
  };
  return (
    <aside className="drawer" aria-label="Decision details" style={{ width: 420 }}>
      <div className="row-flex" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ flex: 1 }}>{d ? `${d.symbol} · ${d.account}` : 'Decision'}</h2>
        <Button variant="ghost" iconOnly aria-label="Close" onClick={onClose} icon={<X size={16} strokeWidth={1.5} />} />
      </div>
      {!d ? <div className="muted">Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row-flex"><Chip color="var(--accent)">{d.status}</Chip><ScoreChip score={d.score} band={d.band} completeness={d.completeness} /><span className="meta">at entry</span></div>
          <div style={{ fontSize: 12, lineHeight: '18px' }}>
            <div>Created {fmtDate(d.createdAt)} · size {fmtUsd(d.sizeUsd)} · equity before {fmtUsd(d.equityBefore)}</div>
            <div>Stop: {d.stopRule}</div><div>Target: {d.targetRule}</div>
            <div style={{ marginTop: 4 }}>{d.thesis}</div>
            {d.pnlUsd !== null ? <div className="mono" style={{ marginTop: 4 }}>PnL {fmtUsd(d.pnlUsd)}</div> : null}
          </div>
          <FillBlock label="Entry fill" fill={d.entry} onVoid={(id) => setPrompt({ kind: 'void', fillId: id })} />
          <FillBlock label="Exit fill" fill={d.exit} onVoid={(id) => setPrompt({ kind: 'void', fillId: id })} />
          <div className="row-flex" style={{ flexWrap: 'wrap' }}>
            {!d.entry && d.status !== 'cancelled' ? <Button variant="primary" onClick={() => setFill('entry')}>Record entry fill</Button> : null}
            {d.entry && !d.exit ? <Button variant="primary" onClick={() => setFill('exit')}>Record exit fill</Button> : null}
            {d.entry && !d.exit && d.account === 'paper' ? <Button variant="secondary" onClick={() => { void simulateExit(); }}>Simulate exit now</Button> : null}
            {!d.entry && d.status !== 'cancelled' ? <Button variant="danger" onClick={() => setPrompt({ kind: 'cancel' })}>Cancel decision</Button> : null}
            <Button variant="secondary" onClick={() => setPrompt({ kind: 'note' })}>Add note</Button>
          </div>
          {prompt ? (
            <div className="panel" style={{ padding: 8 }}>
              <span className="field-label">{prompt.kind === 'void' ? 'Reason for voiding this fill' : prompt.kind === 'cancel' ? 'Reason for cancelling' : 'Note'}</span>
              {prompt.kind === 'note' ? <TextArea rows={3} style={{ width: '100%' }} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Note text" /> : <Input maxLength={500} value={text} onChange={(e) => setText(e.target.value)} aria-label="Reason" />}
              <div className="row-flex" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <Button variant="ghost" onClick={() => { setPrompt(null); setText(''); }}>Back</Button>
                <Button variant="primary" disabled={!text.trim()} onClick={() => { void sendPrompt(); }}>Save</Button>
              </div>
            </div>
          ) : null}
          {msg ? <div role="alert" className="bad" style={{ fontSize: 12 }}>{msg}</div> : null}
          <div>
            <h3 className="section-title" style={{ fontSize: 12, marginBottom: 4 }}>Notes</h3>
            {d.notes.length === 0 ? <div className="meta">No notes.</div> : d.notes.map((n) => <div key={n.id} style={{ fontSize: 12, borderBottom: '1px solid var(--border)', padding: '4px 0' }}><span className="meta">{fmtDate(n.createdAt)} · {n.kind}</span><div>{n.text}</div></div>)}
          </div>
        </div>
      )}
      {d && fill ? <FillForm decision={d} kind={fill} onClose={() => setFill(null)} onSaved={changed} /> : null}
    </aside>
  );
}
