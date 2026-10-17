import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { openDb, type Db } from '../../src/main/db/open';
import { migrate, MIGRATIONS } from '../../src/main/db/migrate';
import {
  registerDataFile, getDataFile, listDataFiles, registerSourceManifest, listSourceManifests, getManifestFiles,
  registerDatasetVersion, getDatasetVersion, listDatasetVersions, getDatasetVersionFiles,
  manifestHash, datasetFingerprint, validateCatalogPath,
} from '../../src/main/db/queries/researchFiles';
import type { RegisterDataFileInput } from '../../src/shared/types';

const H = (s: string) => createHash('sha256').update(s).digest('hex');
const T0 = Date.UTC(2026, 9, 16, 12, 0, 0);

const raw = (n: number, o: Partial<RegisterDataFileInput> = {}): RegisterDataFileInput => ({
  path: `raw/provider=geckoterminal/date=2026-10-16/hour=12/part-${String(n).padStart(4, '0')}.jsonl.gz`,
  layer: 'raw', sourceId: 'geckoterminal', entity: null, partitionKey: 'provider=geckoterminal/date=2026-10-16/hour=12',
  schemaVersion: 'gt.raw.v1', format: 'jsonl.gz', byteSize: 1000 + n, rowCount: 10 * n, sha256: H(`raw${n}`),
  timeStart: T0 + n * 1000, timeEnd: T0 + n * 1000 + 999, ...o,
});
const norm = (n: number, o: Partial<RegisterDataFileInput> = {}): RegisterDataFileInput => ({
  path: `normalized/kind=snapshot/date=2026-10-16/part-${String(n).padStart(4, '0')}.parquet`,
  layer: 'normalized', sourceId: null, entity: 'snapshot', partitionKey: 'kind=snapshot/date=2026-10-16',
  schemaVersion: 'snapshot.v1', format: 'parquet', byteSize: 5000 + n, rowCount: 100 * n, sha256: H(`norm${n}`),
  timeStart: T0 + n * 60_000, timeEnd: T0 + n * 60_000 + 59_999, ...o,
});

let db: Db;
beforeEach(() => { db = openDb(':memory:'); migrate(db); });
const must = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

