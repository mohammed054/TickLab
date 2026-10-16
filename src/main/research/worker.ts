// src/main/research/worker.ts
//
// Supervisor for the local Python research worker (docs/09-research-system.md
// sec 9.2). Runs ONLY in the Electron main process: it spawns the worker as a
// child process (<venv python> research-worker/src/main.py), frames stdin/stdout
// as JSON Lines, and owns request/response matching, the 1 MiB response bound,
// progress events, stderr logging, and graceful (10 s) then forced shutdown.
//
// The renderer can never spawn this worker: spawn() asserts an Electron main
// process (electron.app) before touching node:child_process, and worker.ts is
// imported only from main-process code.

import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

export interface WorkerMessage {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface ProgressEvent {
  event: 'progress';
  jobId: string;
  stage: string;
  completed: number;
  total: number;
  message: string;
}

export interface ResearchWorkerOptions {
  venvPython: string;
  workerScript: string;
  onProgress?: (p: ProgressEvent) => void;
  onLog?: (message: string) => void;
  onExit?: (code: number | null, signal: string | null) => void;
  /** Injected in tests. Defaults to node:child_process.spawn. */
  spawnImpl?: typeof spawn;
  /** Injected in tests. Defaults to asserting an Electron main process. */
  assertMain?: () => void;
}

const RESPONSE_LIMIT = 1 * 1024 * 1024; // 1 MiB (docs/09 sec 9.2)
const GRACEFUL_MS = 10_000; // docs/09 sec 9.2: 10 s graceful, then terminate

export class InterruptedError extends Error {
  constructor() { super('research worker interrupted'); this.name = 'InterruptedError'; }
}

function defaultAssertMain(): void {
  let electron: unknown;
  try {
    electron = nodeRequire('electron'); // only the main process can load electron.app
  } catch {
    // not loadable in this context -> not the main process
  }
  const ea = electron as { app?: { isPackaged?: unknown } } | undefined;
  if (typeof ea?.app?.isPackaged !== 'boolean') {
    throw new Error('research-worker can only be spawned from the Electron main process');
  }
}

export class ResearchWorker {
  private proc: ChildProcess | null = null;
  private buf = '';
  private nextRequestId = 0;
  private inFlight = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private stopped = false;

  private readonly assertMain: () => void;
  private readonly spawnImpl: typeof spawn;

  constructor(private readonly opts: ResearchWorkerOptions) {
    this.assertMain = opts.assertMain ?? defaultAssertMain;
    this.spawnImpl = opts.spawnImpl ?? spawn;
  }

  /** Spawn the worker child process. Throws unless called from the main process. */
  spawn(): void {
    this.assertMain();
    if (this.proc) {
      throw new Error('research worker already running');
    }
    const { venvPython, workerScript } = this.opts;
    // stdio pipes only: no TCP/HTTP arguments are ever passed (docs/09 sec 9.2).
    this.proc = this.spawnImpl(venvPython, [workerScript], { stdio: ['pipe', 'pipe', 'pipe'] });
    const proc = this.proc!;

    proc.stdout!.on('data', (chunk: Buffer) => this.onStdoutData(chunk));
    proc.stdout!.on('end', () => this.onEof());
    proc.stderr!.on('data', (chunk: Buffer) => {
      const msg = chunk.toString('utf8').trim();
      if (msg) this.opts.onLog?.(msg);
    });
    proc.on('error', (err: Error) => {
      this.stopped = true;
      this.failAll(err);
      this.opts.onLog?.(`worker process error: ${err.message}`);
    });
    proc.on('exit', (code: number | null, signal: string | null) => {
      this.stopped = true;
      const interrupt = new InterruptedError();
      const exitError = code === 0 && !signal
        ? interrupt
        : new Error(`worker exited code=${code} signal=${signal}`);
      for (const settle of this.inFlight.values()) { settle.reject(exitError); }
      this.inFlight.clear();
      this.opts.onExit?.(code, signal);
      this.proc = null;
    });
  }

