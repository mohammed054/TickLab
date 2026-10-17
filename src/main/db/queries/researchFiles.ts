// src/main/db/queries/researchFiles.ts
//
// Versioned research file catalog (docs/07-phases-and-tasks.md T2.1,
// docs/09-research-system.md sec 9.3 storage layout and sec 9.5 data catalog).
//
// - data_files: one immutable row per raw/normalized file (path, partition,
//   schema version, sha256, time range, bytes, rows). Never rewritten.
// - source_manifests: the exact file list + checksums of one raw partition.
// - dataset_versions: immutable, fingerprinted set of normalized files. The same
//   inputs + normalizer version always register to the same version (idempotent);
//   any change produces a NEW version and leaves older ones untouched (sec 9.3:
//   "reprocessing writes a new derived dataset version").
//
// No financial math lives here (nothing to cite from docs/09-analytics).
import { createHash } from 'node:crypto';
import type { Db } from '../open';
import type {
  DataFile, DatasetVersion, RegisterDataFileInput, RegisterDatasetVersionInput,
  RegisterSourceManifestInput, Result, SourceManifest,
} from '../../../shared/types';
import { ok, err } from '../../../shared/types';

interface FileRow {
  id: number; path: string; layer: DataFile['layer']; source_id: string | null; entity: string | null;
  partition_key: string; schema_version: string; format: DataFile['format']; byte_size: number;
  row_count: number; sha256: string; time_start: number; time_end: number; registered_at: number;
}
interface ManifestRow {
  id: number; source_id: string; partition_key: string; manifest_sha256: string;
  file_count: number; total_bytes: number; created_at: number;
}
interface VersionRow {
  id: number; version_id: string; fingerprint: string; entity: string; normalizer_version: string;
  schema_version: string; file_count: number; row_count: number; total_bytes: number;
  time_start: number; time_end: number; created_at: number;
}

const mapFile = (r: FileRow): DataFile => ({
  id: r.id, path: r.path, layer: r.layer, sourceId: r.source_id, entity: r.entity,
  partitionKey: r.partition_key, schemaVersion: r.schema_version, format: r.format,
  byteSize: r.byte_size, rowCount: r.row_count, sha256: r.sha256,
  timeStart: r.time_start, timeEnd: r.time_end, registeredAt: r.registered_at,
});
const mapManifest = (r: ManifestRow): SourceManifest => ({
  id: r.id, sourceId: r.source_id, partitionKey: r.partition_key, manifestSha256: r.manifest_sha256,
  fileCount: r.file_count, totalBytes: r.total_bytes, createdAt: r.created_at,
});
const mapVersion = (r: VersionRow): DatasetVersion => ({
  id: r.id, versionId: r.version_id, fingerprint: r.fingerprint, entity: r.entity,
  normalizerVersion: r.normalizer_version, schemaVersion: r.schema_version,
  fileCount: r.file_count, rowCount: r.row_count, totalBytes: r.total_bytes,
  timeStart: r.time_start, timeEnd: r.time_end, createdAt: r.created_at,
});

const SHA256 = /^[0-9a-f]{64}$/;
const sha256Of = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
const isNonNegInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

/** Catalog paths are relative to <userData>/research/, '/'-separated, with no traversal. */
export function validateCatalogPath(path: string): string | null {
  if (typeof path !== 'string' || path.length === 0) return 'path is empty';
  if (path.includes('\\')) return 'path must use "/" separators';
  if (path.includes('\0')) return 'path contains NUL';
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'path must be relative to the research root';
  const segs = path.split('/');
  if (segs.some((s) => s === '' || s === '.' || s === '..')) return 'path has empty, "." or ".." segments';
  return null;
}

