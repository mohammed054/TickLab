// src/main/research/storageBudget.ts
//
// Research disk cap and cleanup policy (docs/07-phases-and-tasks.md T2.4,
// docs/09-research-system.md sec 9.3).
//
// States (percent of the EFFECTIVE cap):
//   ok            < 80   everything allowed
//   warning       >= 80  persistent warning + estimated time to cap; everything still allowed
//   deep_paused   >= 90  low-priority deep capture and model-artifact duplication stop;
//                        shallow launch capture (raw writes) continues
//   raw_paused    >= 95  new raw writes stop, a `storage_cap` gap is persisted, an alert fires
//
// The effective cap is the lower of the configured allocation (default 150 GiB) and what the
// volume can give while keeping `minFreeOutsideGiB` (default 50 GiB) free outside the
// allocation, so the cap is never read as the capacity of the physical drive.
//
// THIS MODULE NEVER CHANGES FILES. It measures, classifies, records gaps in SQLite, emits
// events, and computes a read-only cleanup PREVIEW. Pruning is a separate, explicitly
// configured job that does not exist yet; nothing here can remove, move or rewrite data.
import { readdir, stat, statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Db } from '../db/open';
import { clock } from '../clock';
import type {
  CleanupCandidate, CleanupPreview, Result, StorageAction, StorageState, StorageStatus,
} from '../../shared/types';
import { ok, err } from '../../shared/types';
import { MS } from '../../shared/constants';
import type { SettingsStore } from '../settings/store';
import { verifyDataFile } from './manifest';

export const GIB = 1024 ** 3;
/** Percent-of-cap thresholds from docs/09 sec 9.3. */
export const THRESHOLDS = { warning: 80, deepPaused: 90, rawPaused: 95 } as const;
/** A state is left only once usage is this many points below its entry threshold (prevents flapping). Executor assumption. */
export const HYSTERESIS_PCT = 2;
const GAP_SOURCE = 'research';
const GAP_REASON = 'storage_cap';
const SAMPLE_WINDOW_MS = MS.day;
const MAX_SAMPLES = 500;
const MIN_ETA_SPAN_MS = MS.min;
/** Raw files only; everything else (normalized outcomes, runs, quarantine) is never a cleanup candidate. */
const PROTECTED_PREFIXES = ['runs/', 'normalized/', 'quarantine/'];

export interface DiskMeter { measure(): Promise<{ usedBytes: number; freeBytes: number }> }
export interface StorageConfig { capBytes: number; reserveBytes: number }
export interface CleanupConfig { enabled: boolean; targetPercent: number; minRawAgeDays: number }

export type StorageEvent =
  | { type: 'state_changed'; at: number; from: StorageState | null; to: StorageState; percent: number; usedBytes: number; effectiveCapBytes: number; etaMs: number | null }
  | { type: 'alert'; at: number; level: 'warning' | 'critical'; message: string }
  | { type: 'raw_writes_paused'; at: number; percent: number; gapId: number }
  | { type: 'raw_writes_resumed'; at: number; percent: number; gapId: number }
  | { type: 'measure_failed'; at: number; message: string };

export function storageConfigFromSettings(s: Pick<SettingsStore, 'get'>): StorageConfig {
  return { capBytes: Math.floor(s.get('research.storageCapGiB') * GIB), reserveBytes: Math.floor(s.get('research.minFreeOutsideGiB') * GIB) };
}
export function cleanupConfigFromSettings(s: Pick<SettingsStore, 'get'>): CleanupConfig {
  return { enabled: s.get('research.cleanup.enabled'), targetPercent: s.get('research.cleanup.targetPercent'), minRawAgeDays: s.get('research.cleanup.minRawAgeDays') };
}

const RANK: Record<StorageState, number> = { ok: 0, warning: 1, deep_paused: 2, raw_paused: 3 };
const ENTRY: Record<Exclude<StorageState, 'ok'>, number> = { warning: THRESHOLDS.warning, deep_paused: THRESHOLDS.deepPaused, raw_paused: THRESHOLDS.rawPaused };
const BY_RANK: StorageState[] = ['ok', 'warning', 'deep_paused', 'raw_paused'];

