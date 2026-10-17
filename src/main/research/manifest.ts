// src/main/research/manifest.ts
//
// Per-partition checksum manifests and file hash verification for raw research
// files (docs/07-phases-and-tasks.md T2.2, docs/09-research-system.md sec 9.3).
//
// A manifest lists the exact files of one raw partition (path, sha256, bytes, rows,
// time range). It is registered in the SQLite catalog (source_manifests) and also
// written next to the data as manifest-<hash12>.json. Manifests are never
// overwritten; a changed file set produces a new manifest with a different hash.
// Verification re-hashes files on disk against the catalog. Nothing is deleted.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db/open';
import type { DataFile, Result, SourceManifest } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { getManifestFiles, listDataFiles, registerSourceManifest } from '../db/queries/researchFiles';

/** Absolute filesystem path of a catalog path (always '/'-separated) under the research root. */
export const absPath = (root: string, catalogPath: string): string => join(root, ...catalogPath.split('/'));

export function sha256File(abs: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(abs).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });
}

export interface VerifyResult { ok: boolean; reason?: 'missing' | 'size_mismatch' | 'hash_mismatch'; actualSha256?: string; actualBytes?: number }

/** Re-hashes one catalogued file on disk and compares size + sha256 with the catalog row. */
export async function verifyDataFile(root: string, file: Pick<DataFile, 'path' | 'sha256' | 'byteSize'>): Promise<VerifyResult> {
  const abs = absPath(root, file.path);
  if (!existsSync(abs)) return { ok: false, reason: 'missing' };
  const actualBytes = statSync(abs).size;
  if (actualBytes !== file.byteSize) return { ok: false, reason: 'size_mismatch', actualBytes };
  const actualSha256 = await sha256File(abs);
  if (actualSha256 !== file.sha256) return { ok: false, reason: 'hash_mismatch', actualSha256, actualBytes };
  return { ok: true, actualSha256, actualBytes };
}

export interface PartitionVerification { checked: number; failures: { path: string; reason: NonNullable<VerifyResult['reason']> }[] }

/** Verifies every catalogued raw file of a partition against disk. */
export async function verifyPartition(db: Db, root: string, sourceId: string, partitionKey: string): Promise<PartitionVerification> {
  const files = listDataFiles(db, { layer: 'raw', sourceId, partitionKey });
  const failures: PartitionVerification['failures'] = [];
  for (const f of files) {
    const v = await verifyDataFile(root, f);
    if (!v.ok && v.reason) failures.push({ path: f.path, reason: v.reason });
  }
  return { checked: files.length, failures };
}

/**
 * Registers the manifest for all catalogued raw files of a partition and writes
 * manifest-<hash12>.json beside them (skipped if that exact manifest already exists on disk).
 */
export function writePartitionManifest(db: Db, root: string, sourceId: string, partitionKey: string, now: number): Result<{ manifest: SourceManifest; created: boolean; path: string }> {
  const files = listDataFiles(db, { layer: 'raw', sourceId, partitionKey });
  if (files.length === 0) return err('MANIFEST_EMPTY', `no catalogued raw files for ${sourceId}/${partitionKey}`);
  const res = registerSourceManifest(db, { sourceId, partitionKey, filePaths: files.map((f) => f.path) }, now);
  if (!res.ok) return res;
  const { manifest, created } = res.value;
  const rel = `raw/${partitionKey}/manifest-${manifest.manifestSha256.slice(0, 12)}.json`;
  const abs = absPath(root, rel);
  if (!existsSync(abs)) {
    mkdirSync(join(abs, '..'), { recursive: true });
    const doc = {
      sourceId, partitionKey, manifestSha256: manifest.manifestSha256, createdAt: manifest.createdAt,
      fileCount: manifest.fileCount, totalBytes: manifest.totalBytes,
      files: getManifestFiles(db, manifest.id).map((f) => ({
        path: f.path, sha256: f.sha256, byteSize: f.byteSize, rowCount: f.rowCount,
        schemaVersion: f.schemaVersion, timeStart: f.timeStart, timeEnd: f.timeEnd,
      })),
    };
    writeFileSync(abs, `${JSON.stringify(doc, null, 2)}\n`, { flag: 'wx' });
  }
  return ok({ manifest, created, path: rel });
}
