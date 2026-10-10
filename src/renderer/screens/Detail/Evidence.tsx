import type { StoredJudgement } from '@shared/types';
import { fmtDate } from '@shared/format';
import { Chip } from '../../components/Chip';
import { ruleName } from '../../rules';

const STATUS_COLOR = { hit: 'var(--bad)', clear: 'var(--good)', unknown: 'var(--text-2)' } as const;

function dataTime(evidence: Record<string, unknown>, fallback: number): number {
  for (const [k, v] of Object.entries(evidence)) if (/ObservedAt$|CheckedAt$|At$/.test(k) && typeof v === 'number' && v > 1e11) return v;
  return fallback;
}

export function Evidence({ judgement }: { judgement: StoredJudgement | null }) {
  if (!judgement) return <div className="muted">No judgement yet.</div>;
  const version = judgement.rulesVersion.replace(/^rules_/, 'Rules ');
  return (
    <div>
      <div className="meta" style={{ marginBottom: 8 }}>{version} · computed {fmtDate(judgement.computedAt)} · inputs hash {judgement.inputsHash.slice(0, 6)}…</div>
      <table className="dense" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr><th style={{ width: 160 }}>Rule ID</th><th style={{ width: 220 }}>Name</th><th style={{ width: 80 }}>Status</th><th className="r" style={{ width: 64 }}>Points</th><th>Evidence</th><th style={{ width: 120 }}>Data time</th></tr>
        </thead>
        <tbody>
          {judgement.results.map((r) => (
            <tr key={r.ruleId} style={{ minHeight: 24 }}>
              <td className="mono">{r.ruleId}</td>
              <td>{ruleName(r.ruleId)}</td>
              <td><Chip color={STATUS_COLOR[r.status]}>{r.status.toUpperCase()}</Chip></td>
              <td className="num">{r.points}</td>
              <td><pre className="mono" style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(r.evidence, null, 2)}</pre></td>
              <td className="mono" style={{ fontSize: 11 }}>{fmtDate(dataTime(r.evidence, judgement.computedAt))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