/** Pure threshold classification with no history (inclusive: "at 80%" means >= 80). */
export function classify(percent: number): StorageState {
  if (percent >= THRESHOLDS.rawPaused) return 'raw_paused';
  if (percent >= THRESHOLDS.deepPaused) return 'deep_paused';
  if (percent >= THRESHOLDS.warning) return 'warning';
  return 'ok';
}
/** Next state given the previous one: escalates immediately, de-escalates only past the hysteresis margin. */
export function nextState(prev: StorageState | null, percent: number): StorageState {
  const up = classify(percent);
  if (prev === null || RANK[up] >= RANK[prev]) return up;
  let s = prev;
  while (RANK[s] > 0 && percent < ENTRY[s as Exclude<StorageState, 'ok'>] - HYSTERESIS_PCT) s = BY_RANK[RANK[s] - 1];
  return s;
}

export function computeUsage(usedBytes: number, freeBytes: number, cfg: StorageConfig): { effectiveCapBytes: number; limitedBy: 'cap' | 'free_space'; percent: number } {
  const headroom = Math.max(0, freeBytes - cfg.reserveBytes);
  const byVolume = usedBytes + headroom;
  const effectiveCapBytes = Math.min(cfg.capBytes, byVolume);
  const percent = effectiveCapBytes > 0 ? Math.min(1000, (usedBytes / effectiveCapBytes) * 100) : 1000;
  return { effectiveCapBytes, limitedBy: byVolume < cfg.capBytes ? 'free_space' : 'cap', percent };
}

const ALLOWED: Record<StorageState, Record<StorageAction, boolean>> = {
  ok: { rawWrite: true, deepCapture: true, modelArtifact: true },
  warning: { rawWrite: true, deepCapture: true, modelArtifact: true },
  deep_paused: { rawWrite: true, deepCapture: false, modelArtifact: false },
  raw_paused: { rawWrite: false, deepCapture: false, modelArtifact: false },
};

const fmtGiB = (b: number): string => `${(b / GIB).toFixed(1)} GiB`;
function fmtEta(ms: number | null): string {
  if (ms === null) return 'time to cap unknown';
  const h = ms / MS.hour;
  return h < 48 ? `about ${Math.max(1, Math.round(h))} h to cap` : `about ${Math.round(h / 24)} days to cap`;
}

/** Real meter: sums apparent file sizes under the research root and reads free space of its volume. */
export function createFsDiskMeter(researchRoot: string): DiskMeter {
  async function used(): Promise<number> {
    let total = 0;
    const stack = [researchRoot];
    while (stack.length) {
      const dir = stack.pop() as string;
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw e;
      }
      for (const ent of entries) {
        const p = join(dir, ent.name);
        if (ent.isSymbolicLink()) continue;
        if (ent.isDirectory()) stack.push(p);
        else if (ent.isFile()) {
          try { total += (await stat(p)).size; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        }
      }
    }
    return total;
  }
  async function free(): Promise<number> {
    let p = researchRoot;
    for (;;) {
      try { const f = await statfs(p); return Number(f.bavail) * Number(f.bsize); } catch (e) {
        const parent = dirname(p);
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || parent === p) throw e;
        p = parent;
      }
    }
  }
  return { measure: async () => ({ usedBytes: await used(), freeBytes: await free() }) };
}

export interface StorageBudgetOptions {
  db: Db; meter: DiskMeter; getConfig: () => StorageConfig;
  /** Research root; required only for cleanupPreview({ verifyHashes: true }). */
  root?: string; now?: () => number; onEvent?: (e: StorageEvent) => void;
}

export class StorageBudget {
  private readonly db: Db;
  private readonly meter: DiskMeter;
  private readonly getConfig: () => StorageConfig;
  private readonly root?: string;
  private readonly now: () => number;
  private readonly onEvent: (e: StorageEvent) => void;
  private status: StorageStatus | null = null;
  private samples: { at: number; used: number }[] = [];
  private gapId: number | null = null;
  private adopted = false;
  private inflight: Promise<Result<StorageStatus>> | null = null;

  constructor(o: StorageBudgetOptions) {
    this.db = o.db; this.meter = o.meter; this.getConfig = o.getConfig; this.root = o.root;
    this.now = o.now ?? (() => clock.now()); this.onEvent = o.onEvent ?? (() => undefined);
  }

