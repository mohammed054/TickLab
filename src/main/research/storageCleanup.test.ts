import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openDb, type Db } from '../db/open';
import { migrate } from '../db/migrate';
import { SettingsStore } from '../settings/store';
import { registerDataFile, registerSourceManifest } from '../db/queries/researchFiles';
import type { RegisterDataFileInput } from '../../shared/types';
import {
  GIB, StorageBudget, createFsDiskMeter, cleanupConfigFromSettings, type DiskMeter, type StorageEvent, type CleanupConfig,
} from './storageBudget';

// Cleanup preview and no-automatic-deletion proofs (docs/07 T2.4). Split from storageBudget.test.ts for the 300-line lint cap.
const H = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const CAP = 100 * GIB;
const CFG = { capBytes: CAP, reserveBytes: 50 * GIB };

class FakeMeter implements DiskMeter {
  used = 0; free = 1000 * GIB;
  async measure() { return { usedBytes: this.used, freeBytes: this.free }; }
}

let db: Db; let meter: FakeMeter; let events: StorageEvent[]; let now: number; let root: string;
beforeEach(() => {
  db = openDb(':memory:'); migrate(db); meter = new FakeMeter(); events = []; now = NOW;
  root = mkdtempSync(join(tmpdir(), 'storage-cleanup-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const budget = (o: { root?: string } = {}) => new StorageBudget({ db, meter, getConfig: () => CFG, now: () => now, onEvent: (e) => events.push(e), root: o.root });
const setPct = (p: number) => { meter.used = Math.round((p / 100) * CAP); };
const refresh = async (b: StorageBudget, p: number) => { setPct(p); const r = await b.refresh(); if (!r.ok) throw new Error(r.error.message); return r.value; };

// ---------- cleanup preview ----------

let seq = 0;
function addRaw(o: { ageDays: number; bytes: number; manifest?: boolean; path?: string; layer?: 'raw' | 'normalized'; entity?: string }) {
  seq++;
  const layer = o.layer ?? 'raw';
  const ts = NOW - o.ageDays * DAY;
  const pk = layer === 'raw' ? `provider=geckoterminal/date=d${seq}/hour=00` : `kind=${o.entity ?? 'trade'}/date=d${seq}`;
  const path = o.path ?? (layer === 'raw' ? `raw/${pk}/part-0001.jsonl.gz` : `normalized/${pk}/part-${seq}.parquet`);
  const input: RegisterDataFileInput = layer === 'raw'
    ? { path, layer, sourceId: 'geckoterminal', entity: null, partitionKey: pk, schemaVersion: 'gt.raw.v1', format: 'jsonl.gz', byteSize: o.bytes, rowCount: 1, sha256: H(path), timeStart: ts, timeEnd: ts + 1000 }
    : { path, layer, sourceId: null, entity: o.entity ?? 'trade', partitionKey: pk, schemaVersion: 'trade.v1', format: 'parquet', byteSize: o.bytes, rowCount: 1, sha256: H(path), timeStart: ts, timeEnd: ts + 1000 };
  const r = registerDataFile(db, input, NOW);
  if (!r.ok) throw new Error(r.error.message);
  if (layer === 'raw' && o.manifest !== false) {
    const m = registerSourceManifest(db, { sourceId: 'geckoterminal', partitionKey: pk, filePaths: [path] }, NOW);
    if (!m.ok) throw new Error(m.error.message);
  }
  return path;
}
const ON: CleanupConfig = { enabled: true, targetPercent: 70, minRawAgeDays: 14 };

describe('cleanup preview', () => {
  it('requires explicit configuration: disabled cleanup proposes nothing', async () => {
    addRaw({ ageDays: 90, bytes: 10 * GIB });
    const b = budget(); await refresh(b, 96);
    const p = await b.cleanupPreview({ ...ON, enabled: false });
    expect(p.ok && p.value).toMatchObject({ configured: false, candidates: [], freedBytes: 0, bytesToFree: 26 * GIB, usedBytes: 96 * GIB });
    expect(p.ok && p.value.reason).toContain('not configured');
    // defaults from Settings are disabled too
    expect(cleanupConfigFromSettings(new SettingsStore(db))).toEqual({ enabled: false, targetPercent: 70, minRawAgeDays: 14 });
  });

  it('needs a measurement first', async () => {
    expect(await budget().cleanupPreview(ON)).toMatchObject({ ok: false, error: { code: 'STORAGE_NOT_MEASURED' } });
  });

  it('proposes nothing when usage is already at or below the target', async () => {
    addRaw({ ageDays: 90, bytes: GIB });
    const b = budget(); await refresh(b, 60);
    const p = await b.cleanupPreview(ON);
    expect(p.ok && p.value).toMatchObject({ configured: true, candidates: [], bytesToFree: 0, shortfallBytes: 0 });
  });

  it('picks OLDEST raw files first and stops once the target is reached', async () => {
    const newest = addRaw({ ageDays: 20, bytes: 8 * GIB });
    const oldest = addRaw({ ageDays: 120, bytes: 8 * GIB });
    const middle = addRaw({ ageDays: 60, bytes: 8 * GIB });
    const b = budget(); await refresh(b, 90);          // target 70 -> must free 20 GiB
    const p = await b.cleanupPreview(ON);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.bytesToFree).toBe(20 * GIB);
    expect(p.value.candidates.map((c) => c.path)).toEqual([oldest, middle, newest]);   // 8+8=16 < 20 so the third is needed
    expect(p.value.freedBytes).toBe(24 * GIB);
    expect(p.value.shortfallBytes).toBe(0);
    expect(p.value.reason).toBeNull();
    // with a smaller need, only the oldest is proposed
    await refresh(b, 76);
    const q = await b.cleanupPreview(ON);
    expect(q.ok && q.value.candidates.map((c) => c.path)).toEqual([oldest]);
  });

  it('honours the minimum raw age and skips files without a retained manifest', async () => {
    const ok = addRaw({ ageDays: 40, bytes: 5 * GIB });
    addRaw({ ageDays: 3, bytes: 5 * GIB });                       // too recent
    addRaw({ ageDays: 200, bytes: 5 * GIB, manifest: false });    // no manifest -> must not be pruned
    const b = budget(); await refresh(b, 96);
    const p = await b.cleanupPreview(ON);
    expect(p.ok && p.value.candidates.map((c) => c.path)).toEqual([ok]);
    expect(p.ok && p.value.skipped).toEqual({ no_manifest: 1, too_recent: 1 });
    expect(p.ok && p.value.shortfallBytes).toBe(26 * GIB - 5 * GIB);
    expect(p.ok && p.value.reason).toContain('cannot reach the target');
  });

  it('never proposes final outcomes, normalized data, run artifacts or quarantine', async () => {
    const real = addRaw({ ageDays: 100, bytes: 4 * GIB });
    addRaw({ ageDays: 400, bytes: 30 * GIB, layer: 'normalized', entity: 'launch' });                 // compact launch outcomes
    addRaw({ ageDays: 400, bytes: 30 * GIB, layer: 'normalized', entity: 'trade' });                  // tick-level data
    addRaw({ ageDays: 400, bytes: 30 * GIB, path: 'runs/run-7/final_test_predictions.jsonl.gz' });    // run artifact mis-filed as raw layer
    addRaw({ ageDays: 400, bytes: 30 * GIB, path: 'quarantine/raw/x/part-0001.jsonl.gz' });
    addRaw({ ageDays: 400, bytes: 30 * GIB, path: 'normalized/kind=launch/outcome.jsonl.gz' });
    const b = budget(); await refresh(b, 96);
    const p = await b.cleanupPreview({ ...ON, minRawAgeDays: 1 });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.candidates.map((c) => c.path)).toEqual([real]);
    expect(p.value.skipped.protected).toBe(3);
    for (const c of p.value.candidates) expect(c.path.startsWith('raw/')).toBe(true);
  });

  it('with verifyHashes, candidates must match disk; tampered or missing files are skipped', async () => {
    const mk = (age: number, content: string) => {
      const rel = `raw/provider=geckoterminal/date=v${age}/hour=00/part-0001.jsonl.gz`;
      mkdirSync(join(root, ...rel.split('/').slice(0, -1)), { recursive: true });
      writeFileSync(join(root, ...rel.split('/')), content);
      seq++;
      const pk = `provider=geckoterminal/date=v${age}/hour=00`;
      registerDataFile(db, { path: rel, layer: 'raw', sourceId: 'geckoterminal', entity: null, partitionKey: pk, schemaVersion: 'gt.raw.v1', format: 'jsonl.gz', byteSize: content.length, rowCount: 1, sha256: H(content), timeStart: NOW - age * DAY, timeEnd: NOW - age * DAY + 1 }, NOW);
      registerSourceManifest(db, { sourceId: 'geckoterminal', partitionKey: pk, filePaths: [rel] }, NOW);
      return rel;
    };
    const good = mk(300, 'good-content');
    const bad = mk(200, 'original');
    writeFileSync(join(root, ...bad.split('/')), 'tampered!');           // same size not required: size mismatch path
    const gone = mk(100, 'will vanish'); rmSync(join(root, ...gone.split('/')));
    const b = budget({ root }); await refresh(b, 96);
    const p = await b.cleanupPreview(ON, { verifyHashes: true });
    expect(p.ok && p.value.candidates.map((c) => c.path)).toEqual([good]);
    expect(p.ok && p.value.skipped).toEqual({ size_mismatch: 1, missing: 1 });
    expect(await budget().cleanupPreview(ON, { verifyHashes: true })).toMatchObject({ ok: false });   // not measured
    const noRoot = budget(); await refresh(noRoot, 96);
    expect(await noRoot.cleanupPreview(ON, { verifyHashes: true })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });
});

// ---------- no automatic data loss ----------

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p); else out[p.slice(dir.length)] = `${statSync(p).size}:${H(readFileSync(p))}`;
    }
  };
  walk(dir);
  return out;
}

