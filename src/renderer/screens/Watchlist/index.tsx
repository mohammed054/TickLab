import { useCallback, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { WatchRow } from '@shared/types';
import { Table } from '../../components/Table';
import type { Column, TableSort } from '../../components/Table';
import { Input } from '../../components/Input';
import { toast } from '../../components/Toast';
import { buildFeedColumns, SORT_ACCESSORS } from '../Feed/columns';
import { useDetailSelectSync } from '../Feed/keys';
import { invoke, useInvoke, useIpcEvent, useNow, useThrottledCall } from '../../state/hooks';
import { openInDetail } from '../../state/actions';
import { useStore } from '../../state/store';

function NoteCell({ row, onSaved }: { row: WatchRow; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.note);
  const save = async () => {
    setEditing(false);
    const note = text.slice(0, 200);
    if (note === row.note) return;
    const r = await invoke('watchlist:setNote', { tokenId: row.tokenId, note });
    if (!r.ok) toast(r.error.message, 'bad');
    onSaved();
  };
  if (!editing) {
    return <span style={{ cursor: 'text', color: row.note ? 'var(--text-1)' : 'var(--text-3)' }} onClick={(e) => { e.stopPropagation(); setText(row.note); setEditing(true); }}>{row.note || 'Add a note…'}</span>;
  }
  return (
    <Input autoFocus maxLength={200} value={text} aria-label="Note" style={{ height: 20 }} onChange={(e) => setText(e.target.value)} onClick={(e) => e.stopPropagation()}
      onBlur={() => { void save(); }} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } if (e.key === 'Escape') { setText(row.note); setEditing(false); } e.stopPropagation(); }} />
  );
}

export default function WatchlistScreen() {
  const list = useInvoke('watchlist:list', {});
  const reload = useThrottledCall(list.reload, 500);
  useIpcEvent('evt:launches-updated', reload);
  const now = useNow(1000);
  const search = useStore((s) => s.filters.search).trim().toLowerCase();
  const selected = useStore((s) => s.selectedTokenId);
  const select = useStore((s) => s.select);
  const [sort, setSort] = useState<TableSort>({ col: 'age', dir: 'asc' });
  useDetailSelectSync(selected);
  const remove = useCallback(async (tokenId: number) => {
    const r = await invoke('watchlist:remove', { tokenId });
    if (!r.ok) toast(r.error.message, 'bad');
    list.reload();
  }, [list]);
  const columns = useMemo<Column<WatchRow>[]>(() => {
    const base = buildFeedColumns({ now, watched: () => true, onToggleWatch: (r) => { void remove(r.tokenId); } }) as Column<WatchRow>[];
    const note: Column<WatchRow> = { id: 'note', header: 'Note', width: 240, render: (r) => <NoteCell row={r} onSaved={list.reload} /> };
    const star = base.pop();
    return star ? [...base, note, star] : [...base, note];
  }, [now, remove, list.reload]);
  const rows = useMemo(() => {
    const all = (list.data ?? []).filter((r) => !search || [r.symbol, r.name, r.mint].some((x) => x.toLowerCase().includes(search)));
    const acc = SORT_ACCESSORS[sort.col];
    if (!acc) return all;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...all].sort((a, b) => {
      const x = acc(a), y = acc(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [list.data, search, sort]);
  const rowKey = useCallback((r: WatchRow) => String(r.tokenId), []);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="meta" style={{ height: 28, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border)' }}>
        {rows.length} watched · use the search box above to narrow the list
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {!list.loading && rows.length === 0 ? <div className="center-fill">{search ? 'No watched tokens match the search.' : 'Nothing on the watchlist yet. Press W on a row in the Feed to add one.'}</div> : (
          <Table columns={columns} rows={rows} rowKey={rowKey} selectedKey={selected === null ? null : String(selected)} sort={sort}
            onSortChange={(col) => setSort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }))}
            onSelect={(r) => select(r.tokenId)} onActivate={(r) => openInDetail(r.tokenId)}
            onKeyDown={(e, r) => { if (e.key.toLowerCase() === 'w' && r && !e.ctrlKey) { e.preventDefault(); void remove(r.tokenId); } }} />
        )}
      </div>
    </div>
  );
}
