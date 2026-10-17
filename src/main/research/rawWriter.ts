// src/main/research/rawWriter.ts
//
// Raw gzip JSONL writer (docs/07-phases-and-tasks.md T2.2, docs/09-research-system.md sec 9.3).
//
// Layout under <root> (= <userData>/research):
//   raw/provider=<id>/date=YYYY-MM-DD/hour=HH/part-NNNN.jsonl.gz
// Date/hour are UTC and taken from the envelope's responseAt (when the data became available).
//
// Each line is one envelope: source, endpointId, requestId, requestAt, responseAt,
// httpStatus, bodySha256, schemaVersion, body (the exact response body text). The
// envelope has NO headers/credentials/URL fields by construction: unknown keys are
// rejected, and ids must be plain tokens (a URL carrying a key in its query string is refused).
//
// Durability model: every envelope is appended as one complete gzip member to
// "<part>.jsonl.gz.partial" (concatenated members are a valid gzip stream). A file is
// finalized (fsync, rename to .jsonl.gz, sha256, catalog registration) when the UTC hour,
// the schema version, or the 64 MiB uncompressed limit changes. After a crash, recover()
// either finalizes a fully valid .partial or MOVES an invalid one to <root>/quarantine/
// (never deleted, never edited). Raw records are never rewritten.
import { createHash } from 'node:crypto';
import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync,
  statSync, writeFileSync, writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Db } from '../db/open';