describe('data_files registration', () => {
  it('stores path/partition/schema/hash/time-range/byte metadata exactly', () => {
    const { file, created } = must(registerDataFile(db, raw(1), 42));
    expect(created).toBe(true);
    expect(file).toMatchObject({
      path: raw(1).path, layer: 'raw', sourceId: 'geckoterminal', entity: null,
      partitionKey: 'provider=geckoterminal/date=2026-10-16/hour=12', schemaVersion: 'gt.raw.v1', format: 'jsonl.gz',
      byteSize: 1001, rowCount: 10, sha256: H('raw1'), timeStart: T0 + 1000, timeEnd: T0 + 1999, registeredAt: 42,
    });
    expect(getDataFile(db, raw(1).path)).toEqual(file);
  });

  it('is idempotent: re-registering identical metadata returns the same row and keeps registeredAt', () => {
    const a = must(registerDataFile(db, raw(1), 1));
    const b = must(registerDataFile(db, raw(1), 999));
    expect(b.created).toBe(false);
    expect(b.file).toEqual(a.file);
    expect(b.file.registeredAt).toBe(1);
    expect(db.prepare('SELECT COUNT(*) c FROM data_files').get()).toEqual({ c: 1 });
  });

  it('rejects re-registering a path with a different hash or size (files are immutable)', () => {
    must(registerDataFile(db, raw(1), 1));
    const r = registerDataFile(db, raw(1, { sha256: H('tampered'), byteSize: 7 }), 2);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error.code).toBe('CATALOG_CONFLICT'); expect(r.error.message).toContain('sha256'); }
    expect(getDataFile(db, raw(1).path)?.sha256).toBe(H('raw1'));
  });

  it('is append-only at the SQL level', () => {
    must(registerDataFile(db, raw(1), 1));
    expect(() => db.prepare('UPDATE data_files SET sha256=?').run(H('x'))).toThrow('append-only table');
    expect(() => db.prepare('DELETE FROM data_files').run()).toThrow('append-only table');
  });

  const bad: [string, Partial<RegisterDataFileInput>][] = [
    ['uppercase/short hash', { sha256: 'ABC' }],
    ['non-hex hash', { sha256: 'z'.repeat(64) }],
    ['negative bytes', { byteSize: -1 }],
    ['fractional rows', { rowCount: 1.5 }],
    ['inverted time range', { timeStart: T0 + 10, timeEnd: T0 }],
    ['empty schema version', { schemaVersion: '' }],
    ['absolute path', { path: '/etc/passwd' }],
    ['drive-letter path', { path: 'C:/data/x.jsonl.gz' }],
    ['backslash path', { path: 'raw\\x.jsonl.gz' }],
    ['traversal path', { path: 'raw/../../x.jsonl.gz' }],
    ['raw without source', { sourceId: null }],
    ['raw with entity', { entity: 'trade' }],
    ['raw with parquet format', { format: 'parquet' }],
  ];
  for (const [name, o] of bad) {
    it(`rejects ${name}`, () => {
      const r = registerDataFile(db, raw(1, o), 1);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('CATALOG_INVALID');
      expect(db.prepare('SELECT COUNT(*) c FROM data_files').get()).toEqual({ c: 0 });
    });
  }
  it('rejects normalized file without entity or with jsonl.gz format', () => {
    expect(registerDataFile(db, norm(1, { entity: null }), 1).ok).toBe(false);
    expect(registerDataFile(db, norm(1, { format: 'jsonl.gz' }), 1).ok).toBe(false);
  });
  it('database CHECK constraints back up validation (raw needs source_id)', () => {
    expect(() => db.prepare("INSERT INTO data_files(path,layer,source_id,entity,partition_key,schema_version,format,byte_size,row_count,sha256,time_start,time_end,registered_at) VALUES('p','raw',NULL,NULL,'k','v','jsonl.gz',1,1,?,1,2,1)").run(H('a'))).toThrow();
    expect(() => db.prepare("INSERT INTO data_files(path,layer,source_id,entity,partition_key,schema_version,format,byte_size,row_count,sha256,time_start,time_end,registered_at) VALUES('p','raw','s',NULL,'k','v','jsonl.gz',1,1,?,5,2,1)").run(H('a'))).toThrow();
  });
  it('validateCatalogPath accepts normal catalog paths', () => {
    expect(validateCatalogPath(raw(1).path)).toBeNull();
    expect(validateCatalogPath(norm(1).path)).toBeNull();
  });

  it('lists with layer/source/entity filters and time-overlap queries', () => {
    for (let i = 1; i <= 3; i++) must(registerDataFile(db, raw(i), 1));
    for (let i = 1; i <= 2; i++) must(registerDataFile(db, norm(i), 1));
    expect(listDataFiles(db).length).toBe(5);
    expect(listDataFiles(db, { layer: 'raw' }).length).toBe(3);
    expect(listDataFiles(db, { entity: 'snapshot' }).length).toBe(2);
    expect(listDataFiles(db, { sourceId: 'nobody' })).toEqual([]);
    // raw 2 spans [T0+2000, T0+2999]; overlap window touches only it
    const hit = listDataFiles(db, { layer: 'raw', from: T0 + 2500, to: T0 + 2600 });
    expect(hit.map((f) => f.path)).toEqual([raw(2).path]);
  });
});

