import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { openDb, type Db } from '../db/open';
import { migrate } from '../db/migrate';
import { getDataFile, listDataFiles, listSourceManifests } from '../db/queries/researchFiles';
import { RawWriter, partitionKeyFor } from './rawWriter';
import { absPath, verifyDataFile, verifyPartition } from './manifest';

const H = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const T = Date.UTC(2026, 9, 16, 12, 5, 0); // 2026-10-16 12:05 UTC
const HOUR = 3_600_000;

let root: string; let db: Db;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rawwriter-')); db = openDb(':memory:'); migrate(db); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const env = (n: number, o: Record<string, unknown> = {}) => ({
  source: 'geckoterminal', endpointId: 'new_pools', requestId: `req-${n}`, requestAt: T + n * 1000 - 200,
  responseAt: T + n * 1000, httpStatus: 200, schemaVersion: 'gt.raw.v1', body: JSON.stringify({ data: [{ n }] }), ...o,
});
const w = (o: { max?: number } = {}) => new RawWriter({ root, db, now: () => 1234, maxUncompressedBytes: o.max });
const lines = (rel: string) => gunzipSync(readFileSync(absPath(root, rel))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const okPath = (r: ReturnType<RawWriter['append']>) => { if (!r.ok) throw new Error(r.error.message); return r.value.path; };

describe('envelope content', () => {
  it('writes exact body + required fields and a correct bodySha256', () => {
    const writer = w();
    const body = '{"a":"é\\n\u2028","n":1.10}\n\r\n  trailing  ';
    const p = okPath(writer.append(env(1, { body })));
    expect(writer.close().ok).toBe(true);
    const [row] = lines(p);
    expect(Object.keys(row)).toEqual(['source', 'endpointId', 'requestId', 'requestAt', 'responseAt', 'httpStatus', 'bodySha256', 'schemaVersion', 'body']);
    expect(row.body).toBe(body);
    expect(row.bodySha256).toBe(H(body));
    expect(row).toMatchObject({ source: 'geckoterminal', endpointId: 'new_pools', requestId: 'req-1', httpStatus: 200, schemaVersion: 'gt.raw.v1', responseAt: T + 1000 });
  });

  it('excludes secrets: unknown/auth fields and URL-style ids are rejected and nothing is written', () => {
    const writer = w();
    const bad: Record<string, unknown>[] = [
      { headers: { authorization: 'Bearer SECRET' } }, { authorization: 'SECRET' }, { apiKey: 'SECRET' }, { 'x-api-key': 'SECRET' },
      { endpointId: 'https://rpc.example.com/?api-key=SECRET' }, { requestId: 'a b' }, { source: '../evil' },
    ];
    for (const o of bad) {
      const r = writer.append(env(1, o));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(['RAW_FORBIDDEN_FIELD', 'RAW_INVALID']).toContain(r.error.code);
    }
    expect(existsSync(join(root, 'raw'))).toBe(false);
    expect(listDataFiles(db)).toEqual([]);
  });

  it('written files never contain credential-like field names', () => {
    const writer = w();
    const p = okPath(writer.append(env(1)));
    writer.close();
    const text = gunzipSync(readFileSync(absPath(root, p))).toString('utf8').toLowerCase();
    for (const k of ['authorization', 'api-key', 'apikey', 'cookie', 'secret', 'bearer']) expect(text).not.toContain(k);
  });

  it('rejects malformed values', () => {
    const writer = w();
    for (const o of [{ responseAt: 1.5 }, { responseAt: -1 }, { httpStatus: 99 }, { body: 5 }, { schemaVersion: '' }]) {
      expect(writer.append(env(1, o as Record<string, unknown>)).ok).toBe(false);
    }
  });
});

describe('rotation and catalog registration', () => {
  it('rotates on UTC hour boundary into separate hour partitions and registers the finished file', () => {
    const writer = w();
    const p1 = okPath(writer.append(env(1)));
    const r2 = writer.append(env(2, { responseAt: T + HOUR }));
    expect(r2.ok && r2.value.rotated).toBe(true);
    expect(p1).toBe('raw/provider=geckoterminal/date=2026-10-16/hour=12/part-0001.jsonl.gz');
    expect(okPath(r2)).toBe('raw/provider=geckoterminal/date=2026-10-16/hour=13/part-0001.jsonl.gz');
    // first file finalized + catalogued while the second is still open
    const f = getDataFile(db, p1)!;
    expect(f).toMatchObject({ layer: 'raw', sourceId: 'geckoterminal', entity: null, format: 'jsonl.gz', rowCount: 1, schemaVersion: 'gt.raw.v1', timeStart: T + 1000, timeEnd: T + 1000, registeredAt: 1234 });
    expect(f.partitionKey).toBe(partitionKeyFor('geckoterminal', T));
    expect(f.sha256).toBe(H(readFileSync(absPath(root, p1))));
    expect(f.byteSize).toBe(statSync(absPath(root, p1)).size);
    expect(getDataFile(db, 'raw/provider=geckoterminal/date=2026-10-16/hour=13/part-0001.jsonl.gz')).toBeNull();
    writer.close();
    expect(listDataFiles(db, { layer: 'raw' }).length).toBe(2);
  });

  it('rotates when 64 MiB-style size limit would be exceeded (configurable for the test)', () => {
    const writer = w({ max: 700 });
    const paths = [1, 2, 3, 4].map((n) => okPath(writer.append(env(n, { body: 'x'.repeat(200) }))));
    writer.close();
    expect(new Set(paths).size).toBeGreaterThan(1);
    expect(paths[0]).toMatch(/part-0001\.jsonl\.gz$/);
    expect(paths[paths.length - 1]).toMatch(/part-000[2-4]\.jsonl\.gz$/);
    const files = listDataFiles(db, { layer: 'raw' });
    expect(files.reduce((a, f) => a + f.rowCount, 0)).toBe(4);
    for (const f of files) expect(f.partitionKey).toBe(partitionKeyFor('geckoterminal', T));
  });

  it('a single oversize envelope gets its own file rather than being dropped', () => {
    const writer = w({ max: 100 });
    const a = okPath(writer.append(env(1, { body: 'y'.repeat(500) })));
    const b = okPath(writer.append(env(2, { body: 'z'.repeat(500) })));
    writer.close();
    expect(a).not.toBe(b);
    expect(lines(a)[0].body.length).toBe(500);
  });

  it('rotates when the schema version changes (one schema per file)', () => {
    const writer = w();
    const a = okPath(writer.append(env(1)));
    const b = okPath(writer.append(env(2, { schemaVersion: 'gt.raw.v2' })));
    writer.close();
    expect(a).not.toBe(b);
    expect(getDataFile(db, a)!.schemaVersion).toBe('gt.raw.v1');
    expect(getDataFile(db, b)!.schemaVersion).toBe('gt.raw.v2');
  });

  it('records min/max responseAt and row count, and keeps providers in separate directories', () => {
    const writer = w();
    okPath(writer.append(env(5)));
    okPath(writer.append(env(2)));
    const other = okPath(writer.append(env(3, { source: 'dexscreener' })));
    writer.close();
    expect(other).toContain('provider=dexscreener');
    const f = listDataFiles(db, { sourceId: 'geckoterminal' })[0];
    expect(f).toMatchObject({ rowCount: 2, timeStart: T + 2000, timeEnd: T + 5000 });
  });
});

describe('manifests and hash verification', () => {
  it('writes a manifest on close, registers it, and is idempotent across a rewrite', () => {
    const writer = w();
    okPath(writer.append(env(1)));
    okPath(writer.append(env(2, { responseAt: T + HOUR })));
    writer.close();
    const m = listSourceManifests(db);
    expect(m.length).toBe(2);
    const dir = join(root, 'raw', 'provider=geckoterminal', 'date=2026-10-16', 'hour=12');
    const mf = readdirSync(dir).find((n) => n.startsWith('manifest-'))!;
    const doc = JSON.parse(readFileSync(join(dir, mf), 'utf8'));
    expect(doc.files).toHaveLength(1);
    expect(doc.files[0].sha256).toBe(getDataFile(db, doc.files[0].path)!.sha256);
    writer.close(); // no pending work: no new manifests
    expect(listSourceManifests(db).length).toBe(2);
  });

  it('verifyDataFile / verifyPartition detect tampering, truncation and missing files', async () => {
    const writer = w();
    const p = okPath(writer.append(env(1)));
    writer.close();
    const f = getDataFile(db, p)!;
    expect((await verifyDataFile(root, f)).ok).toBe(true);
    expect((await verifyPartition(db, root, 'geckoterminal', f.partitionKey))).toEqual({ checked: 1, failures: [] });
    const abs = absPath(root, p);
    const orig = readFileSync(abs);
    const flipped = Buffer.from(orig); flipped[flipped.length - 12] ^= 0xff;
    writeFileSync(abs, flipped);
    expect(await verifyDataFile(root, f)).toMatchObject({ ok: false, reason: 'hash_mismatch' });
    writeFileSync(abs, orig.subarray(0, orig.length - 5));
    expect(await verifyDataFile(root, f)).toMatchObject({ ok: false, reason: 'size_mismatch' });
    expect((await verifyPartition(db, root, 'geckoterminal', f.partitionKey)).failures).toEqual([{ path: p, reason: 'size_mismatch' }]);
    rmSync(abs);
    expect(await verifyDataFile(root, f)).toMatchObject({ ok: false, reason: 'missing' });
  });
});

describe('restart recovery and quarantine', () => {
  it('promotes a valid .partial after a simulated crash, registers it, and continues at the next part number', () => {
    const crashed = w();
    const p = okPath(crashed.append(env(1)));
    okPath(crashed.append(env(2)));
    // no close(): simulate process kill; .partial remains on disk
    expect(existsSync(`${absPath(root, p)}.partial`)).toBe(true);
    const fresh = w();
    const rep = fresh.recover();
    expect(rep.finalized).toEqual([p]);
    expect(rep.quarantined).toEqual([]);
    const f = getDataFile(db, p)!;
    expect(f.rowCount).toBe(2);
    expect(f.sha256).toBe(H(readFileSync(absPath(root, p))));
    expect(existsSync(`${absPath(root, p)}.partial`)).toBe(false);
    expect(okPath(fresh.append(env(3)))).toMatch(/part-0002\.jsonl\.gz$/);
    fresh.close();
    expect(listSourceManifests(db).length).toBeGreaterThanOrEqual(1);
  });

  it('quarantines a truncated .partial untouched (bytes preserved) and does not catalog it', () => {
    const crashed = w();
    const p = okPath(crashed.append(env(1)));
    okPath(crashed.append(env(2)));
    const partial = `${absPath(root, p)}.partial`;
    const full = readFileSync(partial);
    const cut = full.subarray(0, full.length - 7); // kill mid-member
    writeFileSync(partial, cut);
    const rep = w().recover();
    expect(rep.finalized).toEqual([]);
    expect(rep.quarantined).toHaveLength(1);
    expect(rep.quarantined[0].reason).toBe('corrupt_gzip');
    const q = absPath(root, rep.quarantined[0].quarantinePath);
    expect(readFileSync(q).equals(cut)).toBe(true);
    expect(JSON.parse(readFileSync(`${q}.reason.json`, 'utf8')).reason).toBe('corrupt_gzip');
    expect(existsSync(partial)).toBe(false);
    expect(listDataFiles(db)).toEqual([]);
  });

  it('quarantines garbage, empty files, and files whose body hash does not match', () => {
    const dir = join(root, 'raw', 'provider=geckoterminal', 'date=2026-10-16', 'hour=12');
    const writer = w();
    const p = okPath(writer.append(env(1)));
    writer.close();
    // tamper with a *valid-gzip* envelope: rewrite body without updating hash
    const rows = lines(p);
    rows[0].body = 'changed';
    writeFileSync(join(dir, 'part-0002.jsonl.gz.partial'), gzipSync(Buffer.from(`${JSON.stringify(rows[0])}\n`)));
    writeFileSync(join(dir, 'part-0003.jsonl.gz.partial'), Buffer.from('not gzip at all'));
    writeFileSync(join(dir, 'part-0004.jsonl.gz.partial'), Buffer.alloc(0));
    const rep = w().recover();
    expect(rep.quarantined.map((q) => q.reason).sort()).toEqual(['body_hash_mismatch', 'corrupt_gzip', 'empty']);
    expect(listDataFiles(db).length).toBe(1);
  });

  it('registers a finalized file that was never catalogued (crash between rename and register)', () => {
    const writer = w();
    const p = okPath(writer.append(env(1)));
    writer.close();
    const f = getDataFile(db, p)!;
    // simulate lost catalog by opening a fresh DB
    const db2 = openDb(':memory:'); migrate(db2);
    const rep = new RawWriter({ root, db: db2, now: () => 99 }).recover();
    expect(rep.registered).toEqual([p]);
    expect(getDataFile(db2, p)).toMatchObject({ sha256: f.sha256, rowCount: 1, registeredAt: 99 });
  });

  it('recover() is idempotent and leaves catalogued files alone', () => {
    const writer = w();
    okPath(writer.append(env(1)));
    writer.close();
    const rep = w().recover();
    expect(rep).toEqual({ finalized: [], registered: [], quarantined: [] });
    expect(listDataFiles(db).length).toBe(1);
  });

  it('never appends to or modifies an existing finalized file', () => {
    const w1 = w();
    const p = okPath(w1.append(env(1)));
    w1.close();
    const before = readFileSync(absPath(root, p));
    const w2 = w();
    const p2 = okPath(w2.append(env(2)));
    w2.close();
    expect(p2).not.toBe(p);
    expect(readFileSync(absPath(root, p)).equals(before)).toBe(true);
  });
});
