import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { fmtAge, fmtDate, fmtUsd } from '@shared/format';
import type { Trade } from '@shared/types';
import { AddrText } from '../../components/AddrText';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Input } from '../../components/Input';
import { Table } from '../../components/Table';
import type { Column } from '../../components/Table';
import { useDebounced, useInvoke, useNow } from '../../state/hooks';
import { openExternal, solscanTxUrl } from '../../state/actions';
import { usdPrice } from '../Feed/columns';

const columns: Column<Trade>[] = [
  { id: 'time', header: 'Time', width: 88, render: (t) => fmtDate(t.blockTime) },
  { id: 'side', header: 'Side', width: 56, render: (t) => <Chip color={t.side === 'buy' ? 'var(--good)' : 'var(--bad)'}>{t.side.toUpperCase()}</Chip> },
  { id: 'usd', header: 'USD', width: 88, align: 'right', render: (t) => fmtUsd(t.usdValue) },
  { id: 'price', header: 'Price', width: 96, align: 'right', render: (t) => usdPrice(t.priceUsd) },
  { id: 'tokens', header: 'Tokens', width: 110, align: 'right', render: (t) => (t.tokenAmount === null ? '—' : t.tokenAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })) },
  { id: 'wallet', header: 'Wallet', width: 110, render: (t) => <AddrText value={t.wallet} /> },
  {
    id: 'tx', header: 'Tx', width: 64,
    render: (t) => <Button variant="ghost" iconOnly aria-label="Open transaction on Solscan" style={{ height: 20, width: 20 }} icon={<ExternalLink size={14} strokeWidth={1.5} />} onClick={(e) => { e.stopPropagation(); void openExternal(solscanTxUrl(t.txSig)); }} />,
  },
];

export function Trades({ tokenId }: { tokenId: number }) {
  const [minText, setMinText] = useState('');
  const minUsd = useDebounced(Math.max(0, Number(minText) || 0), 300);
  const q = useInvoke('detail:trades', minUsd > 0 ? { tokenId, minUsd } : { tokenId }, { intervalMs: 15000 });
  const now = useNow(1000);
  const rows = useMemo(() => (q.data ?? []).slice(0, 300), [q.data]);
  const stats = useMemo(() => {
    const buys = rows.filter((t) => t.side === 'buy');
    return { buyers: new Set(buys.map((t) => t.wallet)).size, buys: buys.length, sells: rows.length - buys.length, last: rows.reduce((m, t) => Math.max(m, t.blockTime), 0) };
  }, [rows]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 300 }}>
      <div className="row-flex" style={{ height: 28, flex: 'none', fontSize: 12, color: 'var(--text-2)', gap: 16 }}>
        <span>Unique buyers {stats.buyers} · Buys {stats.buys} / Sells {stats.sells} · Last trade {stats.last ? `${fmtAge(now - stats.last)} ago` : '—'}</span>
        <span className="spacer" />
        <label className="row-flex" style={{ fontSize: 11 }}>Min $<Input numeric type="number" min={0} aria-label="Minimum trade USD" style={{ width: 80 }} value={minText} onChange={(e) => setMinText(e.target.value)} /></label>
      </div>
      <div className="panel" style={{ flex: 1, minHeight: 0 }}>
        <Table columns={columns} rows={rows} rowKey={(t) => t.txSig + t.wallet + t.blockTime} emptyText={q.loading ? 'Loading…' : 'Trades older than 24 h are not available from the free source.'} />
      </div>
    </div>
  );
}
