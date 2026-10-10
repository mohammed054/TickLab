import type { FrozenConfig, LabParams } from '@shared/types';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { Field, Input, Select } from '../../components/Input';
import { Segmented } from '../../components/Tabs';
import { DAY, HORIZONS } from './labDefaults';

type Rule = LabParams['alertRule'];
const RULE_FIELDS: { key: keyof Rule; label: string; step: string }[] = [
  { key: 'maxScore', label: 'Max risk score', step: '1' }, { key: 'minCompleteness', label: 'Min completeness (0-1)', step: '0.05' },
  { key: 'minLiquidityUsd', label: 'Min liquidity USD', step: '100' }, { key: 'minBuyersH1', label: 'Min buyers 1h', step: '1' },
  { key: 'minAgeMin', label: 'Min age (min)', step: '1' }, { key: 'maxAgeMin', label: 'Max age (min)', step: '1' },
];
const dateStr = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export interface LabFormProps {
  params: LabParams; onChange: (p: LabParams) => void; configs: FrozenConfig[]; frozen: boolean;
  onPick: (id: number | null) => void; onRun: () => void; onFreeze: () => void; onCopy: () => void; busy: boolean;
}

/** 320px form panel. A frozen config is read-only; "Copy as new config" starts an editable copy. */
export function LabForm({ params, onChange, configs, frozen, onPick, onRun, onFreeze, onCopy, busy }: LabFormProps) {
  const set = (patch: Partial<LabParams>) => onChange({ ...params, ...patch });
  const n = (v: string) => (v.trim() === '' ? 0 : Number(v));
  const ro = frozen;
  return (
    <aside className="scroll-y" style={{ width: 320, flex: 'none', background: 'var(--bg-1)', borderRight: '1px solid var(--border)', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Lab form">
      <Field label="Rules config">
        <Select value={params.configId === null ? '' : String(params.configId)} onChange={(e) => onPick(e.target.value === '' ? null : Number(e.target.value))} aria-label="Rules config">
          <option value="">Current settings (not frozen)</option>
          {configs.map((c) => <option key={c.id} value={c.id}>{`${c.name} · ${c.sha256.slice(0, 8)}`}</option>)}
        </Select>
      </Field>
      {frozen ? <div className="row-flex"><span className="meta" style={{ flex: 1 }}>Frozen configs cannot be edited.</span><Button variant="secondary" onClick={onCopy}>Copy as new config</Button></div> : null}
      <div className="label">Alert rule</div>
      {RULE_FIELDS.map((f) => (
        <Field key={f.key} label={f.label}>
          <Input numeric type="number" step={f.step} disabled={ro} value={params.alertRule[f.key]} onChange={(e) => set({ alertRule: { ...params.alertRule, [f.key]: n(e.target.value) } })} aria-label={f.label} />
        </Field>
      ))}
      <Field label="Size USD"><Input numeric type="number" min={0} disabled={ro} value={params.sizeUsd} onChange={(e) => set({ sizeUsd: n(e.target.value) })} aria-label="Size USD" /></Field>
      <div>
        <span className="field-label">Horizons</span>
        <div className="row-flex" style={{ gap: 12 }}>
          {HORIZONS.map((h) => (
            <Checkbox key={h.min} disabled={ro} checked={params.horizonsMin.includes(h.min)} onChange={(on) => set({ horizonsMin: HORIZONS.map((x) => x.min).filter((m) => (m === h.min ? on : params.horizonsMin.includes(m))) })}>{h.label}</Checkbox>
          ))}
        </div>
      </div>
      <Field label="Fee % per side"><Input numeric type="number" step="0.1" min={0} disabled={ro} value={params.feePctPerSide} onChange={(e) => set({ feePctPerSide: n(e.target.value) })} aria-label="Fee percent" /></Field>
      <Field label="Network fee USD"><Input numeric type="number" step="0.01" min={0} disabled={ro} value={params.networkFeeUsd} onChange={(e) => set({ networkFeeUsd: n(e.target.value) })} aria-label="Network fee USD" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="From"><Input type="date" disabled={ro} value={dateStr(params.fromTs)} onChange={(e) => { const t = Date.parse(e.target.value); if (Number.isFinite(t)) set({ fromTs: t }); }} aria-label="From date" /></Field>
        <Field label="To"><Input type="date" disabled={ro} value={dateStr(params.toTs)} onChange={(e) => { const t = Date.parse(e.target.value); if (Number.isFinite(t)) set({ toTs: t + DAY - 1 }); }} aria-label="To date" /></Field>
      </div>
      <Field label="Seed"><Input numeric type="number" step="1" disabled={ro} value={params.seed} onChange={(e) => set({ seed: Math.trunc(n(e.target.value)) })} aria-label="Seed" /></Field>
      <div><span className="field-label">Missing-data mode</span>
        <Segmented disabled={ro} options={[{ id: 'conservative', label: 'Conservative' }, { id: 'optimistic', label: 'Optimistic' }]} value={params.missingMode} onChange={(m) => set({ missingMode: m })} /></div>
      <div className="row-flex" style={{ marginTop: 4 }}>
        <Button variant="primary" disabled={busy || params.horizonsMin.length === 0 || params.fromTs >= params.toTs} onClick={onRun}>Run</Button>
        <Button variant="secondary" disabled={busy || frozen} onClick={onFreeze}>Freeze this config</Button>
      </div>
    </aside>
  );
}
