import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fmtDate } from '@shared/format';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { toast } from '../../components/Toast';
import { invoke } from '../../state/hooks';

export interface SettingsCtx { values: Record<string, unknown>; save: (key: string, value: unknown) => Promise<boolean> }

export const asNum = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Saves one key; tells the user when a loosened limit is delayed. */
export async function saveSetting(key: string, value: unknown): Promise<boolean> {
  const r = await invoke('settings:set', { key, value });
  if (!r.ok) { toast(r.error.message, 'bad'); return false; }
  toast(r.value.effectiveAt > Date.now() + 5000 ? `Saved. Takes effect ${fmtDate(r.value.effectiveAt)}.` : 'Saved', r.value.effectiveAt > Date.now() + 5000 ? 'warn' : 'good');
  return true;
}

export function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, margin: 0 }}>{title}</h2>
      {help ? <p style={{ fontSize: 12, lineHeight: '16px', color: 'var(--text-2)', margin: '2px 0 8px' }}>{help}</p> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </section>
  );
}

export function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12, alignItems: 'center' }}>
      <div><div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>{help ? <div className="meta">{help}</div> : null}</div>
      <div>{children}</div>
    </div>
  );
}

export function NumberSetting({ ctx, k, label, help, min = 0, step = 'any', integer = false }: { ctx: SettingsCtx; k: string; label: string; help?: string; min?: number; step?: string; integer?: boolean }) {
  const current = asNum(ctx.values[k]);
  const [text, setText] = useState(String(current));
  useEffect(() => { setText(String(current)); }, [current]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))) { setText(String(current)); return; }
    if (n !== current) void ctx.save(k, n);
  };
  return (
    <Row label={label} help={help}>
      <Input numeric type="number" min={min} step={step} aria-label={label} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
    </Row>
  );
}

export function TextSetting({ ctx, k, label, help, placeholder }: { ctx: SettingsCtx; k: string; label: string; help?: string; placeholder?: string }) {
  const current = asStr(ctx.values[k]);
  const [text, setText] = useState(current);
  useEffect(() => { setText(current); }, [current]);
  const commit = () => { if (text.trim() !== current) void ctx.save(k, text.trim()); };
  return (
    <Row label={label} help={help}>
      <Input aria-label={label} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
    </Row>
  );
}

/** Write-only: the stored value is never read back. Shows `•••• saved` when a secret exists. */
export function SecretField({ name, label, help }: { name: 'rpcKey' | 'openrouterKey'; label: string; help?: string }) {
  const [has, setHas] = useState(false);
  const [value, setValue] = useState('');
  const refresh = () => { void invoke('secret:has', { name }).then((r) => setHas(r.ok && r.value)); };
  useEffect(refresh, [name]);
  const save = async () => {
    const r = await invoke('secret:set', { name, value: value.trim() });
    setValue('');
    if (!r.ok) { toast(r.error.message, 'bad'); return; }
    toast('Key saved', 'good'); refresh();
  };
  return (
    <Row label={label} help={help}>
      <div className="row-flex">
        <Input type="password" autoComplete="off" aria-label={label} placeholder={has ? '•••• saved' : 'Not set'} value={value} maxLength={500} onChange={(e) => setValue(e.target.value)} />
        <Button variant="secondary" disabled={!value.trim()} onClick={() => { void save(); }}>Save</Button>
      </div>
    </Row>
  );
}