function validateFileInput(i: RegisterDataFileInput): string | null {
  const pe = validateCatalogPath(i.path);
  if (pe) return pe;
  if (i.layer !== 'raw' && i.layer !== 'normalized') return 'layer must be raw or normalized';
  if (i.layer === 'raw' && (!i.sourceId || i.entity !== null)) return 'raw files require sourceId and a null entity';
  if (i.layer === 'raw' && i.format !== 'jsonl.gz') return 'raw files must be jsonl.gz';
  if (i.layer === 'normalized' && (!i.entity || i.format !== 'parquet')) return 'normalized files require an entity and parquet format';
  if (!i.partitionKey) return 'partitionKey is empty';
  if (!i.schemaVersion) return 'schemaVersion is empty';
  if (!SHA256.test(i.sha256)) return 'sha256 must be 64 lowercase hex characters';
  if (!isNonNegInt(i.byteSize)) return 'byteSize must be a non-negative integer';
  if (!isNonNegInt(i.rowCount)) return 'rowCount must be a non-negative integer';
  if (!isInt(i.timeStart) || !isInt(i.timeEnd)) return 'time range must be integer epoch milliseconds';
  if (i.timeEnd < i.timeStart) return 'timeEnd is before timeStart';
  return null;
}

const SAME_FIELDS: (keyof RegisterDataFileInput)[] = [
  'path', 'layer', 'sourceId', 'entity', 'partitionKey', 'schemaVersion', 'format',
  'byteSize', 'rowCount', 'sha256', 'timeStart', 'timeEnd',
];

export function getDataFile(db: Db, path: string): DataFile | null {
  const r = db.prepare('SELECT * FROM data_files WHERE path=?').get(path) as FileRow | undefined;
  return r ? mapFile(r) : null;
}

/**
 * Idempotent registration. Same path + identical metadata returns the existing row
 * (created=false). Same path with different metadata/hash is a CATALOG_CONFLICT:
 * files are never rewritten (docs/09 sec 9.3), so the caller must write a new path.
 */
export function registerDataFile(db: Db, input: RegisterDataFileInput, now: number): Result<{ file: DataFile; created: boolean }> {
  const bad = validateFileInput(input);
  if (bad) return err('CATALOG_INVALID', bad);
  return db.transaction((): Result<{ file: DataFile; created: boolean }> => {
    const ex = getDataFile(db, input.path);
    if (ex) {
      const diff = SAME_FIELDS.filter((k) => ex[k] !== input[k]);
      if (diff.length) return err('CATALOG_CONFLICT', `${input.path} is already catalogued with different ${diff.join(', ')}; files are immutable`);
      return ok({ file: ex, created: false });
    }
    const r = db.prepare(
      'INSERT INTO data_files(path,layer,source_id,entity,partition_key,schema_version,format,byte_size,row_count,sha256,time_start,time_end,registered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(input.path, input.layer, input.sourceId, input.entity, input.partitionKey, input.schemaVersion, input.format,
      input.byteSize, input.rowCount, input.sha256, input.timeStart, input.timeEnd, now);
    return ok({ file: getDataFile(db, input.path) as DataFile, created: Number(r.lastInsertRowid) > 0 });
  })();
}

export interface ListFilesFilter {
  layer?: DataFile['layer']; sourceId?: string; entity?: string; partitionKey?: string;
  /** Return files whose [timeStart,timeEnd] overlaps [from,to] (either bound optional). */
  from?: number; to?: number;
}
export function listDataFiles(db: Db, f: ListFilesFilter = {}): DataFile[] {
  const where: string[] = []; const args: (string | number)[] = [];
  if (f.layer) { where.push('layer=?'); args.push(f.layer); }
  if (f.sourceId) { where.push('source_id=?'); args.push(f.sourceId); }
  if (f.entity) { where.push('entity=?'); args.push(f.entity); }
  if (f.partitionKey) { where.push('partition_key=?'); args.push(f.partitionKey); }
  if (f.from !== undefined) { where.push('time_end>=?'); args.push(f.from); }
  if (f.to !== undefined) { where.push('time_start<=?'); args.push(f.to); }
  const sql = `SELECT * FROM data_files${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY time_start, path`;
  return (db.prepare(sql).all(...args) as FileRow[]).map(mapFile);
}

