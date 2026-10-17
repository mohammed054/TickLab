import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openDb, type Db } from '../db/open';
import { migrate } from '../db/migrate';
import { registerDataFile, listDataFiles, listDatasetVersions, getDatasetVersionFiles } from '../db/queries/researchFiles';
import { normalizeRawToDataset, type WorkerLike } from './datasets';

type Res = Record<string, unknown> & { files: Record<string, unknown>[]; inputs: Record<string, unknown>[] };
const H = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const T0 = Date.UTC(2026, 9, 16, 12, 0, 0);
const RAW = 'raw/provider=geckoterminal/date=2026-10-16/hour=12/part-0001.jsonl.gz';
const PK = 'provider=geckoterminal/date=2026-10-16/hour=12';

let root: string; let db: Db;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'datasets-')); db = openDb(':memory:'); migrate(db);
  registerDataFile(db, { path: RAW, layer: 'raw', sourceId: 'geckoterminal', entity: null, partitionKey: PK, schemaVersion: 'gt.raw.v1', format: 'jsonl.gz', byteSize: 10, rowCount: 2, sha256: H('raw'), timeStart: T0, timeEnd: T0 + 5 }, 1);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Fake worker that "writes" a parquet-like file to disk and reports it like storage.catalog.normalize_raw does. */
function fakeWorker(o: { content?: string; mutate?: (r: Res) => void; reject?: string } = {}): WorkerLike & { calls: { command: string; payload: unknown }[] } {
  const calls: { command: string; payload: unknown }[] = [];
  return {
    calls,
    async request(command, payload) {
      calls.push({ command, payload });
      if (o.reject) throw new Error(o.reject);
      const p = payload as { inputs: { path: string; sha256: string }[]; normalizer: string };
      const bytes = Buffer.from(o.content ?? 'parquet-bytes-v1');
      const rel = `normalized/kind=trade/date=2026-10-16/part-${H(bytes).slice(0, 16)}.parquet`;
      mkdirSync(join(root, 'normalized', 'kind=trade', 'date=2026-10-16'), { recursive: true });
      writeFileSync(join(root, ...rel.split('/')), bytes);
      const res: Res = {
        entity: 'trade', normalizerName: p.normalizer, normalizerVersion: '1.0', schemaVersion: 'trade.v1', rowCount: 2,
        inputs: p.inputs.map((i) => ({ path: i.path, sha256: i.sha256 })),
        files: [{ path: rel, entity: 'trade', partitionKey: 'kind=trade/date=2026-10-16', schemaVersion: 'trade.v1', rowCount: 2, byteSize: bytes.length, sha256: H(bytes), timeStart: T0, timeEnd: T0 + 5 }],
      };
      o.mutate?.(res);
      return res;
    },
  };
}
const run = (worker: WorkerLike, paths = [RAW]) => normalizeRawToDataset({ db, root, worker, normalizer: 'gt_trades', rawFilePaths: paths, now: () => 77 });

describe('normalizeRawToDataset', () => {
  it('sends catalogued raw metadata to the worker and registers files + an immutable dataset version', async () => {
    const w = fakeWorker();
    const r = await run(w);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(w.calls[0].command).toBe('normalize');
    expect((w.calls[0].payload as object)).toMatchObject({ root, normalizer: 'gt_trades', inputs: [{ path: RAW, sha256: H('raw'), byteSize: 10, rowCount: 2, schemaVersion: 'gt.raw.v1', sourceId: 'geckoterminal', partitionKey: PK }] });
    expect(r.value.created).toBe(true);
    expect(r.value.version).toMatchObject({ entity: 'trade', normalizerVersion: '1.0', schemaVersion: 'trade.v1', fileCount: 1, rowCount: 2, createdAt: 77 });
    expect(r.value.files[0]).toMatchObject({ layer: 'normalized', entity: 'trade', format: 'parquet', sourceId: null, registeredAt: 77 });
    expect(getDatasetVersionFiles(db, r.value.version.versionId).map((f) => f.path)).toEqual(r.value.files.map((f) => f.path));
  });

  it('is idempotent: a replay with identical output returns the same version', async () => {
    const a = await run(fakeWorker());
    const b = await run(fakeWorker());
    expect(a.ok && b.ok && b.value.created === false && b.value.version.versionId === a.value.version.versionId).toBe(true);
    expect(listDatasetVersions(db).length).toBe(1);
  });

  it('different output content creates a NEW version and keeps the old one', async () => {
    const a = await run(fakeWorker());
    const b = await run(fakeWorker({ content: 'parquet-bytes-v2' }));
    expect(a.ok && b.ok && b.value.version.versionId !== a.value.version.versionId).toBe(true);
    expect(listDatasetVersions(db).length).toBe(2);
    expect(listDatasetVersions(db, 'trade').length).toBe(2);
  });

  it('surfaces worker failures without registering anything', async () => {
    const r = await run(fakeWorker({ reject: 'RAW_HASH_MISMATCH: raw/x differs' }));
    expect(r).toMatchObject({ ok: false, error: { code: 'NORMALIZE_FAILED' } });
    expect(!r.ok && r.error.message).toContain('RAW_HASH_MISMATCH');
    expect(listDataFiles(db, { layer: 'normalized' })).toEqual([]);
    expect(listDatasetVersions(db)).toEqual([]);
  });

  it('rejects unknown/non-raw inputs before calling the worker', async () => {
    const w = fakeWorker();
    expect(await run(w, ['raw/missing.jsonl.gz'])).toMatchObject({ ok: false, error: { code: 'CATALOG_UNKNOWN_FILE' } });
    expect(await run(w, [])).toMatchObject({ ok: false, error: { code: 'DATASET_INVALID' } });
    expect(w.calls).toEqual([]);
  });

  const bad: [string, (r: Res) => void, string][] = [
    ['hash does not match disk', (r) => { r.files[0].sha256 = H('lie'); }, 'NORMALIZE_OUTPUT_MISMATCH'],
    ['size does not match disk', (r) => { r.files[0].byteSize = (r.files[0].byteSize as number) + 1; }, 'NORMALIZE_OUTPUT_MISMATCH'],
    ['file missing on disk', (r) => { r.files[0].path = 'normalized/kind=trade/date=2026-10-16/part-ghost.parquet'; }, 'NORMALIZE_OUTPUT_MISMATCH'],
    ['path escapes root', (r) => { r.files[0].path = 'normalized/../../evil.parquet'; }, 'NORMALIZE_BAD_RESPONSE'],
    ['path outside normalized/', (r) => { r.files[0].path = RAW; }, 'NORMALIZE_BAD_RESPONSE'],
    ['entity mismatch', (r) => { r.files[0].entity = 'snapshot'; }, 'NORMALIZE_BAD_RESPONSE'],
    ['inputs differ from request', (r) => { r.inputs[0].sha256 = H('other'); }, 'NORMALIZE_BAD_RESPONSE'],
    ['unexpected extra field', (r) => { r.surprise = 1; }, 'NORMALIZE_BAD_RESPONSE'],
    ['wrong normalizer ran', (r) => { r.normalizerName = 'other'; }, 'NORMALIZE_BAD_RESPONSE'],
    ['no files', (r) => { r.files = []; }, 'DATASET_EMPTY'],
  ];
  for (const [name, mutate, code] of bad) {
    it(`rejects a worker response where ${name}`, async () => {
      const r = await run(fakeWorker({ mutate }));
      expect(r).toMatchObject({ ok: false, error: { code } });
      expect(listDataFiles(db, { layer: 'normalized' })).toEqual([]);
      expect(listDatasetVersions(db)).toEqual([]);
    });
  }
});