  /** Last measured status, or null before the first successful measurement. */
  current(): StorageStatus | null { return this.status; }

  /** Whether an action may start. Fails closed until usage has been measured once. */
  allow(action: StorageAction): { allowed: boolean; reason?: string } {
    const s = this.status;
    if (!s) return { allowed: false, reason: 'research storage usage has not been measured yet' };
    if (s.allowed[action]) return { allowed: true };
    return { allowed: false, reason: `research storage is ${s.state.replace('_', ' ')} at ${s.percent.toFixed(1)}% of its cap` };
  }
  /** Gate for RawWriter (`writeGate` option). */
  writeGate = (): { allowed: boolean; reason?: string } => this.allow('rawWrite');

  refresh(): Promise<Result<StorageStatus>> {
    if (!this.inflight) this.inflight = this.doRefresh().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private async doRefresh(): Promise<Result<StorageStatus>> {
    let m: { usedBytes: number; freeBytes: number };
    try { m = await this.meter.measure(); } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.onEvent({ type: 'measure_failed', at: this.now(), message });
      return err('STORAGE_MEASURE_FAILED', message);
    }
    if (![m.usedBytes, m.freeBytes].every((n) => Number.isFinite(n) && n >= 0)) {
      this.onEvent({ type: 'measure_failed', at: this.now(), message: 'disk meter returned invalid values' });
      return err('STORAGE_MEASURE_FAILED', 'disk meter returned invalid values');
    }
    const at = this.now();
    const cfg = this.getConfig();
    const u = computeUsage(m.usedBytes, m.freeBytes, cfg);
    this.samples.push({ at, used: m.usedBytes });
    this.samples = this.samples.filter((x) => at - x.at <= SAMPLE_WINDOW_MS).slice(-MAX_SAMPLES);
    const etaMs = this.eta(u.effectiveCapBytes, m.usedBytes);

    const prev = this.status?.state ?? null;
    const state = nextState(prev, u.percent);
    const gapEvent = this.syncGap(state, u.percent, at); // emitted after state_changed/alert so consumers see cause before effect

    const warning = state === 'ok' ? null
      : `Research storage is at ${u.percent.toFixed(0)}% of its ${fmtGiB(u.effectiveCapBytes)} cap (${fmtGiB(m.usedBytes)} used; ${fmtEta(etaMs)}).`
        + (state === 'deep_paused' ? ' Deep capture and model-artifact copies are paused.' : state === 'raw_paused' ? ' New raw writes are paused; nothing has been deleted.' : '');
    this.status = {
      state, percent: u.percent, usedBytes: m.usedBytes, freeBytes: m.freeBytes, capBytes: cfg.capBytes,
      effectiveCapBytes: u.effectiveCapBytes, limitedBy: u.limitedBy, reserveBytes: cfg.reserveBytes, etaMs,
      allowed: { ...ALLOWED[state] }, warning, measuredAt: at, gapId: this.gapId,
    };
    if (state !== prev) {
      this.onEvent({ type: 'state_changed', at, from: prev, to: state, percent: u.percent, usedBytes: m.usedBytes, effectiveCapBytes: u.effectiveCapBytes, etaMs });
      if (RANK[state] > (prev === null ? 0 : RANK[prev]) && state !== 'ok') {
        this.onEvent({ type: 'alert', at, level: state === 'raw_paused' ? 'critical' : 'warning', message: warning as string });
      }
    }
    if (gapEvent) this.onEvent(gapEvent);
    return ok(this.status);
  }

  private eta(effectiveCap: number, used: number): number | null {
    const first = this.samples[0]; const last = this.samples[this.samples.length - 1];
    if (!first || !last || last.at - first.at < MIN_ETA_SPAN_MS) return null;
    const rate = (last.used - first.used) / (last.at - first.at); // bytes per ms
    if (!(rate > 0)) return null;
    return Math.max(0, Math.round((effectiveCap - used) / rate));
  }

