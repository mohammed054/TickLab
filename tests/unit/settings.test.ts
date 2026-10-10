import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../src/main/db/open';
import { migrate } from '../../src/main/db/migrate';
import { SettingsStore } from '../../src/main/settings/store';
import { DEFAULT_SETTINGS } from '../../src/main/settings/defaults';
import { createFileSecretStore } from '../../src/main/settings/secrets';

const H = 3_600_000;
let db: ReturnType<typeof openDb>; let s: SettingsStore;
beforeEach(() => { db = openDb(':memory:'); migrate(db); s = new SettingsStore(db); });

describe('settings', () => {
  it('defaults load', () => {
    expect(s.get('risk.maxPositionPct')).toBe(5);
    expect(s.get('alerts.maxScore')).toBe(30);
    expect(Object.keys(s.getAll()).length).toBeGreaterThan(30);
  });
  it('rejects invalid values', () => {
    expect(() => s.set('alerts.minCompleteness', 5)).toThrow();
    expect(() => s.set('ai.models', ['gpt-4'])).toThrow();
    expect(() => s.set('nope', 1)).toThrow();
  });
  it('loosening risk.maxPositionPct 5->8 is audited with effective_at = now+24h and not yet applied', () => {
    const now = 1_000_000_000_000;
    const r = s.set('risk.maxPositionPct', 8, now);
    expect(r.effectiveAt).toBe(now + 24 * H);
    const a = db.prepare('SELECT * FROM settings_audit').get() as { effective_at: number; changed_at: number };
    expect(a.effective_at).toBe(now + 24 * H); expect(a.changed_at).toBe(now);
    expect(s.effectiveLimits(now).maxPositionPct).toBe(5);
    expect(s.effectiveLimits(now + 24 * H - 1).maxPositionPct).toBe(5);
    expect(s.effectiveLimits(now + 24 * H).maxPositionPct).toBe(8);
    expect(s.pending(now)).toEqual([{ key: 'risk.maxPositionPct', value: 8, effectiveAt: now + 24 * H }]);
  });
  it('tightening applies immediately and cancels a pending loosening', () => {
    const now = 1_000_000_000_000;
    s.set('risk.maxPositionPct', 8, now);
    s.set('risk.maxPositionPct', 3, now + 1000);
    expect(s.effectiveLimits(now + 1000).maxPositionPct).toBe(3);
    expect(s.effectiveLimits(now + 30 * H).maxPositionPct).toBe(3);
    expect(s.pending(now + 2000)).toEqual([]);
  });
  it('lowering the cooldown is delayed using the OLD cooldown', () => {
    const now = 5_000_000_000_000;
    const r = s.set('risk.loosenCooldownHours', 0, now);
    expect(r.effectiveAt).toBe(now + 24 * H);
    expect(s.get('risk.loosenCooldownHours', now)).toBe(24);
  });
  it('non-risk keys apply immediately', () => {
    s.set('alerts.maxScore', 20, 10);
    expect(s.get('alerts.maxScore', 10)).toBe(20);
  });
  it('defaults object has expected shape', () => { expect(DEFAULT_SETTINGS['journal.startEquityUsd']).toBe(200); });
});

describe('secrets', () => {
  const fake = { available: () => true, encrypt: (p: string) => Buffer.from([...Buffer.from(p)].reverse()), decrypt: (b: Buffer) => Buffer.from([...b].reverse()).toString() };
  it('round-trips, is encrypted on disk, and never reaches SQLite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sec-'));
    const f = join(dir, 'secrets.bin');
    const st = createFileSecretStore(f, fake);
    const canary = 'sk-or-CANARY-1234567890';
    st.set('openrouterKey', canary);
    expect(st.get('openrouterKey')).toBe(canary);
    expect(st.has('rpcKey')).toBe(false);
    expect(readFileSync(f, 'utf8')).not.toContain(canary);
    db = openDb(':memory:'); migrate(db);
    const dump = JSON.stringify(db.prepare("SELECT * FROM settings").all());
    expect(dump).not.toContain(canary);
  });
  it('refuses to store when encryption unavailable', () => {
    const st = createFileSecretStore(join(mkdtempSync(join(tmpdir(), 'sec-')), 's.bin'), { ...fake, available: () => false });
    expect(() => st.set('rpcKey', 'x')).toThrow();
  });
});
