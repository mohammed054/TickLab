// docs/06 §6.1 / T3.2 — coalesces launches-updated ids into one event per interval.
export class LaunchBatcher {
  private ids = new Set<number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private send: (tokenIds: number[]) => void, private intervalMs = 1000) {}
  add(ids: Iterable<number>): void { for (const i of ids) this.ids.add(i); }
  flush(): void { if (this.ids.size === 0) return; const out = [...this.ids]; this.ids.clear(); this.send(out); }
  start(): void { if (!this.timer) { this.timer = setInterval(() => this.flush(), this.intervalMs); (this.timer as { unref?: () => void }).unref?.(); } }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.flush(); }
}
