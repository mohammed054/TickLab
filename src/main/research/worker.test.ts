// src/main/research/worker.test.ts
//
// Acceptance tests for T1.3 (docs/07-phases-and-tasks.md): the research-worker
// supervisor covers success, malformed JSON, unknown command, mismatched ID,
// oversized output, crash, graceful stop and forced stop; the worker binds no
// TCP/HTTP socket; the renderer cannot spawn it.
//
// Runs under vitest via a direct path because vitest.include is tests/unit/**;
//
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { ResearchWorker, InterruptedError, type ResearchWorkerOptions } from './worker';

const VENV_PYTHON = '/fake/venv/python';
const WORKER_SCRIPT = '/fake/research-worker/src/main.py';

class FakeStream extends EventEmitter {
  write = (() => true) as unknown as (chunk: string) => boolean;
  end = (() => {}) as unknown as () => void;
  destroy = (() => {}) as unknown as () => void;
}

class FakeChild extends EventEmitter {
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
  readonly stdin = new FakeStream();
  readonly signals: string[] = [];
  kill = (_sig: string): boolean => { this.signals.push(_sig); return true; };
  emitExit = (code: number | null = 0, signal: string | null = null): void => {
    // Only the 'exit' event owns failing in-flight requests; stdout 'end' is
    // handled separately by onEof() and is not part of these scenarios.
    this.emit('exit', code, signal);
  };
  emitData = (text: string): void => { this.stdout.emit('data', Buffer.from(text)); };
}

function makeWorker(overrides: Partial<ResearchWorkerOptions> = {}) {
  const child = new FakeChild();
  const defaultSpawn = ((_cmd: string, _args: string[], _o: unknown) =>
    child as unknown as ChildProcess) as unknown as typeof spawn;
  const spawnImpl = overrides.spawnImpl ?? defaultSpawn;
  const worker = new ResearchWorker({
    venvPython: VENV_PYTHON,
    workerScript: WORKER_SCRIPT,
    ...overrides,
    spawnImpl,
    assertMain: overrides.assertMain ?? (() => {}), // tests are not Electron main
  });
  return { worker, child };
}

function responseLine(id: string, body: Record<string, unknown>): string {
  return JSON.stringify({ id, ...body });
}

describe('ResearchWorker supervisor', () => {
  let worker: ResearchWorker;
  let child: FakeChild;

  beforeEach(() => {
    ({ worker, child } = makeWorker());
    worker.spawn();
  });

  afterEach(async () => {
    if (!worker['stopped']) {
      try { await worker.stop(50); } catch { /* best effort */ }
    }
  });

  it('resolves a successful request/response round trip', async () => {
    const p = worker.request('ping', {});
    child.emitData(responseLine('1', { ok: true, result: { ok: true } }) + '\n');
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('surfaces a typed unknown-command error from the worker', async () => {
    const p = worker.request('bogus', {});
    child.emitData(responseLine('1', {
      ok: false,
      error: { code: 'UNKNOWN_COMMAND', message: "command 'bogus' is not allowed" },
    }) + '\n');
    await expect(p).rejects.toThrow(/UNKNOWN_COMMAND/);
  });

  it('rejects malformed JSON from the worker', async () => {
    const p = worker.request('ping', {});
    child.emitData('not json\n');
    await expect(p).rejects.toThrow(/malformed JSON/);
  });

  it('rejects a mismatched response id', async () => {
    const p = worker.request('ping', {});
    child.emitData(responseLine('999', { ok: true, result: {} }) + '\n');
    await expect(p).rejects.toThrow(/mismatched id/);
  });

  it('enforces the 1 MiB response bound on oversized output', async () => {
    const p = worker.request('ping', {});
    child.emitData('x'.repeat(1024 * 1024 + 1) + '\n');
    await expect(p).rejects.toThrow(/1 MiB/);
  });

  it('marks the job interrupted when the worker crashes (non-zero exit)', async () => {
    const p = worker.request('ping', {});
    child.emitExit(1);
    await expect(p).rejects.toThrow(/exited/);
    expect(worker['stopped']).toBe(true);
  });

  it('does not bind a TCP/HTTP socket: spawn args are python + script only', async () => {
    const calls: string[][] = [];
    const { worker: w2, child: c2 } = makeWorker({
      assertMain: () => {},
      spawnImpl: ((_cmd: string, args: string[], _o: unknown) => {
        calls.push(args);
        return c2 as unknown as ChildProcess;
      }) as unknown as typeof spawn,
    });
    w2.spawn();
    expect(calls).toEqual([[WORKER_SCRIPT]]);
    expect(calls[0]).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/--port|--listen|--http|socket/i),
    ]));
  });

  it('rejects duplicate in-flight request ids', async () => {
    const p1 = worker.request('ping', {}); // id 1 in flight
    // id 2 will be the next id; pre-register a real settle for it so the next
    // request's id collides on the in-flight map.
    const settle2 = { resolve: () => undefined, reject: () => undefined };
    (worker as unknown as { inFlight: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }> }).inFlight.set('2', settle2);
    const p2 = worker.request('ping', {});
    child.emitData(responseLine('1', { ok: true, result: {} }) + '\n');
    await expect(p1).resolves.toEqual({});
    await expect(p2).rejects.toThrow(/duplicate in-flight/);
  });

  it('emits progress events', async () => {
    const received: unknown[] = [];
    const { worker: w2, child: c2 } = makeWorker({ onProgress: (p) => received.push(p) });
    w2.spawn();
    c2.emitData(JSON.stringify({
      event: 'progress', jobId: 'j1', stage: 'hashing', completed: 1, total: 5, message: 'step 1/5',
    }) + '\n');
    expect(received).toEqual([{
      event: 'progress', jobId: 'j1', stage: 'hashing', completed: 1, total: 5, message: 'step 1/5',
    }]);
  });

  it('graceful stop sends SIGTERM then resolves when the worker exits', async () => {
    const p = worker.request('ping', {}); // pending, child silent
    // Attach the rejection handler before stopping, so the synchronous
    // rejection from the exit handler is never unhandled.
    const onInterrupted = expect(p).rejects.toBeInstanceOf(InterruptedError);
    const stopPromise = worker.stop();
    expect(child.signals).toEqual(['SIGTERM']);
    child.emitExit(0);
    await stopPromise;
    await onInterrupted;
    expect(worker['stopped']).toBe(true);
  });

  it('forced stop sends SIGKILL after the graceful window', async () => {
    const p = worker.request('ping', {}); // pending, child never exits
    const onInterrupted = expect(p).rejects.toBeInstanceOf(InterruptedError);
    const stopPromise = worker.stop(30);
    expect(child.signals).toEqual(['SIGTERM']);
    await stopPromise;
    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
    await onInterrupted;
  });

  it('renderer cannot spawn: the default main-process assertion throws', () => {
    const w3 = new ResearchWorker({ venvPython: VENV_PYTHON, workerScript: WORKER_SCRIPT });
    let threw = false;
    try { w3.spawn(); } catch { threw = true; }
    expect(threw).toBe(true);
  });
});
