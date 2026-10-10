import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { Chip } from '../../components/Chip';
import { Input, Select } from '../../components/Input';
import { Toggle } from '../../components/Toggle';
import { bandColor } from '../../components/ScoreChip';
import { useStore } from '../../state/store';
import type { Band } from '@shared/types';

const AGES: { label: string; min: number | null }[] = [
  { label: '<5m', min: 5 }, { label: '<15m', min: 15 }, { label: '<1h', min: 60 }, { label: '<6h', min: 360 }, { label: '<24h', min: 1440 }, { label: 'All', min: null },
];
const LIQ_QUICK = [1000, 5000, 25000];
const BANDS: Band[] = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'];
const COMPLETENESS = [{ v: 0, l: 'Any' }, { v: 0.25, l: '≥25%' }, { v: 0.5, l: '≥50%' }, { v: 0.75, l: '≥75%' }];
const MAX_DEX = 8;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="label" style={{ marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </section>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 2, border: `1px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`, background: active ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'var(--bg-3)', color: active ? 'var(--accent)' : 'var(--text-1)' }}>
      {children}
    </button>
  );
}

/** 240px rail, padding 12, 16px between sections; Reset is pinned at the bottom. */
export function FilterRail() {
  const f = useStore((s) => s.filters);
  const set = useStore((s) => s.setFilters);
  const reset = useStore((s) => s.resetFilters);
  const known = useStore((s) => s.knownDexes);
  const shown = [...known].sort().slice(0, MAX_DEX);
  const other = [...known].sort().slice(MAX_DEX);
  const checked = (d: string) => f.dexes === null || f.dexes.includes(d);
  const setDexes = (next: string[]) => set({ dexes: next.length >= known.length ? null : next });
  const toggleDex = (d: string) => setDexes(checked(d) ? (f.dexes ?? known).filter((x) => x !== d) : [...(f.dexes ?? []), d]);
  const otherOn = other.length > 0 && other.every(checked);
  const toggleOther = () => setDexes(otherOn ? (f.dexes ?? known).filter((x) => !other.includes(x)) : [...(f.dexes ?? []), ...other.filter((x) => !checked(x))]);
  const toggleBand = (b: Band) => set({ bands: f.bands.includes(b) ? f.bands.filter((x) => x !== b) : [...f.bands, b] });
  return (
    <aside aria-label="Filters" style={{ width: 240, flex: 'none', background: 'var(--bg-1)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="scroll-y" style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Section title="Age">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {AGES.map((a) => <Pill key={a.label} active={f.ageMaxMin === a.min} onClick={() => set({ ageMaxMin: a.min })}>{a.label}</Pill>)}
          </div>
        </Section>
        <Section title="Min liquidity">
          <Input numeric type="number" min={0} aria-label="Min liquidity USD" placeholder="0" value={f.minLiquidityUsd === 0 ? '' : f.minLiquidityUsd}
            onChange={(e) => set({ minLiquidityUsd: Math.max(0, Number(e.target.value) || 0) })} />
          <div style={{ display: 'flex', gap: 4 }}>
            {LIQ_QUICK.map((v) => <Pill key={v} active={f.minLiquidityUsd === v} onClick={() => set({ minLiquidityUsd: v })}>{`$${v / 1000}K`}</Pill>)}
          </div>
        </Section>
        <Section title="Risk band">
          {BANDS.map((b) => (
            <Checkbox key={b} checked={f.bands.includes(b)} onChange={() => toggleBand(b)}>
              <Chip color={bandColor(b)}>{b}</Chip>
            </Checkbox>
          ))}
        </Section>
        <Section title="Min data completeness">
          <Select aria-label="Min data completeness" value={String(f.minCompleteness)} onChange={(e) => set({ minCompleteness: Number(e.target.value) })}>
            {COMPLETENESS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </Select>
        </Section>
        <Section title="DEX">
          {known.length === 0 ? <span className="meta">No DEX values yet.</span> : null}
          {shown.map((d) => <Checkbox key={d} checked={checked(d)} onChange={() => toggleDex(d)}>{d}</Checkbox>)}
          {other.length > 0 ? <Checkbox checked={otherOn} onChange={toggleOther}>Other</Checkbox> : null}
        </Section>
        <Section title="Toggles">
          {([['Watchlist only', 'watchlistOnly'], ['Hide LOW DATA', 'hideLowData'], ['Alerts only', 'alertsOnly']] as const).map(([label, key]) => (
            <label key={key} className="row-flex" style={{ justifyContent: 'space-between', fontSize: 12 }}>
              {label}<Toggle label={label} checked={f[key]} onChange={(v) => set({ [key]: v })} />
            </label>
          ))}
        </Section>
      </div>
      <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
        <Button variant="secondary" style={{ width: '100%' }} onClick={reset}>Reset filters</Button>
      </div>
    </aside>
  );
}
