-- 002_research_jobs.sql
-- Persisted research job lifecycle (docs/07-phases-and-tasks.md T1.4,
-- docs/09-research-system.md sec 9.2, 9.8). Additive migration: preserves the
-- existing radar.db and all 001_init tables/rows.
--
-- Job states: queued -> running -> (paused | completed | failed | cancelled |
-- interrupted). A job may be paused/resumed any number of times. 'interrupted'
-- is written by the startup recovery hook when the app is killed while a job is
-- running (docs/09 sec 9.2: "killed app marks running job interrupted on next
-- open"). 'cancelled' is terminal via explicit user cancel.

CREATE TABLE research_jobs(
  id INTEGER PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,                    -- client idempotency key; duplicates rejected
  command TEXT NOT NULL,                           -- e.g. 'build:features', 'sim:backtest', 'train:model'
  payload_json TEXT NOT NULL,                      -- zod-validated input envelope
  config_sha256 TEXT NOT NULL,                     -- sha256 of the job input config
  status TEXT NOT NULL CHECK(status IN('queued','running','paused','cancelled','interrupted','failed','completed')),
  progress_completed INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 1,
  message TEXT,                                    -- human status / stage message
  error_code TEXT,                                 -- typed error code for failed jobs
  error_message TEXT,
  result_path TEXT,                                -- path to run artifact on completion
  created_at INTEGER NOT NULL,
  started_at INTEGER,                              -- set when claimed (running)
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,                            -- set on terminal state
  pid INTEGER,                                     -- worker process pid while running
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_research_jobs_status ON research_jobs(status, updated_at);
CREATE INDEX idx_research_jobs_created ON research_jobs(created_at DESC);
CREATE INDEX idx_research_jobs_job_id ON research_jobs(job_id);
