import { useMemo } from 'react';
import { Checkbox } from '../../components/Checkbox';
import { useInvoke } from '../../state/hooks';
import { NumberSetting, Row, SecretField, Section } from './fields';
import type { SettingsCtx } from './fields';

export const MAX_MODELS = 3;

export function AiSection({ ctx }: { ctx: SettingsCtx }) {
  const models = useInvoke('ai:models', {});
  const stored = useMemo(() => (Array.isArray(ctx.values['ai.models']) ? (ctx.values['ai.models'] as unknown[]).filter((x): x is string => typeof x === 'string') : []), [ctx.values]);
  const toggle = (id: string, on: boolean) => {
    const next = on ? [...stored, id].slice(0, MAX_MODELS) : stored.filter((x) => x !== id);
    void ctx.save('ai.models', next);
  };
  const list = models.data ?? [];
  return (
    <Section title="AI helper" help="Uses free OpenRouter models only. Pick up to 3: the first is tried first, the others are fallbacks.">
      <SecretField name="openrouterKey" label="OpenRouter key" help="Saved encrypted. Never displayed." />
      <Row label="Models" help={`${stored.length}/${MAX_MODELS} selected`}>
        <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {models.loading ? <span className="meta">Loading…</span> : null}
          {models.error ? <span className="meta">{models.error}</span> : null}
          {list.map((m) => (
            <Checkbox key={m.id} checked={stored.includes(m.id)} disabled={!stored.includes(m.id) && stored.length >= MAX_MODELS} onChange={(on) => toggle(m.id, on)}>
              <span className="truncate" title={m.id}>{stored.indexOf(m.id) >= 0 ? `${stored.indexOf(m.id) + 1}. ` : ''}{m.name}</span>
            </Checkbox>
          ))}
        </div>
      </Row>
      {stored.filter((id) => !list.some((m) => m.id === id)).length > 0 && !models.loading && !models.error ? <div className="meta warn">A saved model is no longer in the free list and will be dropped.</div> : null}
      <NumberSetting ctx={ctx} k="ai.dailyLimit" label="Daily request limit" integer min={1} />
    </Section>
  );
}