  /** Send one request and await its typed response. */
  request(command: string, payload: unknown, timeoutMs = 30_000): Promise<unknown> {
    if (this.stopped || !this.proc) {
      return Promise.reject(new Error('research worker not running'));
    }
    const id = String(++this.nextRequestId);
    if (this.inFlight.has(id)) {
      return Promise.reject(new Error(`duplicate in-flight request id ${id}`));
    }
    const line = JSON.stringify({ id, command, payload });
    try {
      this.proc!.stdin!.write(line + '\n');
    } catch (err) {
      this.inFlight.delete(id);
      return Promise.reject(err as Error);
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.inFlight.delete(id);
        reject(new Error(`worker request ${id} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      timeout.unref();
      this.inFlight.set(id, {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });
    });
  }

  /** Graceful stop: SIGTERM, wait up to gracefulMs, then force-terminate. */
  stop(gracefulMs = GRACEFUL_MS): Promise<void> {
    if (this.stopped || !this.proc) {
      return Promise.resolve();
    }
    this.stopped = true;
    const proc = this.proc;
    const interrupt = new InterruptedError();
    let resolved = false;
    const resolveOnce = () => { if (!resolved) { resolved = true; this.proc = null; } };
    proc.kill('SIGTERM');
    const hardTimer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      for (const settle of this.inFlight.values()) { settle.reject(interrupt); }
      this.inFlight.clear();
      resolveOnce();
    }, gracefulMs);
    hardTimer.unref();
    proc.once('exit', () => {
      for (const settle of this.inFlight.values()) { settle.reject(interrupt); }
      this.inFlight.clear();
      clearTimeout(hardTimer);
      resolveOnce();
    });
    return new Promise<void>((resolve) => {
      const check = () => { if (resolved || !this.proc) { resolve(); } else { setTimeout(check, 50); } };
      check();
    });
  }

  private onStdoutData(chunk: Buffer): void {
    this.buf += chunk.toString('utf8');
    let idx: number;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 1);
      if (!line.trim()) continue;
      this.handleLine(line);
    }
  }

  private onEof(): void {
    // stdout closed; the worker will exit shortly and the 'exit' handler owns
    // failing in-flight requests. If it never exits, the supervisor's stop()
    // hard timer force-terminates it.
    this.stopped = true;
    this.opts.onLog?.('worker closed stdout');
    if (this.buf.trim()) {
      this.handleLine(this.buf);
      this.buf = '';
    }
  }

  private handleLine(line: string): void {
    // Size bound: no single protocol line may exceed 1 MiB (docs/09 sec 9.2).
    if (Buffer.byteLength(line, 'utf8') > RESPONSE_LIMIT) {
      this.failAll(new Error('worker response exceeds 1 MiB bound'));
      return;
    }
    let obj: unknown;
    try { obj = JSON.parse(line); }
    catch { this.failAll(new Error('worker sent malformed JSON')); return; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      this.failAll(new Error('worker sent a non-object protocol line')); return;
    }
    const record = obj as Record<string, unknown>;
    if (record.event === 'progress') {
      this.opts.onProgress?.(record as unknown as ProgressEvent);
      return;
    }
    const id = record.id;
    if (typeof id !== 'string' || !id) {
      this.failAll(new Error('worker response missing id')); return;
    }
    const settle = this.inFlight.get(id);
    if (!settle) {
      // Mismatched / unknown id: the worker cannot be trusted; fail connection.
      this.failAll(new Error(`worker response with mismatched id ${id}`));
      return;
    }
    this.inFlight.delete(id);
    if (record.ok === true) {
      settle.resolve(record.result);
    } else {
      settle.reject(new Error(`worker error ${(record.error as { code?: string })?.code ?? 'unknown'}: ${(record.error as { message?: string })?.message ?? ''}`));
    }
  }

  private failAll(err: Error): void {
    for (const settle of this.inFlight.values()) { settle.reject(err); }
    this.inFlight.clear();
  }
}
