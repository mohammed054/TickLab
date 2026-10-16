// Read-only risk state display (Legacy Archive, T1.5). No acknowledgement or
// limit changes can be triggered; the current risk state is shown as recorded.
import { fmtDate } from '@shared/format';
import type { Account, RiskState } from '@shared/types';
import { activeText, pausedText } from './riskText';

export function RiskPanel({ account: _account, risk, onChanged: _onChanged }: { account: Account; risk: RiskState | null; onChanged: () => void }) {
  if (!risk) return <div className="panel" style={{ height: 56 }} />;
  return (
    <div className="panel" style={{ height: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderColor: risk.active ? 'var(--border)' : 'var(--bad)' }}>
      <span style={{ fontWeight: 700, color: risk.active ? 'var(--good)' : 'var(--bad)' }}>{risk.active ? 'ACTIVE' : 'PAUSED'}</span>
      <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{risk.active ? `— ${activeText(risk)}` : `— ${pausedText(risk)}`}</span>
      {risk.pendingLimits.length > 0 ? <span className="meta">{risk.pendingLimits.length} limit change(s) pending, next at {fmtDate(Math.min(...risk.pendingLimits.map((p) => p.effectiveAt)))}</span> : null}
      <span className="spacer" />
      <span className="meta" style={{ fontSize: 11 }}>Read-only legacy record</span>
    </div>
  );
}