/** Resolves paths to catalogued files, de-duplicating; fails if any path is unknown or the list is empty. */
function resolveFiles(db: Db, paths: string[]): Result<DataFile[]> {
  const uniq = [...new Set(paths)];
  if (uniq.length === 0) return err('CATALOG_INVALID', 'filePaths is empty');
  const files: DataFile[] = [];
  for (const p of uniq) {
    const f = getDataFile(db, p);
    if (!f) return err('CATALOG_UNKNOWN_FILE', `${p} is not catalogued`);
    files.push(f);
  }
  return ok(files);
}

/** Manifest hash: sha256 over sorted "path\tsha256\tbytes" lines, so it is independent of input order. */
export function manifestHash(files: Pick<DataFile, 'path' | 'sha256' | 'byteSize'>[]): string {
  const lines = files.map((f) => `${f.path}\t${f.sha256}\t${f.byteSize}`).sort();
  return sha256Of(lines.join('\n'));
}

/** Dataset fingerprint: depends on entity, normalizer, schema and file CONTENT hashes (not paths), so replays are comparable. */
export function datasetFingerprint(entity: string, normalizerVersion: string, schemaVersion: string, fileSha256s: string[]): string {
  return sha256Of([entity, normalizerVersion, schemaVersion, ...[...fileSha256s].sort()].join('\n'));
}

export function getSourceManifest(db: Db, sourceId: string, partitionKey: string, manifestSha256: string): SourceManifest | null {
  const r = db.prepare('SELECT * FROM source_manifests WHERE source_id=? AND partition_key=? AND manifest_sha256=?').get(sourceId, partitionKey, manifestSha256) as ManifestRow | undefined;
  return r ? mapManifest(r) : null;
}
export function listSourceManifests(db: Db, sourceId?: string, partitionKey?: string): SourceManifest[] {
  const where: string[] = []; const args: string[] = [];
  if (sourceId) { where.push('source_id=?'); args.push(sourceId); }
  if (partitionKey) { where.push('partition_key=?'); args.push(partitionKey); }
  const sql = `SELECT * FROM source_manifests${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at, id`;
  return (db.prepare(sql).all(...args) as ManifestRow[]).map(mapManifest);
}
export function getManifestFiles(db: Db, manifestId: number): DataFile[] {
  return (db.prepare('SELECT f.* FROM data_files f JOIN source_manifest_files m ON m.data_file_id=f.id WHERE m.manifest_id=? ORDER BY f.path').all(manifestId) as FileRow[]).map(mapFile);
}

/** Registers the checksum manifest of one raw partition. Idempotent on (source, partition, manifest hash). */
export function registerSourceManifest(db: Db, input: RegisterSourceManifestInput, now: number): Result<{ manifest: SourceManifest; created: boolean }> {
  if (!input.sourceId || !input.partitionKey) return err('CATALOG_INVALID', 'sourceId and partitionKey are required');
  return db.transaction((): Result<{ manifest: SourceManifest; created: boolean }> => {
    const res = resolveFiles(db, input.filePaths);
    if (!res.ok) return res;
    const files = res.value;
    const wrong = files.find((f) => f.layer !== 'raw' || f.sourceId !== input.sourceId || f.partitionKey !== input.partitionKey);
    if (wrong) return err('CATALOG_INVALID', `${wrong.path} is not a raw file of ${input.sourceId}/${input.partitionKey}`);
    const hash = manifestHash(files);
    const ex = getSourceManifest(db, input.sourceId, input.partitionKey, hash);
    if (ex) return ok({ manifest: ex, created: false });
    const total = files.reduce((a, f) => a + f.byteSize, 0);
    const id = Number(db.prepare('INSERT INTO source_manifests(source_id,partition_key,manifest_sha256,file_count,total_bytes,created_at) VALUES(?,?,?,?,?,?)')
      .run(input.sourceId, input.partitionKey, hash, files.length, total, now).lastInsertRowid);
    const link = db.prepare('INSERT INTO source_manifest_files(manifest_id,data_file_id) VALUES(?,?)');
    for (const f of files) link.run(id, f.id);
    return ok({ manifest: getSourceManifest(db, input.sourceId, input.partitionKey, hash) as SourceManifest, created: true });
  })();
}

