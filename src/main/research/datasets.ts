// src/main/research/datasets.ts
//
// Normalized dataset builder (docs/07-phases-and-tasks.md T2.3, docs/09-research-system.md
// sec 9.3 and 9.5). Runs in Electron main, which is the only radar.db writer:
//   1. resolves the requested raw files from the catalog (T2.1);
//   2. asks the Python worker to verify them and write normalized Parquet;
//   3. re-hashes every file the worker reports before trusting it;
//   4. registers the files and one immutable dataset version in the catalog.
// The worker never sees radar.db and never overwrites data: reprocessing with a changed
// normalizer or input set yields a NEW dataset version (docs/09 sec 9.3). If a worker run
// fails, nothing is registered; any already-written content-addressed files are harmless
// orphans that T2.5 replay/cleanup accounts for.
import { z } from 'zod';
import type { Db } from '../db/open';
import { clock } from '../clock';
import type { DataFile, DatasetVersion, Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { getDataFile, registerDataFile, registerDatasetVersion, validateCatalogPath } from '../db/queries/researchFiles';
import { verifyDataFile } from './manifest';

export interface WorkerLike { request(command: string, payload: unknown, timeoutMs?: number): Promise<unknown> }

export interface NormalizeOptions {
  db: Db; root: string; worker: WorkerLike;
  /** Name of a normalizer registered inside the worker (storage.catalog.register_normalizer). */
  normalizer: string;
  rawFilePaths: string[];
  targetBytes?: number; timeoutMs?: number; now?: () => number;
}

const sha = z.string().regex(/^[0-9a-f]{64}$/);
const int = z.number().int().nonnegative();
const OutFile = z.object({
  path: z.string(), entity: z.string().min(1), partitionKey: z.string().min(1), schemaVersion: z.string().min(1),
  rowCount: int, byteSize: int, sha256: sha, timeStart: z.number().int(), timeEnd: z.number().int(),
}).strict();
const NormalizeResult = z.object({
  entity: z.string().min(1), normalizerName: z.string().min(1), normalizerVersion: z.string().min(1),
  schemaVersion: z.string().min(1), rowCount: int,
  inputs: z.array(z.object({ path: z.string(), sha256: sha }).strict()),
  files: z.array(OutFile),
}).strict();

export async function normalizeRawToDataset(o: NormalizeOptions): Promise<Result<{ version: DatasetVersion; created: boolean; files: DataFile[] }>> {
  const now = o.now ?? (() => clock.now());
  const uniq = [...new Set(o.rawFilePaths)].sort();
  if (uniq.length === 0) return err('DATASET_INVALID', 'rawFilePaths is empty');

  const inputs = [];
  for (const p of uniq) {
    const f = getDataFile(o.db, p);
    if (!f) return err('CATALOG_UNKNOWN_FILE', `${p} is not catalogued`);
    if (f.layer !== 'raw' || !f.sourceId) return err('DATASET_INVALID', `${p} is not a raw file`);
    inputs.push({ path: f.path, sha256: f.sha256, byteSize: f.byteSize, rowCount: f.rowCount, schemaVersion: f.schemaVersion, sourceId: f.sourceId, partitionKey: f.partitionKey });
  }

  let raw: unknown;
  try {
    raw = await o.worker.request('normalize', { root: o.root, normalizer: o.normalizer, inputs, ...(o.targetBytes ? { targetBytes: o.targetBytes } : {}) }, o.timeoutMs ?? 600_000);
  } catch (e) {
    return err('NORMALIZE_FAILED', (e as Error).message);
  }
  const parsed = NormalizeResult.safeParse(raw);
  if (!parsed.success) return err('NORMALIZE_BAD_RESPONSE', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const res = parsed.data;
  if (res.normalizerName !== o.normalizer) return err('NORMALIZE_BAD_RESPONSE', `worker ran ${res.normalizerName}, expected ${o.normalizer}`);

  // The worker must report exactly the inputs it was given (same paths and hashes).
  const sent = JSON.stringify(inputs.map((i) => [i.path, i.sha256]));
  const got = JSON.stringify(res.inputs.map((i) => [i.path, i.sha256]));
  if (sent !== got) return err('NORMALIZE_BAD_RESPONSE', 'worker reported different inputs than requested');
  if (res.files.length === 0) return err('DATASET_EMPTY', 'normalizer produced no rows; no dataset version created');

  // Trust nothing the worker reports until the bytes on disk match (and paths stay inside normalized/).
  for (const f of res.files) {
    const bad = validateCatalogPath(f.path);
    if (bad) return err('NORMALIZE_BAD_RESPONSE', `${f.path}: ${bad}`);
    if (!f.path.startsWith(`normalized/${f.partitionKey}/`) || f.entity !== res.entity || f.schemaVersion !== res.schemaVersion || !f.partitionKey.startsWith(`kind=${res.entity}/date=`)) {
      return err('NORMALIZE_BAD_RESPONSE', `${f.path} does not match entity/partition/schema ${res.entity}/${res.schemaVersion}`);
    }
    const v = await verifyDataFile(o.root, { path: f.path, sha256: f.sha256, byteSize: f.byteSize });
    if (!v.ok) return err('NORMALIZE_OUTPUT_MISMATCH', `${f.path}: ${v.reason}`);
  }

  // Register atomically from the catalog's point of view: all files, then the version.
  const registered: DataFile[] = [];
  const tx = o.db.transaction((): Result<{ version: DatasetVersion; created: boolean }> => {
    for (const f of res.files) {
      const r = registerDataFile(o.db, {
        path: f.path, layer: 'normalized', sourceId: null, entity: f.entity, partitionKey: f.partitionKey,
        schemaVersion: f.schemaVersion, format: 'parquet', byteSize: f.byteSize, rowCount: f.rowCount,
        sha256: f.sha256, timeStart: f.timeStart, timeEnd: f.timeEnd,
      }, now());
      if (!r.ok) throw new CatalogFail(r);
      registered.push(r.value.file);
    }
    const v = registerDatasetVersion(o.db, {
      entity: res.entity, normalizerVersion: res.normalizerVersion, schemaVersion: res.schemaVersion,
      filePaths: res.files.map((f) => f.path),
    }, now());
    if (!v.ok) throw new CatalogFail(v); // roll back the file registrations too
    return v;
  });
  try {
    const r = tx();
    if (!r.ok) return r;
    return ok({ version: r.value.version, created: r.value.created, files: registered });
  } catch (e) {
    if (e instanceof CatalogFail) return e.result;
    throw e;
  }
}

class CatalogFail extends Error {
  constructor(readonly result: Result<never>) { super('catalog registration failed'); }
}
