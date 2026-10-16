import { useState } from 'react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
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
  const value = text ?? saved;
  const save = async () => {
    const v = value.trim();
    if (looksLikeSecret(v)) { setText(''); setMsg('That looks like a secret. Never paste secrets here.'); return; }
    if (v !== '' && !validAddress(v)) { setMsg('Enter a valid public wallet address.'); return; }
    setMsg(null);
    if (await ctx.save('wallet.address', v === '' ? null : v)) setText(null);
  };
  return (
    <Section title="Wallet address" help="Public address only. Read-only legacy field; wallet import and sync were removed in T1.5.">
      <Row label="Wallet address">
        <div className="row-flex"><Input aria-label="Wallet address" spellCheck={false} value={value} onChange={(e) => setText(e.target.value)} className="mono" /><Button variant="secondary" onClick={() => { void save(); }}>Save</Button></div>
      </Row>
      {msg ? <div role="alert" className="bad" style={{ fontSize: 12 }}>{msg}</div> : null}
    </Section>
  );
}
