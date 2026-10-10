import { useEffect, useState } from 'react';
import type { LabParams, LabResult } from '@shared/types';
import { Button } from '../../components/Button';
import { Field, Input } from '../../components/Input';
import { Modal, ModalButtons } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { toast } from '../../components/Toast';
import { invoke, useInvoke } from '../../state/hooks';
import { LabForm } from './LabForm';
import { LabResults } from './LabResults';
import { defaultParams, parseFrozen } from './labDefaults';

export default function LabScreen() {
  const settings = useInvoke('settings:get', {});
  const configs = useInvoke('lab:configs', {});
  const [params, setParams] = useState<LabParams>(() => defaultParams());
  const [result, setResult] = useState<LabResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => { if (settings.data) setParams((p) => (p.configId === null ? { ...defaultParams(settings.data ?? {}), seed: p.seed, fromTs: p.fromTs, toTs: p.toTs } : p)); }, [settings.data]);
  const list = configs.data ?? [];
  const frozen = params.configId !== null;
  const pick = (id: number | null) => {
    if (id === null) { setParams({ ...defaultParams(settings.data ?? {}) }); return; }
    const c = list.find((x) => x.id === id);
    const parsed = c ? parseFrozen(c) : null;
    if (parsed) setParams(parsed); else toast('That config could not be read.', 'bad');
  };
  const run = async () => {
    setBusy(true); setError(null);
    const r = await invoke('lab:run', params);
    setBusy(false);
    if (r.ok) setResult(r.value); else setError(r.error.message);
  };
  const freeze = async () => {
    const r = await invoke('lab:freeze', { name: name.trim(), params: { ...params, configId: null } });
    if (!r.ok) { toast(r.error.message, 'bad'); return; }
    toast(`Config frozen (${r.value.sha256.slice(0, 8)})`, 'good');
    setNaming(false); setName(''); configs.reload();
  };
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <LabForm params={params} onChange={setParams} configs={list} frozen={frozen} onPick={pick} onRun={() => { void run(); }} onFreeze={() => setNaming(true)} onCopy={() => setParams({ ...params, configId: null })} busy={busy} />
      <div className="scroll-y" style={{ flex: 1, padding: 16 }}>
        {busy ? <Spinner label="Replaying history…" /> : null}
        {error ? <div className="err-box">{error}</div> : null}
        {!busy && !error && !result ? <div className="muted">Set the alert rule and press Run to replay it over past launches. Past replay with assumed costs. Not a forecast.</div> : null}
        {!busy && result ? <LabResults result={result} /> : null}
      </div>
      <Modal open={naming} onClose={() => setNaming(false)} width={400} title="Freeze this config">
        <Field label="Name"><Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} aria-label="Config name" /></Field>
        <p className="meta" style={{ margin: '8px 0 0' }}>A frozen config is stored with its checksum and cannot be edited. Changes create a new config.</p>
        <ModalButtons><Button variant="ghost" onClick={() => setNaming(false)}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={() => { void freeze(); }}>Freeze</Button></ModalButtons>
      </Modal>
    </div>
  );
}
