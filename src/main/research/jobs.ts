// src/main/research/jobs.ts
//
// Persisted research job lifecycle (docs/07-phases-and-tasks.md T1.4,
// docs/09-research-system.md sec 9.2, 9.8). Manages research_jobs row state:
// queued -> running -> (paused | completed | failed | cancelled | interrupted),
// with timestamps, config hash, progress, result path and typed error.
//
// The worker process itself is owned by src/main/research/worker.ts (T1.3);
// this service is the durable record the supervisor and IPC handlers read and
// write. Jobs are controlled *only* through the zod-validated, allowlisted IPC
// channels in src/shared/ipc.ts (research:jobs:*), never directly by the
// renderer.
//
// 'interrupted' is written by markRunningJobsInterrupted() at startup so a
// job left running when the app was killed is recovered on next open
// (docs/09 sec 9.2).
import type { Db } from '../db/open';
import { clock } from '../clock';
import { createHash } from 'node:crypto';
import type { CreateJobInput, Job, JobStatus } from '../../shared/types';
import { ok, err } from '../../shared/types';

const ALLOWED: Record<JobStatus, JobStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['paused', 'completed', 'failed', 'interrupted'],
  paused: ['running', 'cancelled', 'failed'],
  cancelled: [],
  interrupted: [],
  failed: [],
  completed: [],
};

interface JobRow {
  id: number; job_id: string; command: string; payload_json: string; config_sha256: string;
  status: JobStatus; progress_completed: number; progress_total: number; message: string | null;
  error_code: string | null; error_message: string | null; result_path: string | null;
  created_at: number; started_at: number | null; updated_at: number; completed_at: number | null;
  pid: number | null; attempts: number;
}

const map = (r: JobRow): Job => ({
  id: r.id, jobId: r.job_id, command: r.command, payload: JSON.parse(r.payload_json),
  configSha256: r.config_sha256, status: r.status,
  progress: { completed: r.progress_completed, total: r.progress_total }, message: r.message,
  error: r.error_code ? { code: r.error_code, message: r.error_message ?? '' } : null,
  resultPath: r.result_path, createdAt: r.created_at, startedAt: r.started_at,
  updatedAt: r.updated_at, completedAt: r.completed_at, pid: r.pid, attempts: r.attempts,
});

export class JobService {
  constructor(private db: Db, private now: () => number = clock.now) {}

  createJob(input: CreateJobInput):
    | { ok: true; value: { id: number; jobId: string } }
    | { ok: false; error: { code: string; message: string } } {
    const payloadJson = JSON.stringify(input.payload);
    const configSha256 = createHash('sha256').update(payloadJson).digest('hex');
    const now = this.now();
    try {
      const info = this.db.prepare(
        `INSERT INTO research_jobs(job_id,command,payload_json,config_sha256,status,
          progress_completed,progress_total,message,error_code,error_message,result_path,
          created_at,started_at,updated_at,completed_at,pid,attempts)
        VALUES(?,?,?,?,'queued',0,1,NULL,NULL,NULL,NULL,?,NULL,?,NULL,NULL,0)`
      ).run(input.jobId, input.command, payloadJson, configSha256, now, now);
      return ok({ id: Number(info.lastInsertRowid), jobId: input.jobId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('UNIQUE constraint failed: research_jobs.job_id')) {
        return err('VALIDATION', `job id ${input.jobId} already exists`);
      }
      return err('DB_ERROR', msg);
    }
  }

  getJob(jobId: string): Job | null {
    const r = this.db.prepare('SELECT * FROM research_jobs WHERE job_id=?').get(jobId) as JobRow | undefined;
    return r ? map(r) : null;
  }

  listJobs(limit = 100): Job[] {
    const rows = this.db.prepare('SELECT * FROM research_jobs ORDER BY created_at DESC, id DESC LIMIT ?').all(limit) as JobRow[];
    return rows.map(map);
  }

  private setStatus(
    jobId: string, status: JobStatus,
    fields: {
      started_at?: number; completed_at?: number; pid?: number | null;
      message?: string | null; error_code?: string | null; error_message?: string | null;
      result_path?: string | null; progress_completed?: number; progress_total?: number;
      attempts?: number;
    } = {},
  ): void {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`job ${jobId} not found`);
    if (!ALLOWED[job.status].includes(status)) {
      throw new Error(`illegal transition ${job.status} -> ${status}`);
    }
    const sets: string[] = ['status=?', 'updated_at=?'];
    const params: unknown[] = [status, this.now()];
    const add = (key: string, value: unknown) => { sets.push(`${key}=?`); params.push(value); };
    if (fields.started_at !== undefined) add('started_at', fields.started_at);
    if (fields.completed_at !== undefined) add('completed_at', fields.completed_at);
    if (fields.pid !== undefined) add('pid', fields.pid);
    if (fields.message !== undefined) add('message', fields.message);
    if (fields.error_code !== undefined) add('error_code', fields.error_code);
    if (fields.error_message !== undefined) add('error_message', fields.error_message);
    if (fields.result_path !== undefined) add('result_path', fields.result_path);
    if (fields.progress_completed !== undefined) add('progress_completed', fields.progress_completed);
    if (fields.progress_total !== undefined) add('progress_total', fields.progress_total);
    if (fields.attempts !== undefined) add('attempts', fields.attempts);
    params.push(jobId);
    this.db.prepare(`UPDATE research_jobs SET ${sets.join(', ')} WHERE job_id=?`).run(...params);
  }

  claimJob(jobId: string, pid: number): void { this.setStatus(jobId, 'running', { started_at: this.now(), pid }); }
  updateProgress(jobId: string, completed: number, total: number, message?: string): void {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`job ${jobId} not found`);
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(job.status)) {
      throw new Error(`cannot update progress on ${job.status} job`);
    }
    this.db.prepare(
      'UPDATE research_jobs SET progress_completed=?, progress_total=?, message=?, updated_at=? WHERE job_id=?'
    ).run(completed, total, message ?? null, this.now(), jobId);
  }
  completeJob(jobId: string, resultPath: string): void {
    this.setStatus(jobId, 'completed', { completed_at: this.now(), result_path: resultPath });
  }
  failJob(jobId: string, errorCode: string, errorMessage: string): void {
    this.setStatus(jobId, 'failed', { completed_at: this.now(), error_code: errorCode, error_message: errorMessage });
  }
  cancelJob(jobId: string): void { this.setStatus(jobId, 'cancelled', { completed_at: this.now() }); }
  pauseJob(jobId: string): void { this.setStatus(jobId, 'paused'); }
  resumeJob(jobId: string): void { this.setStatus(jobId, 'running'); }
  interruptJob(jobId: string): void { this.setStatus(jobId, 'interrupted', { completed_at: this.now() }); }

  /** Startup recovery: jobs left running when the app was killed become interrupted. */
  markRunningJobsInterrupted(): number {
    const info = this.db.prepare(
      "UPDATE research_jobs SET status='interrupted', completed_at=?, updated_at=? WHERE status='running'"
    ).run(this.now(), this.now());
    return info.changes;
  }
}
