import { useEffect } from 'react';
import type { RefObject } from 'react';
import { fmtDate } from '@shared/format';
import { Button } from './Button';
import { invoke } from '../state/hooks';
import { useStore } from '../state/store';

/** 360px popover: newest first, max 50, "Mark all seen". Clicking an alert opens that token in Detail. */
export function AlertsPopover({ onClose, anchor }: { onClose: () => void; anchor: RefObject<HTMLElement> }) {
  const alerts = useStore((s) => s.alerts);
  const markAllSeen = useStore((s) => s.markAllSeen);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (anchor.current && !anchor.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [anchor, onClose]);
  const open = (tokenId: number) => {
    void invoke('detail:select', { tokenId });
    void invoke('detail:focus', {});
    onClose();
  };
  return (
    <div role="dialog" aria-label="Alerts" className="panel" style={{ position: 'absolute', right: 0, top: 32, width: 360, maxHeight: 440, display: 'flex', flexDirection: 'column', zIndex: 950, boxShadow: 'var(--shadow-pop)', background: 'var(--bg-2)' }}>
      <div className="row-flex" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <span className="section-title" style={{ flex: 1 }}>Alerts</span>
        <Button variant="ghost" onClick={() => { markAllSeen(); void invoke('alerts:markSeen', { ids: 'all' }); }}>Mark all seen</Button>
      </div>
      <div className="scroll-y" style={{ flex: 1 }}>
        {alerts.length === 0 ? <div className="muted" style={{ padding: 16, fontSize: 12 }}>No alerts yet.</div> : null}
        {alerts.slice(0, 50).map((a) => (
          <button key={a.id} type="button" onClick={() => open(a.tokenId)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--border)', padding: '8px 12px' }}>
            <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: a.seen ? 400 : 600, color: a.seen ? 'var(--text-2)' : 'var(--text-1)' }}>{a.text}</div>
            <div className="meta">{fmtDate(a.createdAt)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
