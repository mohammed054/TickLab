import { useState } from 'react';
import { fmtPct } from '@shared/format';
import type { LabResult, LabStats } from '@shared/types';
import { Chip } from '../../components/Chip';
import { Segmented } from '../../components/Tabs';
import { HORIZONS } from './labDefaults';
import { Histogram } from './Histogram';

type SetKey = 'alerts' | 'all' | 'random';
const SETS: { id: SetKey; label: string }[] = [{ id: 'alerts', label: 'Alerts' }, { id: 'all', label: 'Baseline ALL' }, { id: 'random', label: 'Baseline RANDOM' }];

export function VerdictChip({ verdict }: { verdict: LabResult['verdict'] }) {
  const signal = verdict !== 'EDGE NOT PROVEN';
  return <Chip color={signal ? 'var(--accent)' : 'var(--text-2)'} style={{ height: 28, padding: '0 12px', fontSize: 12, fontWeight: 700 }}>{verdict}</Chip>;
}
const p = (v: number | null): string => (v === null ? '—' : fmtPct(v, false));
const rate = (v: number | null): string => (v === null ? '—' : fmtPct(v * 100, false));

export function LabResults({ result }: { result: LabResult }) {
  const horizons = result.params.horizonsMin;
  const [h, setH] = useState<number>(horizons.includes(240) ? 240 : (horizons[0] ?? 60));
  const [sel, setSel] = useState<SetKey>('alerts');
  const mode = result.params.missingMode;
  const stat = (k: SetKey): LabStats | undefined => result.sets[k]?.[String(h)]?.[mode];
  const q = result.quality;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="row-flex"><VerdictChip verdict={result.verdict} /><span className="meta">{result.nAlerts} alerts replayed</span></div>
      <div className="row-flex"><span className="label">Horizon</span>
        <Segmented options={horizons.map((m) => ({ id: String(m), label: HORIZONS.find((x) => x.min === m)?.label ?? `${m}m` }))} value={String(h)} onChange={(v) => setH(Number(v))} /></div>
      <table className="dense">
        <thead><tr><th>Set</th><th className="r">n</th><th className="r">Mean %</th><th className="r">95% CI</th><th className="r">Median</th><th className="r">p10</th><th className="r">Worst</th><th className="r">Win rate</th><th className="r">Rugged %</th><th className="r">Unknown %</th></tr></thead>
        <tbody>
          {SETS.map((s) => {
            const x = stat(s.id);
            return (
              <tr key={s.id} className="clickable" aria-selected={sel === s.id} onClick={() => setSel(s.id)} style={sel === s.id ? { background: 'var(--bg-3)' } : undefined}>
                <td>{s.label}</td><td className="num">{x?.n ?? '—'}</td><td className="num">{p(x?.meanReturn ?? null)}</td>
                <td className="num">{x?.ci ? `${x.ci[0].toFixed(1)} to ${x.ci[1].toFixed(1)}` : '—'}</td>
                <td className="num">{p(x?.medianReturn ?? null)}</td><td className="num">{p(x?.p10 ?? null)}</td><td className="num">{p(x?.worst ?? null)}</td>
                <td className="num">{rate(x?.winRate ?? null)}</td><td className="num">{rate(x?.ruggedRate ?? null)}</td><td className="num">{rate(x?.unknownRate ?? null)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div><div className="label" style={{ marginBottom: 4 }}>Return histogram: {SETS.find((s) => s.id === sel)?.label}</div><Histogram bins={stat(sel)?.histogram ?? []} /></div>
      <section className="panel" style={{ padding: 12 }}>
        <h3 className="section-title" style={{ marginBottom: 4 }}>Data quality</h3>
        <div style={{ fontSize: 12, lineHeight: '18px' }}>
          <div>Candidates: {q.candidates} · excluded for gaps: {q.excludedForGaps} · fewer than 3 snapshots: {q.fewSnapshots}</div>
          <div>Most-unknown rules: {q.mostUnknownRules.length ? q.mostUnknownRules.map((r) => `${r.ruleId} (${r.count})`).join(', ') : 'none'}</div>
          {result.diffCi240 ? <div>Alerts minus ALL (4h, 95% CI): {result.diffCi240[0].toFixed(1)} to {result.diffCi240[1].toFixed(1)}</div> : null}
        </div>
      </section>
      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Past replay with assumed costs. Not a forecast.</div>
    </div>
  );
}