import { clock } from '../clock';
import type { DataFile, Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { getDataFile, registerDataFile } from '../db/queries/researchFiles';
import { absPath, writePartitionManifest } from './manifest';

export const RAW_MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024; // docs/09 sec 9.3

export interface RawEnvelopeInput {
  source: string; endpointId: string; requestId: string;
  requestAt: number; responseAt: number; httpStatus: number;
  schemaVersion: string; body: string;
}
const ALLOWED_KEYS = new Set(['source', 'endpointId', 'requestId', 'requestAt', 'responseAt', 'httpStatus', 'schemaVersion', 'body']);
const SOURCE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SCHEMA_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PART_RE = /^part-(\d{4,})\.jsonl\.gz(\.partial)?$/;

const sha256Hex = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

export function validateEnvelope(e: unknown): Result<RawEnvelopeInput> {
  if (typeof e !== 'object' || e === null || Array.isArray(e)) return err('RAW_INVALID', 'envelope must be an object');
  const o = e as Record<string, unknown>;
  const extra = Object.keys(o).filter((k) => !ALLOWED_KEYS.has(k));
  if (extra.length) return err('RAW_FORBIDDEN_FIELD', `envelope has unsupported field(s): ${extra.join(', ')} (headers/credentials are never recorded)`);
  if (typeof o.source !== 'string' || !SOURCE_RE.test(o.source)) return err('RAW_INVALID', 'source must be a plain provider id');
  if (typeof o.endpointId !== 'string' || !ID_RE.test(o.endpointId)) return err('RAW_INVALID', 'endpointId must be a plain id, not a URL');
  if (typeof o.requestId !== 'string' || !ID_RE.test(o.requestId)) return err('RAW_INVALID', 'requestId must be a plain id');
  if (typeof o.schemaVersion !== 'string' || !SCHEMA_RE.test(o.schemaVersion)) return err('RAW_INVALID', 'schemaVersion is invalid');
  if (!isInt(o.requestAt) || !isInt(o.responseAt)) return err('RAW_INVALID', 'requestAt/responseAt must be integer epoch milliseconds');
  if (!isInt(o.httpStatus) || o.httpStatus < 100 || o.httpStatus > 599) return err('RAW_INVALID', 'httpStatus must be 100-599');
  if (typeof o.body !== 'string') return err('RAW_INVALID', 'body must be the exact response body text');
  return ok(o as unknown as RawEnvelopeInput);
}

const pad = (n: number, w: number): string => String(n).padStart(w, '0');
export function partitionKeyFor(source: string, responseAt: number): string {
  const iso = new Date(responseAt).toISOString();
  return `provider=${source}/date=${iso.slice(0, 10)}/hour=${iso.slice(11, 13)}`;
}

interface Active {
  source: string; partitionKey: string; schemaVersion: string; relFinal: string;
  absPartial: string; absFinal: string; fd: number;
  rows: number; uncompressed: number; tMin: number; tMax: number;
}
interface Inspected { rows: number; tMin: number; tMax: number; schemaVersion: string }

/** Validates a complete raw file's contents. Returns a reason string on failure. */
function inspectRawFile(buf: Buffer, source: string, partitionKey: string): Inspected | string {
  if (buf.length === 0) return 'empty';
  let text: string;
  try { text = gunzipSync(buf).toString('utf8'); } catch { return 'corrupt_gzip'; }
  if (!text.endsWith('\n')) return 'truncated_line';
  let rows = 0; let tMin = Infinity; let tMax = -Infinity; let schema: string | null = null;
  for (const line of text.split('\n')) {
    if (line === '') continue;
    let o: Record<string, unknown>;
    try { o = JSON.parse(line) as Record<string, unknown>; } catch { return 'invalid_json_line'; }
    if (typeof o.body !== 'string' || typeof o.bodySha256 !== 'string' || sha256Hex(o.body) !== o.bodySha256) return 'body_hash_mismatch';
    if (o.source !== source) return 'source_mismatch';
    if (!isInt(o.responseAt) || partitionKeyFor(source, o.responseAt) !== partitionKey) return 'partition_mismatch';
    if (typeof o.schemaVersion !== 'string') return 'invalid_schema_version';
    if (schema !== null && schema !== o.schemaVersion) return 'mixed_schema_versions';
    schema = o.schemaVersion; rows++; tMin = Math.min(tMin, o.responseAt); tMax = Math.max(tMax, o.responseAt);
  }
  if (rows === 0 || schema === null) return 'empty';
  return { rows, tMin, tMax, schemaVersion: schema };
}

export interface RecoveryReport {
  finalized: string[];      // valid .partial files promoted and registered
  registered: string[];     // finalized files that were missing from the catalog
  quarantined: { path: string; reason: string; quarantinePath: string }[];
}
export interface RawWriterOptions {
  root: string; db: Db; now?: () => number; maxUncompressedBytes?: number;
  /** Optional storage gate (T2.4). When it denies, open files are finalized and the append is refused; nothing is dropped silently. */
  writeGate?: () => { allowed: boolean; reason?: string };
}

export class RawWriter {
  private readonly root: string;
  private readonly db: Db;
  private readonly now: () => number;
  private readonly max: number;
  private readonly gate?: () => { allowed: boolean; reason?: string };
  private readonly active = new Map<string, Active>();
  private readonly pendingManifests = new Map<string, { source: string; partitionKey: string }>();

  constructor(o: RawWriterOptions) {
    this.root = o.root; this.db = o.db; this.now = o.now ?? (() => clock.now());
    this.max = o.maxUncompressedBytes ?? RAW_MAX_UNCOMPRESSED_BYTES;
    this.gate = o.writeGate;
  }

  /** Appends one envelope, rotating first if the hour, schema version, or size limit requires it. */
  append(input: unknown): Result<{ path: string; rotated: boolean }> {
    const v = validateEnvelope(input);
    if (!v.ok) return v;
    const e = v.value;
    if (this.gate) {
      const g = this.gate();
      if (!g.allowed) { // safe stop: close what is open so no half-written file lingers, then refuse
        const c = this.close();
        if (!c.ok) return c;
        return err('RAW_PAUSED_STORAGE', g.reason ?? 'raw writes are paused by the storage cap');
      }
    }
    const pk = partitionKeyFor(e.source, e.responseAt);
    const line = `${JSON.stringify({
      source: e.source, endpointId: e.endpointId, requestId: e.requestId, requestAt: e.requestAt,
      responseAt: e.responseAt, httpStatus: e.httpStatus, bodySha256: sha256Hex(e.body),
      schemaVersion: e.schemaVersion, body: e.body,
    })}\n`;
    const lineBytes = Buffer.byteLength(line, 'utf8');

    let rotated = false;
    let a = this.active.get(e.source);
    if (a && (a.partitionKey !== pk || a.schemaVersion !== e.schemaVersion || (a.rows > 0 && a.uncompressed + lineBytes > this.max))) {
      const f = this.finalize(a);
      if (!f.ok) return f;
      a = undefined; rotated = true;
    }
    if (!a) {
      try { a = this.open(e.source, pk, e.schemaVersion); } catch (x) { return err('RAW_IO', `cannot open raw file: ${(x as Error).message}`); }
      this.flushManifests(e.source, pk);
    }
    try {
      writeSync(a.fd, gzipSync(Buffer.from(line, 'utf8')));
    } catch (x) { return err('RAW_IO', `cannot write raw file: ${(x as Error).message}`); }
    a.rows++; a.uncompressed += lineBytes; a.tMin = Math.min(a.tMin, e.responseAt); a.tMax = Math.max(a.tMax, e.responseAt);
    return ok({ path: a.relFinal, rotated });
  }

  /** Finalizes all open files and writes pending partition manifests. Safe to call repeatedly. */
  close(): Result<void> {
    let firstErr: Result<never> | null = null;
    for (const a of [...this.active.values()]) {
      const f = this.finalize(a);
      if (!f.ok && !firstErr) firstErr = f;
    }
    this.flushManifests();
    return firstErr ?? ok(undefined);
  }

  /**
   * Startup recovery. Promotes valid .partial files, registers finalized-but-uncatalogued files,
   * and quarantines anything that fails validation. Never deletes or edits raw data.
   */
  recover(): RecoveryReport {
    const report: RecoveryReport = { finalized: [], registered: [], quarantined: [] };
    const rawRoot = join(this.root, 'raw');
    if (!existsSync(rawRoot)) return report;
    for (const prov of readdirSync(rawRoot)) {
      const m = /^provider=(.+)$/.exec(prov);
      if (!m || !SOURCE_RE.test(m[1])) continue;
      for (const date of safeDirs(join(rawRoot, prov))) {
        for (const hour of safeDirs(join(rawRoot, prov, date))) {
          const pk = `${prov}/${date}/${hour}`;
          const dir = join(rawRoot, prov, date, hour);
          for (const name of readdirSync(dir).sort()) {
            const pm = PART_RE.exec(name);
            if (!pm) continue;
            const isPartial = pm[2] !== undefined;
            const finalName = isPartial ? name.slice(0, -'.partial'.length) : name;
            const relFinal = `raw/${pk}/${finalName}`;
            if (!isPartial && getDataFile(this.db, relFinal)) continue; // already catalogued
            this.recoverOne(m[1], pk, join(dir, name), relFinal, isPartial, report);
          }
        }
      }
    }
    this.flushManifests();
    return report;
  }

  // ---- internals ----

  private recoverOne(source: string, pk: string, abs: string, relFinal: string, isPartial: boolean, report: RecoveryReport): void {
    const relCurrent = isPartial ? `${relFinal}.partial` : relFinal;
    const insp = inspectRawFile(readFileSync(abs), source, pk);
    if (typeof insp === 'string') { report.quarantined.push(this.quarantine(abs, relCurrent, insp)); return; }
    const absFinal = absPath(this.root, relFinal);
    if (isPartial) {
      if (existsSync(absFinal)) { report.quarantined.push(this.quarantine(abs, relCurrent, 'final_file_exists')); return; }
      renameSync(abs, absFinal);
    }
    const r = this.register(source, pk, relFinal, absFinal, insp);
    if (!r.ok) {
      report.quarantined.push(this.quarantine(absFinal, relFinal, r.error.code.toLowerCase()));
      return;
    }
    (isPartial ? report.finalized : report.registered).push(relFinal);
    this.pendingManifests.set(`${source}\0${pk}`, { source, partitionKey: pk });
  }

  private register(source: string, pk: string, relFinal: string, absFinal: string, i: Inspected): Result<DataFile> {
    const buf = readFileSync(absFinal);
    const res = registerDataFile(this.db, {
      path: relFinal, layer: 'raw', sourceId: source, entity: null, partitionKey: pk,
      schemaVersion: i.schemaVersion, format: 'jsonl.gz', byteSize: buf.length, rowCount: i.rows,
      sha256: sha256Hex(buf), timeStart: i.tMin, timeEnd: i.tMax,
    }, this.now());
    return res.ok ? ok(res.value.file) : res;
  }

  /** Moves a file under <root>/quarantine/ (unique name, reason sidecar). Data is preserved byte-for-byte. */
  private quarantine(abs: string, relCurrent: string, reason: string): { path: string; reason: string; quarantinePath: string } {
    let rel = `quarantine/${relCurrent}`;
    for (let n = 1; existsSync(absPath(this.root, rel)); n++) rel = `quarantine/${relCurrent}.${n}`;
    const dest = absPath(this.root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(abs, dest);
    writeFileSync(`${dest}.reason.json`, `${JSON.stringify({ originalPath: relCurrent, reason, quarantinedAt: this.now() }, null, 2)}\n`);
    return { path: relCurrent, reason, quarantinePath: rel };
  }

  private open(source: string, pk: string, schemaVersion: string): Active {
    const dir = join(this.root, 'raw', ...pk.split('/'));
    mkdirSync(dir, { recursive: true });
    let max = 0;
    for (const n of readdirSync(dir)) { const m = PART_RE.exec(n); if (m) max = Math.max(max, Number(m[1])); }
    const name = `part-${pad(max + 1, 4)}.jsonl.gz`;
    const absFinal = join(dir, name);
    const absPartial = `${absFinal}.partial`;
    const fd = openSync(absPartial, 'wx');
    const a: Active = {
      source, partitionKey: pk, schemaVersion, relFinal: `raw/${pk}/${name}`, absPartial, absFinal, fd,
      rows: 0, uncompressed: 0, tMin: Infinity, tMax: -Infinity,
    };
    this.active.set(source, a);
    return a;
  }

  private finalize(a: Active): Result<void> {
    this.active.delete(a.source);
    try { fsyncSync(a.fd); closeSync(a.fd); } catch (x) { return err('RAW_IO', `cannot close ${a.relFinal}: ${(x as Error).message}`); }
    if (a.rows === 0) { // nothing was written; keep the empty partial for recover() to quarantine rather than delete
      return ok(undefined);
    }
    if (existsSync(a.absFinal)) return err('RAW_IO', `${a.relFinal} already exists; refusing to overwrite`);
    try { renameSync(a.absPartial, a.absFinal); } catch (x) { return err('RAW_IO', `cannot finalize ${a.relFinal}: ${(x as Error).message}`); }
    const r = this.register(a.source, a.partitionKey, a.relFinal, a.absFinal, { rows: a.rows, tMin: a.tMin, tMax: a.tMax, schemaVersion: a.schemaVersion });
    if (!r.ok) return r; // file stays on disk; recover() will register or quarantine it
    this.pendingManifests.set(`${a.source}\0${a.partitionKey}`, { source: a.source, partitionKey: a.partitionKey });
    return ok(undefined);
  }

  /** Writes manifests for finished partitions (all pending, except the partition a source is currently writing). */
  private flushManifests(currentSource?: string, currentPk?: string): void {
    for (const [key, p] of [...this.pendingManifests]) {
      const act = this.active.get(p.source);
      if (act && act.partitionKey === p.partitionKey) continue; // still being written
      if (currentSource === p.source && currentPk === p.partitionKey) continue;
      writePartitionManifest(this.db, this.root, p.source, p.partitionKey, this.now());
      this.pendingManifests.delete(key);
    }
  }
}

function safeDirs(p: string): string[] {
  return readdirSync(p).filter((n) => { try { return statSync(join(p, n)).isDirectory(); } catch { return false; } });
}
