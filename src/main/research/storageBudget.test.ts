import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../db/open';
import { migrate } from '../db/migrate';
import { SettingsStore } from '../settings/store';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { buildHandlers, createDispatcher } from '../ipc/register';
import type { Services } from '../ipc/handlers/types';
import type { StorageStatus } from '../../shared/types';
import { RawWriter } from './rawWriter';
import {
  GIB, HYSTERESIS_PCT, StorageBudget, classify, computeUsage, nextState, createFsDiskMeter,
  storageConfigFromSettings, type DiskMeter, type StorageEvent,
} from './storageBudget';

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const CAP = 100 * GIB;
const CFG = { capBytes: CAP, reserveBytes: 50 * GIB };

class FakeMeter implements DiskMeter {
  used = 0; free = 1000 * GIB; fail: string | null = null;
  async measure() { if (this.fail) throw new Error(this.fail); return { usedBytes: this.used, freeBytes: this.free }; }
}

let db: Db; let meter: FakeMeter; let events: StorageEvent[]; let now: number; let root: string;
beforeEach(() => {
  db = openDb(':memory:'); migrate(db); meter = new FakeMeter(); events = []; now = NOW;
  root = mkdtempSync(join(tmpdir(), 'storage-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const budget = (o: { root?: string } = {}) => new StorageBudget({ db, meter, getConfig: () => CFG, now: () => now, onEvent: (e) => events.push(e), root: o.root });
const setPct = (p: number) => { meter.used = Math.round((p / 100) * CAP); };
const refresh = async (b: StorageBudget, p: number) => { setPct(p); const r = await b.refresh(); if (!r.ok) throw new Error(r.error.message); return r.value; };
const gaps = () => db.prepare('SELECT source, reason, start_at, end_at, resolved FROM gaps ORDER BY id').all() as { source: string; reason: string; start_at: number; end_at: number; resolved: number }[];

describe('thresholds and states', () => {
  it('classifies at exactly 80 / 90 / 95 percent (inclusive)', () => {
    expect([79.99, 80, 89.99, 90, 94.99, 95, 100].map(classify)).toEqual(['ok', 'warning', 'warning', 'deep_paused', 'deep_paused', 'raw_paused', 'raw_paused']);
  });
  it('escalates immediately but de-escalates only past the hysteresis margin', () => {
    expect(HYSTERESIS_PCT).toBe(2);
    expect(nextState(null, 50)).toBe('ok');
    expect(nextState('ok', 96)).toBe('raw_paused');
    expect(nextState('raw_paused', 94)).toBe('raw_paused');
    expect(nextState('raw_paused', 93)).toBe('raw_paused');
    expect(nextState('raw_paused', 92.9)).toBe('deep_paused');
    expect(nextState('raw_paused', 80)).toBe('warning');
    expect(nextState('raw_paused', 10)).toBe('ok');
    expect(nextState('deep_paused', 89)).toBe('deep_paused');
    expect(nextState('deep_paused', 87.9)).toBe('warning');
    expect(nextState('warning', 79)).toBe('warning');
    expect(nextState('warning', 77.9)).toBe('ok');
  });
  it('defaults: 150 GiB cap, 50 GiB kept free outside', () => {
    expect(DEFAULT_SETTINGS['research.storageCapGiB']).toBe(150);
    expect(DEFAULT_SETTINGS['research.minFreeOutsideGiB']).toBe(50);
    const s = new SettingsStore(db);
    expect(storageConfigFromSettings(s)).toEqual({ capBytes: 150 * GIB, reserveBytes: 50 * GIB });
  });
  it('the cap is not the drive: effective cap shrinks to what the volume can give above the reserve', () => {
    expect(computeUsage(10 * GIB, 1000 * GIB, CFG)).toMatchObject({ effectiveCapBytes: CAP, limitedBy: 'cap', percent: 10 });
    // 30 GiB used, 90 GiB free, 50 GiB must stay free -> only 40 GiB more may be used: effective cap 70 GiB
    const u = computeUsage(30 * GIB, 90 * GIB, CFG);
    expect(u).toMatchObject({ effectiveCapBytes: 70 * GIB, limitedBy: 'free_space' });
    expect(u.percent).toBeCloseTo((30 / 70) * 100, 6);
    // volume already below the reserve: no room at all
    expect(computeUsage(1 * GIB, 40 * GIB, CFG)).toMatchObject({ effectiveCapBytes: 1 * GIB, percent: 100, limitedBy: 'free_space' });
    expect(computeUsage(0, 40 * GIB, CFG).percent).toBe(1000);
  });
});

describe('StorageBudget.refresh', () => {
  it('reports status fields and a persistent warning from 80% on', async () => {
    const b = budget();
    expect(b.current()).toBeNull();
    const ok = await refresh(b, 50);
    expect(ok).toMatchObject({ state: 'ok', warning: null, usedBytes: 50 * GIB, capBytes: CAP, effectiveCapBytes: CAP, limitedBy: 'cap', gapId: null, measuredAt: NOW });
    expect(ok.allowed).toEqual({ rawWrite: true, deepCapture: true, modelArtifact: true });
    const w = await refresh(b, 82);
    expect(w.state).toBe('warning');
    expect(w.warning).toContain('82%');
    expect(w.allowed).toEqual({ rawWrite: true, deepCapture: true, modelArtifact: true });
    const again = await refresh(b, 83);
    expect(again.warning).toContain('83%');
  });

  it('90%: stops deep capture and model-artifact duplication but keeps raw (shallow) writes', async () => {
    const b = budget();
    const s = await refresh(b, 91);
    expect(s.state).toBe('deep_paused');
    expect(s.allowed).toEqual({ rawWrite: true, deepCapture: false, modelArtifact: false });
    expect(b.allow('deepCapture')).toMatchObject({ allowed: false });
    expect(b.allow('modelArtifact').allowed).toBe(false);
    expect(b.allow('rawWrite')).toEqual({ allowed: true });
    expect(gaps()).toEqual([]);
  });

  it('95%: stops raw writes, persists exactly one storage_cap gap, alerts, and resumes with hysteresis', async () => {
    const b = budget();
    const s = await refresh(b, 96);
    expect(s.state).toBe('raw_paused');
    expect(s.allowed).toEqual({ rawWrite: false, deepCapture: false, modelArtifact: false });
    expect(s.warning).toContain('nothing has been deleted');
    expect(gaps()).toEqual([{ source: 'research', reason: 'storage_cap', start_at: NOW, end_at: NOW, resolved: 0 }]);
    expect(s.gapId).not.toBeNull();

    now += 60_000; await refresh(b, 97);                // still paused: same gap extended, no duplicate
    expect(gaps()).toEqual([{ source: 'research', reason: 'storage_cap', start_at: NOW, end_at: NOW + 60_000, resolved: 0 }]);
    now += 60_000; expect((await refresh(b, 94)).state).toBe('raw_paused'); // inside hysteresis band
    expect(gaps()[0].resolved).toBe(0);

    now += 60_000;
    const back = await refresh(b, 92);                  // below 93 -> deep_paused, raw writes resume, gap closed
    expect(back.state).toBe('deep_paused');
    expect(back.allowed.rawWrite).toBe(true);
    expect(gaps()).toEqual([{ source: 'research', reason: 'storage_cap', start_at: NOW, end_at: NOW + 180_000, resolved: 1 }]);
    expect(back.gapId).toBeNull();
  });

  it('emits the right events in order, with alerts only on escalation', async () => {
    const b = budget();
    await refresh(b, 10); await refresh(b, 81); await refresh(b, 85); await refresh(b, 91); await refresh(b, 96); await refresh(b, 50);
    const kinds = events.map((e) => e.type === 'state_changed' ? `${e.from}>${e.to}` : e.type === 'alert' ? `alert:${e.level}` : e.type);
    expect(kinds).toEqual([
      'null>ok',
      'ok>warning', 'alert:warning',
      'warning>deep_paused', 'alert:warning',
      'deep_paused>raw_paused', 'alert:critical', 'raw_writes_paused',
      'raw_paused>ok', 'raw_writes_resumed',
    ]);
  });

  it('a jump from ok straight to 96% still pauses, alerts critically and records the gap', async () => {
    const b = budget();
    await refresh(b, 5); events.length = 0;
    await refresh(b, 96);
    expect(events.map((e) => e.type)).toEqual(['state_changed', 'alert', 'raw_writes_paused']);
    expect(events.find((e) => e.type === 'alert')).toMatchObject({ level: 'critical' });
  });

  it('adopts an unresolved gap from a previous run instead of duplicating it, and closes it on recovery', async () => {
    await refresh(budget(), 96);
    const b2 = budget();                                  // "restart": new instance, same database, still full
    now += 5 * 60_000;
    await refresh(b2, 96);
    expect(gaps().length).toBe(1);
    expect(gaps()[0]).toMatchObject({ end_at: NOW + 5 * 60_000, resolved: 0 });
    const b3 = budget();                                  // restart again after space was freed
    now += 60_000;
    await refresh(b3, 40);
    expect(gaps().length).toBe(1);
    expect(gaps()[0].resolved).toBe(1);
  });

  it('time-to-cap estimate from recent growth; null when flat, too short, or single sample', async () => {
    const b = budget();
    meter.used = 10 * GIB; await b.refresh();
    expect(b.current()?.etaMs).toBeNull();                // one sample
    now += 30_000; meter.used = 10.5 * GIB; await b.refresh();
    expect(b.current()?.etaMs).toBeNull();                // span under a minute
    now = NOW + 3_600_000; meter.used = 11 * GIB; await b.refresh();   // +1 GiB over 1 h
    expect(b.current()?.etaMs).toBe(Math.round((89 * GIB) / ((1 * GIB) / 3_600_000)));
    now += 3_600_000; await b.refresh();                  // no growth over the last hour, but window rate still > 0
    expect(b.current()?.etaMs).not.toBeNull();
    const flat = budget(); meter.used = 5 * GIB; await flat.refresh(); now += 3_600_000; await flat.refresh();
    expect(flat.current()?.etaMs).toBeNull();
    const shrinking = budget(); meter.used = 9 * GIB; await shrinking.refresh(); now += 3_600_000; meter.used = 4 * GIB; await shrinking.refresh();
    expect(shrinking.current()?.etaMs).toBeNull();
  });

  it('surfaces measurement failures and keeps the last good status', async () => {
    const b = budget();
    await refresh(b, 96);
    meter.fail = 'statfs exploded';
    const r = await b.refresh();
    expect(r).toMatchObject({ ok: false, error: { code: 'STORAGE_MEASURE_FAILED' } });
    expect(events.at(-1)).toMatchObject({ type: 'measure_failed', message: 'statfs exploded' });
    expect(b.current()?.state).toBe('raw_paused');
    meter.fail = null; meter.used = -1;
    expect((await b.refresh()).ok).toBe(false);
  });

  it('honours config changes on the next refresh (raising the cap clears the pause)', async () => {
    let cap = CAP;
    const b = new StorageBudget({ db, meter, getConfig: () => ({ capBytes: cap, reserveBytes: 50 * GIB }), now: () => now, onEvent: (e) => events.push(e) });
    meter.used = 96 * GIB;
    expect((await b.refresh()).ok && b.current()?.state).toBe('raw_paused');
    cap = 200 * GIB; now += 1000;
    await b.refresh();
    expect(b.current()?.state).toBe('ok');
    expect(gaps()[0].resolved).toBe(1);
  });

  it('coalesces concurrent refreshes into one measurement', async () => {
    let calls = 0;
    const slow: DiskMeter = { measure: async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return { usedBytes: GIB, freeBytes: 500 * GIB }; } };
    const b = new StorageBudget({ db, meter: slow, getConfig: () => CFG, now: () => now });
    await Promise.all([b.refresh(), b.refresh(), b.refresh()]);
    expect(calls).toBe(1);
  });
});

describe('gating', () => {
  it('fails closed until usage has been measured once', () => {
    const b = budget();
    expect(b.allow('rawWrite')).toMatchObject({ allowed: false, reason: expect.stringContaining('not been measured') });
    expect(b.writeGate().allowed).toBe(false);
  });

  it('RawWriter refuses new raw writes at 95% (finalizing what is open), and resumes afterwards', async () => {
    const b = budget();
    const w = new RawWriter({ root, db, now: () => NOW, writeGate: b.writeGate });
    const env = (n: number) => ({ source: 'geckoterminal', endpointId: 'p', requestId: `r${n}`, requestAt: NOW + n, responseAt: NOW + n, httpStatus: 200, schemaVersion: 'gt.raw.v1', body: '{}' });
    expect(w.append(env(1))).toMatchObject({ ok: false, error: { code: 'RAW_PAUSED_STORAGE' } }); // not measured yet
    await refresh(b, 10);
    const first = w.append(env(2));
    expect(first.ok).toBe(true);
    await refresh(b, 96);
    const blocked = w.append(env(3));
    expect(blocked).toMatchObject({ ok: false, error: { code: 'RAW_PAUSED_STORAGE' } });
    expect(!blocked.ok && blocked.error.message).toContain('raw_paused'.replace('_', ' '));
    const row = db.prepare("SELECT path, row_count FROM data_files WHERE layer='raw'").all() as { path: string; row_count: number }[];
    expect(row).toEqual([{ path: first.ok ? first.value.path : '', row_count: 1 }]);   // open file was closed and catalogued, not lost
    expect(readdirSync(join(root, 'raw', 'provider=geckoterminal', 'date=2026-10-16', 'hour=12')).some((n) => n.endsWith('.partial'))).toBe(false);
    await refresh(b, 40);
    expect(w.append(env(4)).ok).toBe(true);
    w.close();
  });
});

describe('createFsDiskMeter', () => {
  it('sums file sizes recursively, ignores symlinks, and handles a missing root', async () => {
    mkdirSync(join(root, 'a', 'b'), { recursive: true });
    writeFileSync(join(root, 'a', 'x'), Buffer.alloc(100)); writeFileSync(join(root, 'a', 'b', 'y'), Buffer.alloc(250)); writeFileSync(join(root, 'z'), Buffer.alloc(7));
    try { symlinkSync(join(root, 'a'), join(root, 'loop')); } catch { /* symlinks may be unavailable */ }
    const m = await createFsDiskMeter(root).measure();
    expect(m.usedBytes).toBe(357);
    expect(m.freeBytes).toBeGreaterThan(0);
    const none = await createFsDiskMeter(join(root, 'does', 'not', 'exist')).measure();
    expect(none.usedBytes).toBe(0);
    expect(none.freeBytes).toBeGreaterThan(0);
  });
});

describe('settings validation', () => {
  it('accepts sane values and rejects unsafe ones', () => {
    const s = new SettingsStore(db);
    expect(() => s.set('research.storageCapGiB', 200, NOW)).not.toThrow();
    expect(s.get('research.storageCapGiB')).toBe(200);
    expect(() => s.set('research.storageCapGiB', 0, NOW)).toThrow();
    expect(() => s.set('research.minFreeOutsideGiB', -1, NOW)).toThrow();
    expect(() => s.set('research.cleanup.targetPercent', 80, NOW)).toThrow();      // would immediately re-trigger the 80% warning
    expect(() => s.set('research.cleanup.targetPercent', 75, NOW)).not.toThrow();
    expect(() => s.set('research.cleanup.minRawAgeDays', 0, NOW)).toThrow();
    expect(() => s.set('research.cleanup.enabled', 'yes', NOW)).toThrow();
    expect(() => s.set('research.cleanup.enabled', true, NOW)).not.toThrow();
  });
});

describe('IPC handlers', () => {
  it('status and cleanupPreview are read-only channels backed by the budget and Settings', async () => {
    const settings = new SettingsStore(db);
    const b = new StorageBudget({ db, meter, getConfig: () => storageConfigFromSettings(settings), now: () => now });
    const d = createDispatcher(buildHandlers({ storage: b, settings } as unknown as Services));
    meter.used = 145 * GIB; meter.free = 1000 * GIB;   // 96.7% of the default 150 GiB cap
    const noRefresh = await d('research:storage:status', {});
    expect(noRefresh).toEqual({ ok: true, value: null });
    const st = await d('research:storage:status', { refresh: true });
    expect(st.ok && (st.value as StorageStatus).state).toBe('raw_paused');
    const prev = await d('research:storage:cleanupPreview', {});
    expect(prev).toMatchObject({ ok: true, value: { configured: false, candidates: [] } });
    expect(await d('research:storage:status', { refresh: 'yes' })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await d('research:storage:delete', {})).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });
});
