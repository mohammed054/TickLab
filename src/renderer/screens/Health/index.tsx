import { fmtAge, fmtBytes, fmtCount, fmtDate } from '@shared/format';
import type { SourceStatus } from '@shared/types';
import { Button } from '../../components/Button';
import { StatCard } from '../../components/StatCard';
import { toast } from '../../components/Toast';
import { stateColor } from '../../components/sourceUi';
import { invoke, useInvoke, useIpcEvent } from '../../state/hooks';

const SOURCE_NAMES: Record<SourceStatus['source'], string> = { geckoterminal: 'GeckoTerminal', rpc: 'Solana RPC' };

function Budget({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  const color = pct >= 90 ? 'var(--bad)' : pct >= 70 ? 'var(--warn)' : 'var(--accent)';
  return (
    <div>
      <div className="row-flex" style={{ fontSize: 12, marginBottom: 4 }}><span>{label}</span><span className="spacer" /><span className="mono">{fmtCount(used)} / {fmtCount(cap)}</span></div>
      <div className="bar-track" style={{ height: 8 }}><div className="bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

export default function HealthScreen() {
  const ov = useInvoke('health:overview', {}, { intervalMs: 5000 });
  const gaps = useInvoke('health:gaps', { limit: 100 }, { intervalMs: 30000 });
  const errors = useInvoke('health:errors', { limit: 100 }, { intervalMs: 15000 });
  useIpcEvent('evt:source-status', () => ov.reload());
  const o = ov.data;
  const action = async (ch: 'health:backfill' | 'health:diagnostics') => {
    const r = ch === 'health:backfill' ? await invoke(ch, {}) : await invoke(ch, {});
    if (!r.ok) { toast(r.error.message, 'bad'); return; }
    toast(ch === 'health:backfill' ? 'Backfill started' : `Diagnostics saved to ${(r.value as { path: string }).path}`, 'good');
    gaps.reload();
  };
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="row-flex">
        <span className="mono" style={{ fontSize: 12 }}>Snapshot interval x{(o?.intervalMultiplier ?? 1).toFixed(1)}</span>
        <span className="spacer" />
        <Button variant="secondary" onClick={() => { void action('health:backfill'); }}>Run backfill now</Button>
        <Button variant="secondary" onClick={() => { void action('health:diagnostics'); }}>Export diagnostics</Button>
      </div>
      {ov.error && !o ? <div className="err-box">{ov.error}</div> : null}
      {(o?.sources ?? []).map((s) => (
        <section key={s.source}>
          <h3 className="section-title" style={{ marginBottom: 8 }}>{SOURCE_NAMES[s.source]}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatCard label="State" value={<span style={{ color: stateColor(s.state) }}>{s.state}</span>} />
            <StatCard label="Last OK" value={s.lastOkAt ? fmtDate(s.lastOkAt) : '—'} sub={s.ageSec === null ? undefined : `${fmtAge(s.ageSec * 1000)} ago`} />
            <StatCard label="Calls today" value={fmtCount(s.callsToday)} />
            <StatCard label="Errors today" value={fmtCount(s.errorsToday)} valueClass={s.errorsToday > 0 ? 'warn' : ''} />
          </div>
        </section>
      ))}
      <section className="panel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
        <h3 className="section-title">Budgets</h3>
        <Budget label="GeckoTerminal calls, last minute" used={o?.budgets.gtCallsLastMinute ?? 0} cap={o?.budgets.gtCap ?? 24} />
        <Budget label="RPC credits, this month" used={o?.budgets.rpcCreditsMonth ?? 0} cap={o?.budgets.rpcBudget ?? 0} />
        <Budget label="AI requests today" used={o?.budgets.aiToday ?? 0} cap={o?.budgets.aiLimit ?? 0} />
        <div className="meta">Database {fmtBytes(o?.dbBytes)} · tracked {o?.trackedCount ?? 0} · deep {o?.deepCount ?? 0} · skipped quote pairs {o?.skippedQuote ?? 0}</div>
      </section>
      <section>
        <h3 className="section-title" style={{ marginBottom: 8 }}>Gaps</h3>
        <table className="dense"><thead><tr><th>Start</th><th>End</th><th>Duration</th><th>Reason</th><th>Source</th></tr></thead>
          <tbody>
            {(gaps.data ?? []).map((g) => <tr key={g.id}><td className="mono">{fmtDate(g.startAt)}</td><td className="mono">{fmtDate(g.endAt)}</td><td className="mono">{fmtAge(g.endAt - g.startAt)}</td><td>{g.reason}</td><td>{g.source}</td></tr>)}
            {(gaps.data ?? []).length === 0 ? <tr><td colSpan={5} className="muted">No gaps recorded.</td></tr> : null}
          </tbody></table>
      </section>
      <section>
        <h3 className="section-title" style={{ marginBottom: 8 }}>Errors (last 100)</h3>
        <table className="dense"><thead><tr><th style={{ width: 110 }}>Time</th><th style={{ width: 120 }}>Source</th><th style={{ width: 140 }}>Code</th><th>Message</th></tr></thead>
          <tbody>
            {(errors.data ?? []).map((e) => <tr key={e.id}><td className="mono">{fmtDate(e.at)}</td><td>{e.source}</td><td className="mono">{e.code}</td><td>{e.message}</td></tr>)}
            {(errors.data ?? []).length === 0 ? <tr><td colSpan={4} className="muted">No errors.</td></tr> : null}
          </tbody></table>
      </section>
    </div>
  );
}
