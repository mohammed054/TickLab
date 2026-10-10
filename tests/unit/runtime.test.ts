import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../../src/main/app/runtime';
import { createMemorySecretStore } from '../../src/main/settings/secrets';
import { backupDb } from '../../src/main/app/backup';
import { freshDb } from './helpers';
import { openDb } from '../../src/main/db/open';
import { migrate } from '../../src/main/db/migrate';

describe('runtime composition', () => {
  it('builds without Electron; deposits seeded; health and journal channels answer', async () => {
    const db = openDb(':memory:'); migrate(db);
    const dir = mkdtempSync(join(tmpdir(), 'tl-'));
    const rt = createRuntime({ db, secrets: createMemorySecretStore(), emit: () => undefined, os: { version: '0.1.0', dataDir: dir, openExternal: () => undefined, openDataFolder: () => undefined, focusDetail: () => undefined, setPin: () => undefined } });
    rt.services.journal.ensureInitialDeposits();
    const s = await rt.dispatch('journal:summary', { account: 'paper' });
    expect(s).toMatchObject({ ok: true, value: { equity: 200 } });
    expect(await rt.dispatch('health:overview', {})).toMatchObject({ ok: true });
    expect(await rt.dispatch('app:backupNow', {})).toMatchObject({ ok: true });
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1);
    const d = await rt.dispatch('health:diagnostics', {});
    expect(JSON.stringify(d)).not.toMatch(/secret|apiKey/i);
  });
  it('backup keeps only the newest 7', () => {
    const { db } = freshDb(); const dir = mkdtempSync(join(tmpdir(), 'tl-'));
    for (let i = 0; i < 9; i++) backupDb(db, dir, 1_700_000_000_000 + i * 1000);
    expect(readdirSync(dir)).toHaveLength(7);
  });
});
