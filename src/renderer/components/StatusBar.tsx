import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtBytes, fmtCount } from '@shared/format';
import { ageSecNow, findSource, fmtSecs, stateColor } from './sourceUi';
import { useInvoke, useNow } from '../state/hooks';
import { useStore } from '../state/store';

function Dot({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, margin: '0 4px' }} />;
}

/** 24px bar; every item links to Data Health. */
export function StatusBar() {
  const nav = useNavigate();
  const now = useNow(1000);
  const sources = useStore((s) => s.sources);
  const overview = useInvoke('health:overview', {}, { intervalMs: 10000 }).data;
  const info = useInvoke('app:info', {}).data;
  const gt = findSource(sources, 'geckoterminal') ?? overview?.sources.find((s) => s.source === 'geckoterminal');
  const rpc = findSource(sources, 'rpc') ?? overview?.sources.find((s) => s.source === 'rpc');
  const b = overview?.budgets;
  const items: ReactNode[] = [
    <>GT<Dot color={stateColor(gt?.state)} />{gt?.state ?? 'OFFLINE'} {fmtSecs(ageSecNow(gt, now))}</>,
    <>RPC<Dot color={stateColor(rpc?.state)} />{rpc ? (rpc.state === 'LIVE' ? 'OK' : rpc.state) : '—'}</>,
    <>Gaps {overview?.gaps24h ?? 0}</>,
    <>Tracked {overview?.trackedCount ?? 0} · Deep {overview?.deepCount ?? 0}</>,
    <>API {b?.gtCallsLastMinute ?? 0}/{b?.gtCap ?? 24} per min</>,
    <>RPC credits {fmtCount(b?.rpcCreditsMonth ?? 0)}/{fmtCount(b?.rpcBudget ?? 0)}</>,
  ];
  const cell = { display: 'flex', alignItems: 'center', padding: '0 8px', height: 24, background: 'none', border: 0, fontSize: 11, color: 'var(--text-2)' } as const;
  return (
    <footer style={{ gridColumn: '1 / -1', height: 24, background: 'var(--bg-1)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 4px', fontSize: 11, color: 'var(--text-2)' }}>
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 ? <span style={{ width: 1, height: 12, background: 'var(--border)' }} /> : null}
          <button type="button" style={cell} onClick={() => nav('/health')}>{it}</button>
        </Fragment>
      ))}
      <span className="spacer" />
      <span style={{ ...cell }}>DB {fmtBytes(overview?.dbBytes)}</span>
      <span style={{ width: 1, height: 12, background: 'var(--border)' }} />
      <span style={cell}>v{info?.version ?? '1.0.0'}</span>
    </footer>
  );
}
