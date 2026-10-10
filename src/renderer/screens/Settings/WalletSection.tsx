import { useState } from 'react';
import { fmtDate } from '@shared/format';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { toast } from '../../components/Toast';
import { invoke } from '../../state/hooks';
import { asStr, Row, Section } from './fields';
import type { SettingsCtx } from './fields';

const B58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
/** A pasted 12/24-word phrase or a 64-byte key (86-90 base58 chars) is never accepted. */
export function looksLikeSecret(s: string): boolean {
  const words = s.trim().split(/\s+/);
  if (words.length === 12 || words.length === 24) return true;
  const t = s.trim();
  return B58.test(t) && t.length >= 80;
}
export const validAddress = (s: string): boolean => B58.test(s) && s.length >= 32 && s.length <= 44;

export function WalletSection({ ctx }: { ctx: SettingsCtx }) {
  const saved = asStr(ctx.values['wallet.address']);
  const [text, setText] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [last, setLast] = useState<number | null>(null);
  const value = text ?? saved;
  const save = async () => {
    const v = value.trim();
    if (looksLikeSecret(v)) { setText(''); setMsg('That looks like a secret. Never paste secrets here.'); return; }
    if (v !== '' && !validAddress(v)) { setMsg('Enter a valid public wallet address.'); return; }
    setMsg(null);
    if (await ctx.save('wallet.address', v === '' ? null : v)) setText(null);
  };
  const sync = async () => {
    const r = await invoke('wallet:sync', {});
    if (!r.ok) { toast(r.error.message, 'bad'); return; }
    setLast(Date.now());
    toast(`Imported ${r.value.imported} trades, ${r.value.unlinked} unlinked`, 'good');
  };
  return (
    <Section title="Wallet" help="Read-only. This app never asks for keys.">
      <Row label="Wallet address" help="Public address only">
        <div className="row-flex"><Input aria-label="Wallet address" spellCheck={false} value={value} onChange={(e) => setText(e.target.value)} className="mono" /><Button variant="secondary" onClick={() => { void save(); }}>Save</Button></div>
      </Row>
      {msg ? <div role="alert" className="bad" style={{ fontSize: 12 }}>{msg}</div> : null}
      <div className="row-flex"><Button variant="secondary" disabled={!saved} onClick={() => { void sync(); }}>Sync now</Button><span className="meta">Last sync: {last ? fmtDate(last) : 'not yet in this session'}</span></div>
    </Section>
  );
}
