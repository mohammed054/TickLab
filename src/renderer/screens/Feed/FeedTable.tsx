import { useCallback, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { LaunchRow } from '@shared/types';
import { Table } from '../../components/Table';
import { Chip } from '../../components/Chip';
import { NewDecisionModal } from '../Journal/NewDecisionModal';
import { useIpcEvent, useInvoke, useNow, useThrottledCall } from '../../state/hooks';
import { useStore } from '../../state/store';
import { openInDetail, openPoolPage, toggleWatch } from '../../state/actions';
import { copyText } from '../../components/clipboard';
import { toast } from '../../components/Toast';
import { useNavigate } from 'react-router-dom';
import { buildFeedColumns } from './columns';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';
import { feedKeyAction, useDetailSelectSync } from './keys';
import { useRowFlash } from './rowEffects';
import { NoMatchState, OfflineBanner, WaitingState, isOffline, pickFeedState } from './states';
import { useFeedRows } from './useFeedRows';

interface Menu { x: number; y: number; row: LaunchRow }

export function FeedTable() {
  const nav = useNavigate();
  const { rows, loaded } = useFeedRows();
  const now = useNow(1000);
  const sort = useStore((s) => s.sort);
  const setSort = useStore((s) => s.setSort);
  const selected = useStore((s) => s.selectedTokenId);
  const select = useStore((s) => s.select);
  const overrides = useStore((s) => s.watchOverrides);
  const resetFilters = useStore((s) => s.resetFilters);
  const sources = useStore((s) => s.sources);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [decisionFor, setDecisionFor] = useState<number | null>(null);
  const stats = useInvoke('launches:stats', {}, { intervalMs: 10000 });
  const refreshStats = useThrottledCall(stats.reload, 2000);
  useIpcEvent('evt:launches-updated', refreshStats);
  useDetailSelectSync(selected);
  const flash = useRowFlash(rows, loaded);
  const watched = useCallback((r: LaunchRow) => overrides[r.tokenId] ?? r.watchlisted, [overrides]);
  const columns = useMemo(() => buildFeedColumns({ now, watched, onToggleWatch: (r) => { void toggleWatch(r.tokenId, watched(r)); } }), [now, watched]);
  const rowKey = useCallback((r: LaunchRow) => String(r.tokenId), []);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const current = rows.find((r) => r.tokenId === selected) ?? null;

  const onKey = (e: KeyboardEvent) => {
    const action = feedKeyAction(e.nativeEvent);
    if (action === 'search') { e.preventDefault(); document.getElementById('global-search')?.focus(); }
    else if (action === 'reset') { e.preventDefault(); resetFilters(); }
    else if (action === 'watch' && current) { e.preventDefault(); void toggleWatch(current.tokenId, watched(current)); }
    else if (action === 'paper' && current) { e.preventDefault(); setDecisionFor(current.tokenId); }
  };
  const items = (r: LaunchRow): MenuItem[] => [
    { label: watched(r) ? 'Remove from watchlist' : 'Add to watchlist', onClick: () => { void toggleWatch(r.tokenId, watched(r)); } },
    { label: 'Open in Detail', onClick: () => openInDetail(r.tokenId) },
    { label: 'Copy mint', onClick: () => { void copyText(r.mint).then((ok) => toast(ok ? 'Copied' : 'Copy failed', ok ? 'info' : 'bad')); } },
    { label: 'Open on GeckoTerminal', onClick: () => { void openPoolPage(r.tokenId); } },
    { label: 'New paper decision', onClick: () => setDecisionFor(r.tokenId) },
  ];
  const view = pickFeedState(rows.length, loaded, stats.data?.total ?? null);
  const gaps = stats.data?.gaps24h ?? 0;
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {isOffline(sources.find((s) => s.source === 'geckoterminal')?.state) ? <OfflineBanner /> : null}
      <div className="row-flex" style={{ height: 28, flex: 'none', padding: '0 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', gap: 12 }}>
        <span>{stats.data ? `${stats.data.total} launches · ${stats.data.tracked} tracked · ${stats.data.alertsToday} alerts today` : 'Loading…'}</span>
        {gaps > 0 ? (
          <button type="button" aria-label="Open Data Health" onClick={() => nav('/health')} style={{ background: 'none', border: 0, padding: 0 }}>
            <Chip color="var(--warn)">{`Gaps ${gaps}`}</Chip>
          </button>
        ) : null}
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {view === 'rows' ? (
          <Table columns={columns} rows={rows} rowKey={rowKey} selectedKey={selected === null ? null : String(selected)} sort={sort}
            onSortChange={(col) => setSort(sort.col === col ? { col, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'symbol' || col === 'dex' ? 'asc' : 'desc' })}
            onSelect={(r) => select(r.tokenId)} onActivate={(r) => openInDetail(r.tokenId)} onKeyDown={onKey}
            onContextMenu={(r, e) => setMenu({ x: e.clientX, y: e.clientY, row: r })} rowClassName={(r) => (flash.has(String(r.tokenId)) ? 'row-flash' : undefined)} />
        ) : view === 'waiting' ? <WaitingState /> : <NoMatchState onReset={resetFilters} />}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={items(menu.row)} onClose={() => setMenu(null)} /> : null}
      {decisionFor !== null ? (
        <NewDecisionModal tokenId={decisionFor} onClose={() => setDecisionFor(null)}
          onCreated={(id, account) => { if (account === 'real') { useStore.getState().setPendingDrawer({ decisionId: id, fill: 'entry' }); nav('/journal'); } }} />
      ) : null}
    </div>
  );
}