  /** Persists/extends/closes the `storage_cap` gap as raw writes pause and resume. */
  private syncGap(state: StorageState, percent: number, at: number): StorageEvent | null {
    if (!this.adopted) { // adopt a gap left open by a previous run instead of duplicating it
      this.adopted = true;
      const open = this.db.prepare("SELECT id FROM gaps WHERE source=? AND reason=? AND resolved=0 ORDER BY id DESC LIMIT 1").get(GAP_SOURCE, GAP_REASON) as { id: number } | undefined;
      if (open) this.gapId = open.id;
    }
    if (state === 'raw_paused') {
      if (this.gapId === null) {
        this.gapId = Number(this.db.prepare('INSERT INTO gaps(source,start_at,end_at,reason) VALUES(?,?,?,?)').run(GAP_SOURCE, at, at, GAP_REASON).lastInsertRowid);
        return { type: 'raw_writes_paused', at, percent, gapId: this.gapId };
      }
      this.db.prepare('UPDATE gaps SET end_at=? WHERE id=?').run(at, this.gapId);
    } else if (this.gapId !== null) {
      this.db.prepare('UPDATE gaps SET end_at=?, resolved=1 WHERE id=?').run(at, this.gapId);
      const ev: StorageEvent = { type: 'raw_writes_resumed', at, percent, gapId: this.gapId };
      this.gapId = null;
      return ev;
    }
    return null;
  }

  /**
   * Read-only preview of what a user-configured cleanup would prune: OLDEST RAW files first, only
   * raw files that are old enough and whose manifest is retained. Normalized outcomes/labels,
   * research runs and quarantine are never candidates. Returns no candidates unless cleanup was
   * explicitly enabled. Nothing is changed by calling this.
   */
  async cleanupPreview(cfg: CleanupConfig, opts: { verifyHashes?: boolean } = {}): Promise<Result<CleanupPreview>> {
    const st = this.status;
    if (!st) return err('STORAGE_NOT_MEASURED', 'research storage usage has not been measured yet');
    if (opts.verifyHashes && !this.root) return err('VALIDATION', 'verifyHashes needs the research root');
    const targetBytes = Math.floor((st.effectiveCapBytes * cfg.targetPercent) / 100);
    const bytesToFree = Math.max(0, st.usedBytes - targetBytes);
    const base = { usedBytes: st.usedBytes, targetBytes, bytesToFree, freedBytes: 0, shortfallBytes: bytesToFree, candidates: [] as CleanupCandidate[], skipped: {} as Record<string, number> };
    if (!cfg.enabled) {
      return ok({ ...base, configured: false, reason: 'Cleanup is not configured. Enable it in Settings and choose a target; nothing is ever pruned automatically.' });
    }
    if (bytesToFree === 0) return ok({ ...base, configured: true, reason: 'Usage is already at or below the cleanup target.', shortfallBytes: 0 });

    const cutoff = this.now() - cfg.minRawAgeDays * MS.day;
    const rows = this.db.prepare(
      `SELECT f.path, f.byte_size, f.time_start, f.time_end, f.sha256,
              EXISTS(SELECT 1 FROM source_manifest_files m WHERE m.data_file_id=f.id) AS has_manifest
         FROM data_files f WHERE f.layer='raw' ORDER BY f.time_start, f.path`,
    ).all() as { path: string; byte_size: number; time_start: number; time_end: number; sha256: string; has_manifest: number }[];

    const skip = (reason: string): void => { base.skipped[reason] = (base.skipped[reason] ?? 0) + 1; };
    let freed = 0;
    for (const r of rows) {
      if (freed >= bytesToFree) break;
      if (!r.path.startsWith('raw/') || PROTECTED_PREFIXES.some((p) => r.path.startsWith(p))) { skip('protected'); continue; }
      if (r.time_end > cutoff) { skip('too_recent'); continue; }
      if (!r.has_manifest) { skip('no_manifest'); continue; }
      if (opts.verifyHashes) {
        const v = await verifyDataFile(this.root as string, { path: r.path, sha256: r.sha256, byteSize: r.byte_size });
        if (!v.ok) { skip(v.reason ?? 'verify_failed'); continue; }
      }
      base.candidates.push({ path: r.path, byteSize: r.byte_size, timeStart: r.time_start, timeEnd: r.time_end, sha256: r.sha256 });
      freed += r.byte_size;
    }
    return ok({
      ...base, configured: true, freedBytes: freed, shortfallBytes: Math.max(0, bytesToFree - freed),
      reason: freed >= bytesToFree ? null : 'Eligible raw files cannot reach the target; raise the cap, relax the minimum age, or free space elsewhere.',
    });
  }
}
