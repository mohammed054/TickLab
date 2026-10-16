// research:jobs:* handlers (docs/07-phases-and-tasks.md T1.4, docs/09-research-system.md sec 9.2, 9.8).
// All job control goes through zod-validated, allowlisted IPC channels declared
// in src/shared/ipc.ts; the renderer can only invoke these channels.
import type { Handlers, Services } from './types';
import { ok, err } from '../../../shared/types';

type Keys = 'research:jobs:list' | 'research:jobs:get' | 'research:jobs:create' | 'research:jobs:claim'
  | 'research:jobs:progress' | 'research:jobs:complete' | 'research:jobs:fail' | 'research:jobs:cancel'
  | 'research:jobs:pause' | 'research:jobs:resume' | 'research:jobs:interrupt';

export function researchJobsHandlers(s: Services): Pick<Handlers, Keys> {
  const jobs = s.jobs;
  return {
    'research:jobs:list': (r) => ok(jobs.listJobs(r.limit)),
    'research:jobs:get': (r) => ok(jobs.getJob(r.jobId)),
    'research:jobs:create': (r) => jobs.createJob({ jobId: r.jobId, command: r.command, payload: r.payload }),
    'research:jobs:claim': (r) => {
      try { jobs.claimJob(r.jobId, r.pid); return ok(undefined); }
      catch (e) { return err('VALIDATION', e instanceof Error ? e.message : 'could not claim job'); }
    },
    'research:jobs:progress': (r) => {
      try { jobs.updateProgress(r.jobId, r.completed, r.total, r.message); return ok(undefined); }
      catch (e) { return err('VALIDATION', e instanceof Error ? e.message : 'could not update progress'); }
    },
    'research:jobs:complete': (r) => {
      try { jobs.completeJob(r.jobId, r.resultPath); return ok(undefined); }
      catch (e) { return err('VALIDATION', e instanceof Error ? e.message : 'could not complete job'); }
    },
    'research:jobs:fail': (r) => {
      try { jobs.failJob(r.jobId, r.errorCode, r.errorMessage); return ok(undefined); }
      catch (e) { return err('VALIDATION', e instanceof Error ? e.message : 'could not fail job'); }
    },
    'research:jobs:cancel': (r) => {
      try { jobs.cancelJob(r.jobId); return ok(undefined); }
      catch (e) { return err('VALIDATION', e instanceof Error ? e.message : 'could not cancel job'); }
    },
    'research:jobs:pause': (r) => {
      try { jobs.pauseJob(r.jobId); return ok(undefined); }
      catch (e) { return err('VALIDATION', e instanceof Error ? e.message : 'could not pause job'); }
    },
    'research:jobs:resume': (r) => {
      try { jobs.resumeJob(r.jobId); return ok(undefined); }
      catch (e) { return err('VALIDATION', e instanceof Error ? e.message : 'could not resume job'); }
    },
    'research:jobs:interrupt': (r) => {
      try { jobs.interruptJob(r.jobId); return ok(undefined); }
      catch (e) { return err('VALIDATION', e instanceof Error ? e.message : 'could not interrupt job'); }
    },
  };
}