describe('source manifests', () => {
  beforeEach(() => { for (let i = 1; i <= 3; i++) must(registerDataFile(db, raw(i), 1)); });
  const part = 'provider=geckoterminal/date=2026-10-16/hour=12';

  it('records file list, count, bytes and an order-independent checksum', () => {
    const a = must(registerSourceManifest(db, { sourceId: 'geckoterminal', partitionKey: part, filePaths: [raw(1).path, raw(2).path] }, 5));
    expect(a.created).toBe(true);
    expect(a.manifest).toMatchObject({ fileCount: 2, totalBytes: 1001 + 1002, createdAt: 5 });
    const expected = manifestHash([getDataFile(db, raw(1).path)!, getDataFile(db, raw(2).path)!]);
    expect(a.manifest.manifestSha256).toBe(expected);
    expect(getManifestFiles(db, a.manifest.id).map((f) => f.path)).toEqual([raw(1).path, raw(2).path]);
  });
  it('is idempotent regardless of path order or duplicates; a changed file set makes a new manifest', () => {
    const a = must(registerSourceManifest(db, { sourceId: 'geckoterminal', partitionKey: part, filePaths: [raw(1).path, raw(2).path] }, 5));
    const b = must(registerSourceManifest(db, { sourceId: 'geckoterminal', partitionKey: part, filePaths: [raw(2).path, raw(1).path, raw(2).path] }, 9));
    expect(b.created).toBe(false);
    expect(b.manifest.id).toBe(a.manifest.id);
    const c = must(registerSourceManifest(db, { sourceId: 'geckoterminal', partitionKey: part, filePaths: [raw(1).path, raw(2).path, raw(3).path] }, 10));
    expect(c.created).toBe(true);
    expect(listSourceManifests(db, 'geckoterminal', part).length).toBe(2);
  });
  it('rejects unknown files, wrong source/partition, normalized files and empty lists', () => {
    expect(registerSourceManifest(db, { sourceId: 'geckoterminal', partitionKey: part, filePaths: ['raw/nope.jsonl.gz'] }, 1)).toMatchObject({ ok: false, error: { code: 'CATALOG_UNKNOWN_FILE' } });
    expect(registerSourceManifest(db, { sourceId: 'dexscreener', partitionKey: part, filePaths: [raw(1).path] }, 1)).toMatchObject({ ok: false, error: { code: 'CATALOG_INVALID' } });
    expect(registerSourceManifest(db, { sourceId: 'geckoterminal', partitionKey: 'other', filePaths: [raw(1).path] }, 1)).toMatchObject({ ok: false });
    expect(registerSourceManifest(db, { sourceId: 'geckoterminal', partitionKey: part, filePaths: [] }, 1)).toMatchObject({ ok: false });
    must(registerDataFile(db, norm(1), 1));
    expect(registerSourceManifest(db, { sourceId: 'geckoterminal', partitionKey: part, filePaths: [norm(1).path] }, 1)).toMatchObject({ ok: false });
  });
  it('is append-only', () => {
    must(registerSourceManifest(db, { sourceId: 'geckoterminal', partitionKey: part, filePaths: [raw(1).path] }, 5));
    expect(() => db.prepare('UPDATE source_manifests SET file_count=9').run()).toThrow('append-only table');
    expect(() => db.prepare('DELETE FROM source_manifest_files').run()).toThrow('append-only table');
  });
});

