import { describe, it, expect } from 'vitest';
import bs58 from 'bs58';
import { createDispatcher, buildHandlers } from '../../src/main/ipc/register';
import { isAllowedExternal } from '../../src/main/ipc/handlers/misc';
import { createMemorySecretStore } from '../../src/main/settings/secrets';
import { JournalService } from '../../src/main/journal/service';
import { freshDb } from './helpers';
import type { Services } from '../../src/main/ipc/handlers/types';

function setup() {
  const { db, settings } = freshDb();
  const opened: string[] = [];
  const secrets = createMemorySecretStore();
  const svc = {
    db, settings, secrets, journal: new JournalService(db, settings, () => 1_700_000_000_000),
    now: () => 1_700_000_000_000, emit: () => undefined, state: { selected: null }, counters: { skippedQuote: 0, rejected: 0 },
    scheduler: { deep: { activeTokenIds: () => [], setSelected: () => undefined, refresh: async () => undefined }, intervalMultiplier: 1, backfillNow: async () => ({}) },
    monitor: { status: () => [], callsLastMinute: () => 0 }, ai: { usage: () => ({ today: 0, limit: 10, remaining: 10 }) },
    platform: { version: '0', dataDir: 'd', openExternal: (u: string) => opened.push(u), openDataFolder: () => undefined, focusDetail: () => undefined, setPin: () => undefined },
  } as unknown as Services;
  return { d: createDispatcher(buildHandlers(svc)), opened, secrets, settings };
}

describe('ipc dispatcher', () => {
  it('rejects unknown channels and invalid payloads', async () => {
    const { d } = setup();
    expect(await d('shell:exec', {})).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await d('launches:get', { tokenId: -1 })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await d('launches:get', { tokenId: 1, extra: 1 })).toMatchObject({ ok: false });
  });
  it('openExternal only opens allowlisted https hosts', async () => {
    const { d, opened } = setup();
    expect(await d('app:openExternal', { url: 'file:///etc/passwd' })).toMatchObject({ ok: false });
    expect(await d('app:openExternal', { url: 'https://evil.example/x' })).toMatchObject({ ok: false });
    expect(await d('app:openExternal', { url: 'https://solscan.io/tx/abc' })).toMatchObject({ ok: true });
    expect(opened).toEqual(['https://solscan.io/tx/abc']);
    expect(isAllowedExternal('https://solscan.io@evil.example/')).toBe(false);
  });
  it('wallet address setting rejects secrets, accepts a real address', async () => {
    const { d } = setup();
    const r = await d('settings:set', { key: 'wallet.address', value: bs58.encode(Buffer.alloc(64, 3)) });
    expect(r).toMatchObject({ ok: false, error: { message: 'That looks like a secret. Never paste secrets here.' } });
    expect(await d('settings:set', { key: 'wallet.address', value: bs58.encode(Buffer.alloc(32, 7)) })).toMatchObject({ ok: true });
  });
  it('secrets are stored but never returned by settings', async () => {
    const { d, secrets } = setup();
    expect(await d('secret:set', { name: 'openrouterKey', value: 'sk-or-v1-abcdefghijkl' })).toMatchObject({ ok: true });
    expect(secrets.has('openrouterKey')).toBe(true);
    expect(await d('secret:has', { name: 'openrouterKey' })).toEqual({ ok: true, value: true });
    expect(JSON.stringify(await d('settings:get', {}))).not.toContain('sk-or-v1');
  });
  it('settings validation errors surface as VALIDATION', async () => {
    const { d } = setup();
    expect(await d('settings:set', { key: 'risk.maxPositionPct', value: 500 })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await d('settings:set', { key: 'nope', value: 1 })).toMatchObject({ ok: false });
  });
});
