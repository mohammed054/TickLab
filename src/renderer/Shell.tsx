import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, SCREENS } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { StatusBar } from './components/StatusBar';
import { ToastHost, toast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FirstRunNotice } from './screens/Settings/FirstRunNotice';
import { invoke, useIpcEvent } from './state/hooks';
import { useStore } from './state/store';

/** Feed-window frame: sidebar 48, top bar 40, status bar 24, plus global shortcuts and live subscriptions. */
export function Shell() {
  const nav = useNavigate();
  const loc = useLocation();
  const { setSources, setAlerts, pushAlert, setRisk, bump } = useStore.getState();

  useEffect(() => {
    void invoke('alerts:list', { limit: 50 }).then((r) => { if (r.ok) setAlerts(r.value); });
    for (const account of ['paper', 'real'] as const) {
      void invoke('journal:summary', { account }).then((r) => { if (r.ok) setRisk(account, r.value.risk); });
    }
  }, [setAlerts, setRisk]);

  useIpcEvent('evt:source-status', setSources);
  useIpcEvent('evt:risk-state', (p) => setRisk(p.account, p.risk));
  useIpcEvent('evt:alert', (a) => {
    pushAlert(a);
    toast(a.text, 'info', () => {
      void invoke('detail:select', { tokenId: a.tokenId });
      void invoke('detail:focus', {});
    });
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F5') { e.preventDefault(); bump(); return; }
      if (!e.ctrlKey || e.altKey || e.shiftKey) return;
      const idx = '123456'.indexOf(e.key);
      if (idx >= 0) { e.preventDefault(); nav(SCREENS[idx]?.path ?? '/feed'); }
      else if (e.key === ',') { e.preventDefault(); nav('/settings'); }
      else if (e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('global-search')?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, bump]);

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '48px 1fr', gridTemplateRows: '1fr 24px', minWidth: 0 }}>
      <Sidebar />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <TopBar />
        <main style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ErrorBoundary key={loc.pathname}><Outlet /></ErrorBoundary>
        </main>
      </div>
      <StatusBar />
      <ToastHost />
      <FirstRunNotice />
    </div>
  );
}
