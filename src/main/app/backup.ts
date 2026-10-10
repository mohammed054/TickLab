// docs/07 — daily backup via VACUUM INTO, keep the newest 7. Also diagnostics + CSV export file writers.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Db } from '../db/open';
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { schemaVersion } from '../db/migrate';
import { listErrors } from '../db/queries/usage';
import { listGaps } from '../db/queries/gaps';
import type { SourceStatus } from '../../shared/types';

const KEEP = 7;
const stamp = (ts: number): string => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');

export function backupDb(db: Db, dir: string, now: number): Result<{ path: string }> {
  try {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `ticklab-${stamp(now)}.db`);
    db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
    const files = readdirSync(dir).filter((f) => /^ticklab-\d{8}-\d{6}\.db$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) rmSync(join(dir, f), { force: true });
    return ok({ path });
  } catch (e) {
    return err('DB_ERROR', `Backup failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Safe file name only (no separators); written inside `dir`. */
export function writeTextFile(dir: string, fileName: string, content: string): Result<{ path: string }> {
  try {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, basename(fileName));
    writeFileSync(path, content, 'utf8');
    return ok({ path });
  } catch (e) {
    return err('DB_ERROR', `Could not write the file: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Diagnostics contain NO secrets, wallet address, keys or settings values. */
export function writeDiagnostics(db: Db, dir: string, now: number, info: { version: string; sources: SourceStatus[] }): Result<{ path: string }> {
  const counts = (t: string): number => (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;
  const body = {
    generatedAt: new Date(now).toISOString(), appVersion: info.version, schemaVersion: schemaVersion(db), sources: info.sources,
    counts: { tokens: counts('tokens'), pools: counts('pools'), snapshots: counts('pool_snapshots'), trades: counts('trades'), judgements: counts('judgements'), decisions: counts('decisions') },
    recentErrors: listErrors(db, 50), recentGaps: listGaps(db, 50),
  };
  return writeTextFile(dir, `ticklab-diagnostics-${stamp(now)}.json`, JSON.stringify(body, null, 2));
}
