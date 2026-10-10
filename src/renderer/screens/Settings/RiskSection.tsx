import { fmtDate } from '@shared/format';
import { NumberSetting, Section } from './fields';
import type { SettingsCtx } from './fields';

export interface Pending { key: string; value: unknown; effectiveAt: number }

export function RiskSection({ ctx, pending }: { ctx: SettingsCtx; pending: Pending[] }) {
  return (
    <Section title="Risk limits" help="Loosening a limit takes 24 hours to apply. Tightening applies immediately.">
      <NumberSetting ctx={ctx} k="risk.maxPositionPct" label="Max position (% of equity)" step="0.5" />
      <NumberSetting ctx={ctx} k="risk.maxOpenPositions" label="Max open positions" integer min={1} />
      <NumberSetting ctx={ctx} k="risk.maxDrawdownPct" label="Pause at drawdown (%)" step="0.5" />
      <NumberSetting ctx={ctx} k="risk.maxLosingTradesPerDay" label="Pause after losing trades in a day" integer min={1} />
      {pending.length > 0 ? (
        <div className="panel" style={{ padding: 8 }}>
          <div className="label" style={{ marginBottom: 4 }}>Pending changes</div>
          {pending.map((p, i) => <div key={`${p.key}${i}`} className="mono" style={{ fontSize: 12 }}>{p.key} → {String(p.value)} · effective {fmtDate(p.effectiveAt)}</div>)}
        </div>
      ) : null}
    </Section>
  );
}
