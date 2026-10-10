// docs/03 §3.2 — token bucket with priority queue (lower number = more urgent), FIFO within a priority.
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { clock } from '../clock';

interface Waiter { n: number; prio: number; seq: number; deadline: number; resolve: (r: Result<true>) => void }

export class TokenBucket {
  private tokens: number;
  private last: number;
  private blockedUntil = 0;
  private q: Waiter[] = [];
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private capacity: number, private refillPerSec: number, private maxWaitMs = 30_000) {
    this.tokens = capacity; this.last = clock.now();
  }

  setRate(capacity: number, refillPerSec: number): void { this.capacity = capacity; this.refillPerSec = refillPerSec; this.tokens = Math.min(this.tokens, capacity); }
  get penalizedUntil(): number { return this.blockedUntil; }
  get queued(): number { return this.q.length; }

  private refill(): void {
    const now = clock.now();
    if (now < this.blockedUntil) { this.last = this.blockedUntil; return; }
    const from = Math.max(this.last, this.blockedUntil);
    this.tokens = Math.min(this.capacity, this.tokens + ((now - from) / 1000) * this.refillPerSec);
    this.last = now;
  }

  take(n = 1, priority = 2, maxWaitMs = this.maxWaitMs): Promise<Result<true>> {
    return new Promise((resolve) => {
      this.q.push({ n, prio: priority, seq: this.seq++, deadline: clock.now() + maxWaitMs, resolve });
      this.q.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
      this.pump();
    });
  }

  /** On HTTP 429: drain the bucket and block refill for `ms`. */
  penalize(ms: number): void {
    this.refill();
    this.tokens = 0; this.blockedUntil = Math.max(this.blockedUntil, clock.now() + ms); this.last = this.blockedUntil;
    this.pump();
  }

  private pump(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.refill();
    const now = clock.now();
    for (const w of [...this.q]) if (w.deadline <= now && !(this.tokens >= w.n && now >= this.blockedUntil && w === this.q[0])) {
      this.q.splice(this.q.indexOf(w), 1); w.resolve(err('RATE_WAIT_TIMEOUT', 'Waited too long for a rate-limit slot.'));
    }
    while (this.q.length && now >= this.blockedUntil && this.tokens >= this.q[0].n) {
      const w = this.q.shift() as Waiter; this.tokens -= w.n; w.resolve(ok(true));
    }
    if (!this.q.length) return;
    const head = this.q[0];
    const needMs = now < this.blockedUntil ? this.blockedUntil - now + 1 : Math.ceil(((head.n - this.tokens) / this.refillPerSec) * 1000) + 1;
    const nextDeadline = Math.min(...this.q.map((w) => w.deadline)) - now + 1;
    this.timer = setTimeout(() => this.pump(), Math.max(1, Math.min(needMs, nextDeadline)));
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Test/shutdown helper: rejects all waiters. */
  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const w of this.q) w.resolve(err('RATE_WAIT_TIMEOUT', 'Rate limiter stopped.'));
    this.q = [];
  }
}
