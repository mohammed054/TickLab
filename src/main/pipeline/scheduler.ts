// docs/03 §3.9 — starts/stops all loops. startAll() runs backfill FIRST. Loops never overlap themselves.
import type { PipelineCtx } from './context';
import { Tracker } from './tracker';
import { Discovery } from './discovery';
import { Deep, TRADES_EVERY_MS } from './deep';
import { runBackfill, type BackfillResult } from './backfill';
import { runRetention } from './retention';
import { jobState, logError } from '../db/queries/usage';
import { log } from '../logger';
import { MS } from '../../shared/constants';

interface Loop { name: string; everyMs: () => number; fn: () => Promise<unknown>; timer: ReturnType<typeof setTimeout> | null; running: Promise<unknown> | null }

export class Scheduler {
  readonly tracker: Tracker; readonly discovery: Discovery; readonly deep: Deep;
  private loops: Loop[] = []; private running = false; private statusTimer: ReturnType<typeof setInterval> | null = null;
  constructor(private c: PipelineCtx) {
    this.tracker = new Tracker(c); this.discovery = new Discovery(c, this.tracker); this.deep = new Deep(c);
  }

  get isRunning(): boolean { return this.running; }
  get intervalMultiplier(): number { return this.tracker.multiplier; }

  backfillNow(): Promise<BackfillResult> { return runBackfill(this.c, this.tracker); }

  async startAll(): Promise<BackfillResult | null> {
    if (this.running) return null;
    this.running = true;
    this.c.monitor.seedLastOk('geckoterminal', jobState(this.c.db, 'discovery').lastOkAt);
    let bf: BackfillResult | null = null;
    try { bf = await this.backfillNow(); } catch (e) { logError(this.c.db, 'geckoterminal', 'DB_ERROR', `backfill failed: ${String(e)}`, this.c.now()); }
    if (!this.running) return bf; // stopped while backfilling
    const s = this.c.settings;
    this.loops = [
      { name: 'discovery', everyMs: () => s.get('sources.gt.discoveryIntervalSec') * 1000, fn: () => this.discovery.pollOnce(), timer: null, running: null },
      { name: 'tracker', everyMs: () => 5000, fn: () => this.tracker.tick(), timer: null, running: null },
      { name: 'deep', everyMs: () => TRADES_EVERY_MS, fn: () => this.deep.tick(), timer: null, running: null },
      { name: 'retention', everyMs: () => 6 * MS.hour, fn: async () => runRetention(this.c.db, this.c.now(), s.get('retention.snapshotDays'), s.get('retention.tradeDays')), timer: null, running: null },
    ];
    for (const l of this.loops) this.schedule(l, l.name === 'retention' ? 0 : 0);
    this.c.batcher.start();
    this.statusTimer = setInterval(() => this.c.emit('evt:source-status', this.c.monitor.status()), 5000);
    (this.statusTimer as { unref?: () => void }).unref?.();
    return bf;
  }

  private schedule(l: Loop, delay: number): void {
    if (!this.running) return;
    l.timer = setTimeout(() => {
      if (!this.running) return;
      l.running = l.fn().catch((e) => { log.error(`loop ${l.name} failed: ${String(e)}`); logError(this.c.db, 'app', 'DB_ERROR', `${l.name}: ${String(e)}`, this.c.now()); })
        .finally(() => { l.running = null; this.schedule(l, l.everyMs()); });
    }, delay);
    (l.timer as { unref?: () => void }).unref?.();
  }

  /** Stops timers, waits for in-flight work (max 5 s). Caller closes the DB afterwards. */
  async stopAll(): Promise<void> {
    this.running = false;
    for (const l of this.loops) if (l.timer) clearTimeout(l.timer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.statusTimer = null;
    const inflight = this.loops.map((l) => l.running).filter((p): p is Promise<unknown> => p !== null);
    if (inflight.length) await Promise.race([Promise.allSettled(inflight), new Promise((r) => setTimeout(r, 5000))]);
    this.loops = []; this.deep.stopAll(); this.c.batcher.stop();
  }
  /** powerMonitor 'suspend' */
  suspend(): Promise<void> { return this.stopAll(); }
  /** powerMonitor 'resume': backfill again, then loops. */
  resume(): Promise<BackfillResult | null> { return this.startAll(); }
}
