// src/main/research/jobs.test.ts
//
// Acceptance tests for T1.4 (docs/07-phases-and-tasks.md): research job
// lifecycle — queued/running/paused/cancelled/interrupted/failed/completed
// states, timestamps, config hash, progress, result path, typed error,
// duplicate job-id rejection, and killed-app recovery (running -> interrupted).
//
// Runs under `npm test` via the unified vitest include (src/main/**/*.test.ts)
// since commit [T2.1-RESOLUTION]; previously run by direct path.
//
import { describe, it, expect, afterEach } from 'vitest';
import { clock } from '../clock';
import { openDb } from '../db/open';
import { migrate } from '../db/migrate';
import { JobService } from './jobs';

function setup() {
  const db = openDb(':memory:');
  migrate(db);
  clock.freeze(1_000_000_000_000);
  return { db, service: new JobService(db, clock.now) };
}

describe('JobService', () => {
  afterEach(() => clock.unfreeze());

  it('creates a queued job with config hash and timestamps', () => {
    const { service } = setup();
    const r = service.createJob({ jobId: 'j1', command: 'sim:backtest', payload: { pool: 'A', horizon: 6 } });
    expect(r.ok).toBe(true);
    const job = service.getJob('j1')!;
    expect(job.status).toBe('queued');
    expect(job.command).toBe('sim:backtest');
    expect(job.payload).toEqual({ pool: 'A', horizon: 6 });
    expect(typeof job.configSha256).toBe('string');
    expect(job.configSha256.length).toBe(64);
    expect(job.createdAt).toBe(1_000_000_000_000);
    expect(job.startedAt).toBeNull();
    expect(job.progress).toEqual({ completed: 0, total: 1 });
    expect(job.resultPath).toBeNull();
    expect(job.error).toBeNull();
    expect((r as { ok: true; value: { id: number; jobId: string } }).value).toEqual({ id: job.id, jobId: 'j1' });
  });

  it('rejects duplicate job ids', () => {
    const { service } = setup();
    service.createJob({ jobId: 'dup', command: 'ping', payload: {} });
    const r = service.createJob({ jobId: 'dup', command: 'ping', payload: {} });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: { code: string; message: string } }).error.code).toBe('VALIDATION');
    expect(service.getJob('dup')!.attempts).toBe(0);
  });

  it('lists jobs newest first', () => {
    const { service } = setup();
    service.createJob({ jobId: 'a', command: 'c1', payload: {} });
    clock.advance(1000);
    service.createJob({ jobId: 'b', command: 'c2', payload: {} });
    const list = service.listJobs();
    expect(list.map((j) => j.jobId)).toEqual(['b', 'a']);
  });

  it('claims a queued job to running with pid and started_at', () => {
    const { service } = setup();
    service.createJob({ jobId: 'c', command: 'c1', payload: {} });
    service.claimJob('c', 42);
    const job = service.getJob('c')!;
    expect(job.status).toBe('running');
    expect(job.pid).toBe(42);
    expect(job.startedAt).toBe(1_000_000_000_000);
  });

  it('rejects claiming an already-running job', () => {
    const { service } = setup();
    service.createJob({ jobId: 'c', command: 'c1', payload: {} });
    service.claimJob('c', 42);
    expect(() => service.claimJob('c', 43)).toThrow(/illegal transition/);
  });

  it('updates progress', () => {
    const { service } = setup();
    service.createJob({ jobId: 'p', command: 'c1', payload: {} });
    service.claimJob('p', 1);
    service.updateProgress('p', 3, 10, 'hashing block 3');
    const job = service.getJob('p')!;
    expect(job.status).toBe('running');
    expect(job.progress).toEqual({ completed: 3, total: 10 });
    expect(job.message).toBe('hashing block 3');
  });

  it('completes a running job with a result path', () => {
    const { service } = setup();
    service.createJob({ jobId: 'd', command: 'c1', payload: {} });
    service.claimJob('d', 1);
    service.completeJob('d', '/research/runs/run-1');
    const job = service.getJob('d')!;
    expect(job.status).toBe('completed');
    expect(job.resultPath).toBe('/research/runs/run-1');
    expect(job.completedAt).toBe(1_000_000_000_000);
  });

  it('fails a job with a typed error', () => {
    const { service } = setup();
    service.createJob({ jobId: 'f', command: 'c1', payload: {} });
    service.claimJob('f', 1);
    service.failJob('f', 'WORKER_CRASH', 'segmentation fault');
    const job = service.getJob('f')!;
    expect(job.status).toBe('failed');
    expect(job.error).toEqual({ code: 'WORKER_CRASH', message: 'segmentation fault' });
  });

  it('cancels a queued job', () => {
    const { service } = setup();
    service.createJob({ jobId: 'x', command: 'c1', payload: {} });
    service.cancelJob('x');
    expect(service.getJob('x')!.status).toBe('cancelled');
  });

  it('pauses and resumes a running job', () => {
    const { service } = setup();
    service.createJob({ jobId: 's', command: 'c1', payload: {} });
    service.claimJob('s', 1);
    service.pauseJob('s');
    expect(service.getJob('s')!.status).toBe('paused');
    service.resumeJob('s');
    expect(service.getJob('s')!.status).toBe('running');
  });

  it('interrupts a running job', () => {
    const { service } = setup();
    service.createJob({ jobId: 'i', command: 'c1', payload: {} });
    service.claimJob('i', 1);
    service.interruptJob('i');
    expect(service.getJob('i')!.status).toBe('interrupted');
  });

  it('rejects illegal transitions', () => {
    const { service } = setup();
    service.createJob({ jobId: 't', command: 'c1', payload: {} });
    service.claimJob('t', 1);
    service.completeJob('t', '/r');
    expect(() => service.resumeJob('t')).toThrow(/illegal transition/);
    expect(() => service.failJob('t', 'E', 'm')).toThrow(/illegal transition/);
    expect(service.getJob('t')!.status).toBe('completed');
  });

  it('marks running jobs interrupted on startup recovery', () => {
    const { service } = setup();
    service.createJob({ jobId: 'k1', command: 'c1', payload: {} });
    service.createJob({ jobId: 'k2', command: 'c2', payload: {} });
    service.claimJob('k1', 7);
    service.claimJob('k2', 2);
    service.completeJob('k2', '/r');
    const changed = service.markRunningJobsInterrupted();
    expect(changed).toBe(1);
    expect(service.getJob('k1')!.status).toBe('interrupted');
    expect(service.getJob('k2')!.status).toBe('completed');
  });
});