describe('dataset versions', () => {
  beforeEach(() => { for (let i = 1; i <= 3; i++) must(registerDataFile(db, norm(i), 1)); });
  const base = (paths: string[], nv = 'norm-1.0') => ({ entity: 'snapshot', normalizerVersion: nv, schemaVersion: 'snapshot.v1', filePaths: paths });

  it('aggregates rows/bytes/time range and links member files', () => {
    const { version, created } = must(registerDatasetVersion(db, base([norm(1).path, norm(2).path]), 77));
    expect(created).toBe(true);
    expect(version).toMatchObject({
      entity: 'snapshot', normalizerVersion: 'norm-1.0', schemaVersion: 'snapshot.v1', fileCount: 2,
      rowCount: 100 + 200, totalBytes: 5001 + 5002, timeStart: T0 + 60_000, timeEnd: T0 + 2 * 60_000 + 59_999, createdAt: 77,
    });
    expect(version.versionId).toBe(`dsv_${version.fingerprint.slice(0, 16)}`);
    expect(version.fingerprint).toBe(datasetFingerprint('snapshot', 'norm-1.0', 'snapshot.v1', [H('norm1'), H('norm2')]));
    expect(getDatasetVersionFiles(db, version.versionId).map((f) => f.path)).toEqual([norm(1).path, norm(2).path]);
  });
  it('registration is idempotent for the same inputs (any order)', () => {
    const a = must(registerDatasetVersion(db, base([norm(1).path, norm(2).path]), 1));
    const b = must(registerDatasetVersion(db, base([norm(2).path, norm(1).path]), 2));
    expect(b.created).toBe(false);
    expect(b.version).toEqual(a.version);
    expect(listDatasetVersions(db).length).toBe(1);
  });
  it('a changed normalizer version or file set creates a NEW version and leaves the old one untouched', () => {
    const a = must(registerDatasetVersion(db, base([norm(1).path, norm(2).path]), 1));
    const snapshot = JSON.stringify(a.version) + JSON.stringify(getDatasetVersionFiles(db, a.version.versionId));
    const b = must(registerDatasetVersion(db, base([norm(1).path, norm(2).path], 'norm-1.1'), 2));
    const c = must(registerDatasetVersion(db, base([norm(1).path, norm(2).path, norm(3).path]), 3));
    expect(new Set([a.version.versionId, b.version.versionId, c.version.versionId]).size).toBe(3);
    expect(b.created && c.created).toBe(true);
    expect(JSON.stringify(getDatasetVersion(db, a.version.versionId)) + JSON.stringify(getDatasetVersionFiles(db, a.version.versionId))).toBe(snapshot);
    expect(listDatasetVersions(db, 'snapshot').length).toBe(3);
    expect(listDatasetVersions(db, 'trade')).toEqual([]);
  });
  it('fingerprint depends on file content, not path (replays elsewhere compare equal)', () => {
    must(registerDataFile(db, norm(9, { path: 'normalized/kind=snapshot/date=2026-10-16/replay-0001.parquet', sha256: H('norm1'), rowCount: 100, byteSize: 5001, timeStart: T0 + 60_000, timeEnd: T0 + 119_999 }), 1));
    const a = must(registerDatasetVersion(db, base([norm(1).path]), 1));
    const b = must(registerDatasetVersion(db, base(['normalized/kind=snapshot/date=2026-10-16/replay-0001.parquet']), 2));
    expect(b.version.fingerprint).toBe(a.version.fingerprint);
    expect(b.created).toBe(false);
  });
  it('rejects unknown files, raw files, wrong entity/schema and empty sets', () => {
    must(registerDataFile(db, raw(1), 1));
    must(registerDataFile(db, norm(5, { entity: 'trade', partitionKey: 'kind=trade/date=2026-10-16', path: 'normalized/kind=trade/date=2026-10-16/part-0005.parquet' }), 1));
    must(registerDataFile(db, norm(6, { schemaVersion: 'snapshot.v2', path: 'normalized/kind=snapshot/date=2026-10-17/part-0006.parquet' }), 1));
    expect(registerDatasetVersion(db, base(['normalized/missing.parquet']), 1)).toMatchObject({ ok: false, error: { code: 'CATALOG_UNKNOWN_FILE' } });
    expect(registerDatasetVersion(db, base([raw(1).path]), 1)).toMatchObject({ ok: false, error: { code: 'CATALOG_INVALID' } });
    expect(registerDatasetVersion(db, base(['normalized/kind=trade/date=2026-10-16/part-0005.parquet']), 1)).toMatchObject({ ok: false });
    expect(registerDatasetVersion(db, base(['normalized/kind=snapshot/date=2026-10-17/part-0006.parquet']), 1)).toMatchObject({ ok: false });
    expect(registerDatasetVersion(db, base([]), 1)).toMatchObject({ ok: false });
    expect(registerDatasetVersion(db, { ...base([norm(1).path]), normalizerVersion: '' }, 1)).toMatchObject({ ok: false });
    expect(listDatasetVersions(db)).toEqual([]);
  });
  it('dataset versions and their file links are immutable at the SQL level', () => {
    const a = must(registerDatasetVersion(db, base([norm(1).path]), 1));
    expect(() => db.prepare('UPDATE dataset_versions SET normalizer_version=?').run('hacked')).toThrow('append-only table');
    expect(() => db.prepare('DELETE FROM dataset_versions').run()).toThrow('append-only table');
    expect(() => db.prepare('DELETE FROM dataset_version_files').run()).toThrow('append-only table');
    expect(() => db.prepare('UPDATE dataset_version_files SET data_file_id=data_file_id').run()).toThrow('append-only table');
    expect(getDatasetVersion(db, a.version.versionId)).toEqual(a.version);
  });
  it('failed registration leaves no partial rows (transactional)', () => {
    registerDatasetVersion(db, base([norm(1).path, 'normalized/missing.parquet']), 1);
    expect(db.prepare('SELECT COUNT(*) c FROM dataset_versions').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) c FROM dataset_version_files').get()).toEqual({ c: 0 });
  });
});

describe('migration safety', () => {
  it('004 is additive: applying it to an existing v2 database keeps existing rows', () => {
    const d = openDb(':memory:');
    expect(migrate(d, MIGRATIONS.filter((m) => m.version <= 2))).toBe(2);
    d.prepare("INSERT INTO tokens(id,mint,symbol,name,first_seen_at) VALUES(1,'M','S','N',1)").run();
    expect(migrate(d)).toBe(4);
    expect(d.prepare('SELECT mint FROM tokens WHERE id=1').get()).toEqual({ mint: 'M' });
    expect(d.prepare('SELECT COUNT(*) c FROM data_files').get()).toEqual({ c: 0 });
  });
});