describe('no automatic deletion', () => {
  it('measuring, every cap state, gap handling and cleanup previews leave every file byte-identical', async () => {
    const seed: Record<string, string> = {
      'raw/provider=geckoterminal/date=2026-01-01/hour=00/part-0001.jsonl.gz': 'raw-old',
      'normalized/kind=launch/date=2026-01-01/part-aaaa.parquet': 'launch-outcomes',
      'runs/run-1/final_test_predictions.parquet': 'predictions',
      'runs/run-1/config.json': '{}',
    };
    for (const [rel, c] of Object.entries(seed)) { mkdirSync(join(root, ...rel.split('/').slice(0, -1)), { recursive: true }); writeFileSync(join(root, ...rel.split('/')), c); }
    const before = snapshot(root);

    const b = new StorageBudget({ db, meter: createFsDiskMeter(root), getConfig: () => ({ capBytes: 36, reserveBytes: 0 }), now: () => now, onEvent: (e) => events.push(e), root });
    await b.refresh();                                  // real meter against real files: 60-byte cap is just exceeded (35 of 36 bytes)
    expect(b.current()?.state).toBe('raw_paused');
    await b.cleanupPreview(ON, { verifyHashes: true });
    await b.cleanupPreview({ ...ON, enabled: false });
    for (const p of [20, 70, 85, 92, 97, 30]) { meter.used = p; await new StorageBudget({ db, meter, getConfig: () => ({ capBytes: 100, reserveBytes: 0 }), now: () => now }).refresh(); }
    expect(snapshot(root)).toEqual(before);
    expect(Object.keys(snapshot(root)).length).toBe(4);
  });

  it('the storage modules contain no file-removal or file-mutation APIs', () => {
    const forbidden = /\b(unlink|unlinkSync|rmSync|rmdir|rmdirSync|truncate|writeFile|writeFileSync|appendFile|rename|renameSync|copyFile|createWriteStream)\b|\bfs\.rm\b|\brm\(/;
    for (const f of ['src/main/research/storageBudget.ts', 'src/main/ipc/handlers/researchStorage.ts']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toMatch(forbidden);
    }
  });
});

