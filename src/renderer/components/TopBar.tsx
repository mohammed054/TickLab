import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Input } from './Input';
import { Button } from './Button';
import { AlertsPopover } from './AlertsPopover';
import { SCREENS } from './Sidebar';
import { ageSecNow, findSource, fmtSecs, stateColor } from './sourceUi';
import { fmtUsd } from '@shared/format';
import { useNow } from '../state/hooks';
import { unseenCount, useStore } from '../state/store';

const money = (v: number | undefined): string => (v === undefined ? '—' : fmtUsd(v));

/** 40px high: title, search 320x28, source pill, equity chip, risk chip, bell. */
export function TopBar() {
  const loc = useLocation();
  const nav = useNavigate();
  const now = useNow(1000);
  const search = useStore((s) => s.filters.search);
  const setFilters = useStore((s) => s.setFilters);
  const sources = useStore((s) => s.sources);
  const risk = useStore((s) => s.risk);
  const alerts = useStore((s) => s.alerts);
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const title = SCREENS.find((s) => loc.pathname.startsWith(s.path))?.title ?? 'TickLab Radar';
  const gt = findSource(sources, 'geckoterminal');
  const unseen = unseenCount(alerts);
  const paused = [risk.paper, risk.real].find((r) => r && !r.active);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) { e.preventDefault(); document.getElementById('global-search')?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <header style={{ height: 40, flex: 'none', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 12 }}>
      <h1 style={{ fontSize: 14, lineHeight: '20px', fontWeight: 600, margin: 0, minWidth: 80 }}>{title}</h1>
      <div style={{ width: 320, flex: 'none' }}>
        <Input id="global-search" aria-label="Search" placeholder="Search symbol, mint or pool  (Ctrl+K)" value={search} maxLength={100}
          onChange={(e) => setFilters({ search: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLElement).blur(); }} />
      </div>
      <div className="spacer" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={() => nav('/health')} aria-label="Source status" style={{ height: 20, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 8px', fontSize: 11 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: stateColor(gt?.state) }} />
          GeckoTerminal {gt?.state ?? 'OFFLINE'} {fmtSecs(ageSecNow(gt, now))}
        </button>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-1)' }}>Paper {money(risk.paper?.equity)} · Real {money(risk.real?.equity)}</span>
        <button type="button" onClick={() => nav('/journal')} aria-label="Risk state" className="chip"
          style={{ height: 18, padding: '0 6px', border: 0, fontWeight: 700, color: paused ? 'var(--bad)' : 'var(--good)', background: `color-mix(in srgb, ${paused ? 'var(--bad)' : 'var(--good)'} 16%, transparent)` }}>
          {paused ? 'PAUSED' : 'ACTIVE'}
        </button>
        <div ref={bellRef} style={{ position: 'relative' }}>
          <Button iconOnly variant="ghost" aria-label="Alerts" onClick={() => setOpen((o) => !o)} icon={<Bell size={16} strokeWidth={1.5} />} />
          {unseen > 0 ? (
            <span data-testid="bell-badge" style={{ position: 'absolute', top: 0, right: 0, minWidth: 14, height: 14, borderRadius: 7, background: 'var(--bad)', color: '#12060a', fontSize: 10, lineHeight: '14px', fontWeight: 700, textAlign: 'center', padding: '0 3px', pointerEvents: 'none' }}>
              {unseen > 99 ? '99+' : unseen}
            </span>
          ) : null}
          {open ? <AlertsPopover onClose={() => setOpen(false)} anchor={bellRef} /> : null}
        </div>
      </div>
    </header>
  );
}