export function getDatasetVersion(db: Db, versionId: string): DatasetVersion | null {
  const r = db.prepare('SELECT * FROM dataset_versions WHERE version_id=?').get(versionId) as VersionRow | undefined;
  return r ? mapVersion(r) : null;
}
export function listDatasetVersions(db: Db, entity?: string): DatasetVersion[] {
  const rows = entity
    ? db.prepare('SELECT * FROM dataset_versions WHERE entity=? ORDER BY created_at DESC, id DESC').all(entity)
    : db.prepare('SELECT * FROM dataset_versions ORDER BY created_at DESC, id DESC').all();
  return (rows as VersionRow[]).map(mapVersion);
}
export function getDatasetVersionFiles(db: Db, versionId: string): DataFile[] {
  return (db.prepare('SELECT f.* FROM data_files f JOIN dataset_version_files d ON d.data_file_id=f.id JOIN dataset_versions v ON v.id=d.dataset_version_id WHERE v.version_id=? ORDER BY f.time_start, f.path').all(versionId) as FileRow[]).map(mapFile);
}

/**
 * Registers an immutable dataset version over catalogued normalized files.
 * Idempotent: identical (entity, normalizer, schema, file contents) returns the existing
 * version (created=false). A different normalizer version or file set yields a new version;
 * existing versions are never modified (docs/09 sec 9.3, docs/07 T2.5).
 */
export function registerDatasetVersion(db: Db, input: RegisterDatasetVersionInput, now: number): Result<{ version: DatasetVersion; created: boolean }> {
  if (!input.entity || !input.normalizerVersion || !input.schemaVersion) {
    return err('CATALOG_INVALID', 'entity, normalizerVersion and schemaVersion are required');
  }
  return db.transaction((): Result<{ version: DatasetVersion; created: boolean }> => {
    const res = resolveFiles(db, input.filePaths);
    if (!res.ok) return res;
    const files = res.value;
    const wrong = files.find((f) => f.layer !== 'normalized' || f.entity !== input.entity || f.schemaVersion !== input.schemaVersion);
    if (wrong) return err('CATALOG_INVALID', `${wrong.path} is not a normalized ${input.entity} file with schema ${input.schemaVersion}`);
    const fingerprint = datasetFingerprint(input.entity, input.normalizerVersion, input.schemaVersion, files.map((f) => f.sha256));
    const versionId = `dsv_${fingerprint.slice(0, 16)}`;
    const exRow = db.prepare('SELECT * FROM dataset_versions WHERE fingerprint=?').get(fingerprint) as VersionRow | undefined;
    if (exRow) return ok({ version: mapVersion(exRow), created: false });
    const id = Number(db.prepare(
      'INSERT INTO dataset_versions(version_id,fingerprint,entity,normalizer_version,schema_version,file_count,row_count,total_bytes,time_start,time_end,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    ).run(versionId, fingerprint, input.entity, input.normalizerVersion, input.schemaVersion, files.length,
      files.reduce((a, f) => a + f.rowCount, 0), files.reduce((a, f) => a + f.byteSize, 0),
      Math.min(...files.map((f) => f.timeStart)), Math.max(...files.map((f) => f.timeEnd)), now).lastInsertRowid);
    const link = db.prepare('INSERT INTO dataset_version_files(dataset_version_id,data_file_id) VALUES(?,?)');
    for (const f of files) link.run(id, f.id);
    return ok({ version: getDatasetVersion(db, versionId) as DatasetVersion, created: true });
  })();
}
