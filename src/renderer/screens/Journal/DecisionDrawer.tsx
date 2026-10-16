// Read-only decision drawer (Legacy Archive, T1.5). Views an existing decision
// and its fills; no void, cancel, note, fill-recording, or simulated exit.
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { fmtDate, fmtUsd } from '@shared/format';
import type { FillRow } from '@shared/types';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { ScoreChip } from '../../components/ScoreChip';
import { usdPrice } from '../Feed/columns';
import { useDecisions } from './useDecisions';

function FillBlock({ label, fill }: { label: string; fill: FillRow | null }) {
  return (
    <div className="panel" style={{ padding: 8, marginBottom: 8 }}>
      <div className="row-flex"><b style={{ fontSize: 12 }}>{label}</b><span className="spacer" /></div>
      {fill ? (
        <div className="mono" style={{ fontSize: 11, lineHeight: '16px', color: 'var(--text-2)' }}>
          {fmtDate(fill.occurredAt)} · {usdPrice(fill.priceUsd)} · {fill.tokenAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens · {fmtUsd(fill.usdValue)} · fee {fmtUsd(fill.feeUsd)} · {fill.source}
          {fill.note ? <div style={{ fontFamily: 'var(--font-ui)' }}>{fill.note}</div> : null}
        </div>
      ) : <div className="meta">Not recorded.</div>}
    </div>
  );
}

export function DecisionDrawer({ decisionId, onClose }: { decisionId: number; onClose: () => void }) {
  const { rows } = useDecisions();
  const d = rows.find((x) => x.id === decisionId) ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
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
          <FillBlock label="Entry fill" fill={d.entry} />
          <FillBlock label="Exit fill" fill={d.exit} />
          <div>
            <h3 className="section-title" style={{ fontSize: 12, marginBottom: 4 }}>Notes</h3>
            {d.notes.length === 0 ? <div className="meta">No notes.</div> : d.notes.map((n) => <div key={n.id} style={{ fontSize: 12, borderBottom: '1px solid var(--border)', padding: '4px 0' }}><span className="meta">{fmtDate(n.createdAt)} · {n.kind}</span><div>{n.text}</div></div>)}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>This is a read-only legacy archive. Records cannot be edited, voided, or used in model data.</div>
        </div>
      )}
    </aside>
  );
}
