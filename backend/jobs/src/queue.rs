//! Job lifecycle store and worker pool (`docs/05` §5.6, `docs/16` Block 2.8 Task B).
//!
//! - Jobs are submitted as [`JobKind`] records with status `queued`
//!   (`docs/01` §1.5: submit → job ID immediately).
//! - Each job spawns a worker task that first acquires a semaphore permit
//!   sized to [`resolve_worker_count`] (default `nproc - 1`, `docs/05` §5.6).
//!   Status flips to `running` only after a permit is held, so `queued` vs
//!   `running` in `GET /api/v1/jobs` reflects real worker occupancy for
//!   `docs/08` §8.15 — not a simulated queue display.
//! - Latest progress is held in a [`watch`] channel per job: re-subscribing to
//!   `job.{id}.progress` immediately yields the current snapshot (`docs/08`
//!   §8.14: re-opening the tab re-subscribes to the same topic).
//! - Persistence is in-memory. The production Postgres-backed job table
//!   (`docs/03` §3.1) is a later step; the REST/WS contract here does not
//!   change when it lands.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::{watch, Semaphore};

use crate::types::{
    ApiError, BacktestProgress, BacktestRequest, JobKind, JobResult, JobStatus, JobSummary,
};

/// Resolve the worker-pool size.
///
/// `override_value` is the raw `TICKLAB_WORKERS` env value (if set);
/// `parallelism` is `std::thread::available_parallelism()`. Default is
/// `max(1, parallelism - 1)` to leave headroom for the Gateway/OS
/// (`docs/05` §5.6). Unparseable or out-of-range overrides fall back to the
/// default; the pool is always at least 1 (a zero pool would deadlock every
/// submission).
pub fn resolve_worker_count(override_value: Option<&str>, parallelism: usize) -> usize {
    let default = parallelism.saturating_sub(1).max(1);
    match override_value {
        None => default,
        Some(raw) => match raw.trim().parse::<usize>() {
            Ok(n) if n >= 1 => n,
            _ => default,
        },
    }
}

/// One job's mutable record. Cloned as `Arc` for worker tasks and readers;
/// interior fields use channels/atomics so the store lock is never held
/// across an `.await`.
pub struct JobRecord {
    /// `job-{n}` id, also the `BacktestProgress.job_id` (`docs/15` §15.5).
    pub job_id: String,
    pub kind: JobKind,
    /// Base request (for parents: the shared base the cells were derived from).
    pub request: BacktestRequest,
    /// Child job ids for sweep/walkforward/robustness parents.
    pub children: Vec<String>,
    /// Latest progress snapshot; receivers get the current value on subscribe.
    pub progress_tx: watch::Sender<BacktestProgress>,
    /// Set by cancel; the worker loop checks it between steps.
    pub cancel_flag: Arc<AtomicBool>,
    /// Final result once `status == complete` (see [`crate::types::JobResult`]).
    pub result: Mutex<Option<JobResult>>,
}

impl JobRecord {
    fn initial_progress(job_id: &str, total_events: u64, start_ns: i64) -> BacktestProgress {
        BacktestProgress {
            job_id: job_id.to_string(),
            events_processed: 0,
            total_events,
            events_per_sec: 0.0,
            orders_submitted: 0,
            fills: 0,
            simulated_time_ns: start_ns,
            wall_clock_elapsed_ms: 0,
            status: JobStatus::Queued,
        }
    }
}

struct Inner {
    jobs: HashMap<String, Arc<JobRecord>>,
    /// Submission order (ascending ids) for most-recent-first listing.
    order: Vec<String>,
    next_id: u64,
}

/// Job lifecycle store + worker pool.
pub struct JobStore {
    inner: Mutex<Inner>,
    worker_permits: Arc<Semaphore>,
    worker_count: usize,
}

impl JobStore {
    /// Build a store; pool size from `TICKLAB_WORKERS` or `nproc - 1`.
    pub fn new() -> Arc<Self> {
        let parallelism = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(2);
        let override_value = std::env::var("TICKLAB_WORKERS").ok();
        let worker_count = resolve_worker_count(override_value.as_deref(), parallelism);
        if override_value.is_some()
            && resolve_worker_count(override_value.as_deref(), parallelism) != worker_count
        {
            tracing::warn!("ignoring invalid TICKLAB_WORKERS value, using {worker_count}");
        }
        tracing::info!(
            worker_count,
            parallelism,
            "job worker pool sized (docs/05 §5.6)"
        );
        Arc::new(Self {
            inner: Mutex::new(Inner {
                jobs: HashMap::new(),
                order: Vec::new(),
                next_id: 0,
            }),
            worker_permits: Arc::new(Semaphore::new(worker_count)),
            worker_count,
        })
    }

    /// Configured pool size (surfaced on `/healthz` for `docs/08` §8.15).
    pub fn worker_count(&self) -> usize {
        self.worker_count
    }

    /// Currently running jobs (permits held).
    pub fn running_count(&self) -> usize {
        self.worker_count
            .saturating_sub(self.worker_permits.available_permits())
    }

    fn lock_inner(&self) -> Result<std::sync::MutexGuard<'_, Inner>, ApiError> {
        self.inner.lock().map_err(|_| {
            ApiError::new(
                "STORE_UNAVAILABLE",
                "job store lock poisoned".to_string(),
                Some("Retry the request; restart the jobs service if this persists."),
            )
        })
    }

    fn alloc_id(&self, inner: &mut Inner) -> String {
        inner.next_id += 1;
        format!("job-{}", inner.next_id)
    }

    fn insert(
        self: &Arc<Self>,
        kind: JobKind,
        request: BacktestRequest,
        children: Vec<String>,
        total_events: u64,
    ) -> Arc<JobRecord> {
        let mut inner = self.lock_inner().expect("store lock held on insert");
        let job_id = self.alloc_id(&mut inner);
        let (progress_tx, _) = watch::channel(JobRecord::initial_progress(
            &job_id,
            total_events,
            request.date_range.start,
        ));
        let record = Arc::new(JobRecord {
            job_id: job_id.clone(),
            kind,
            request,
            children,
            progress_tx,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            result: Mutex::new(None),
        });
        inner.order.push(job_id.clone());
        inner.jobs.insert(job_id, Arc::clone(&record));
        record
    }

    /// Submit a backtest job; returns its id immediately (`docs/01` §1.5).
    pub fn submit_backtest(
        self: &Arc<Self>,
        request: BacktestRequest,
        total_events: u64,
    ) -> Arc<JobRecord> {
        let record = self.insert(JobKind::Backtest, request, Vec::new(), total_events);
        let store = Arc::clone(self);
        let worker = Arc::clone(&record);
        tokio::spawn(async move {
            crate::runner::run_backtest(store, worker).await;
        });
        record
    }

    /// Submit a parent job (sweep/walkforward/robustness) with pre-registered
    /// children; the aggregator task is spawned by the caller module.
    pub fn insert_parent(
        self: &Arc<Self>,
        kind: JobKind,
        request: BacktestRequest,
        children: Vec<String>,
        total_events: u64,
    ) -> Arc<JobRecord> {
        self.insert(kind, request, children, total_events)
    }

    pub fn get(&self, job_id: &str) -> Result<Arc<JobRecord>, ApiError> {
        self.lock_inner()?
            .jobs
            .get(job_id)
            .cloned()
            .ok_or_else(|| ApiError::job_not_found(job_id))
    }

    /// Latest progress snapshot (REST poll fallback, `docs/15` §15.2).
    pub fn progress(&self, job_id: &str) -> Result<BacktestProgress, ApiError> {
        let record = self.get(job_id)?;
        let snapshot = record.progress_tx.borrow().clone();
        Ok(snapshot)
    }

    /// Subscribe to progress updates; yields the current snapshot first.
    pub fn subscribe(&self, job_id: &str) -> Result<watch::Receiver<BacktestProgress>, ApiError> {
        Ok(self.get(job_id)?.progress_tx.subscribe())
    }

    /// Request cancellation (idempotent). Unknown ids are 404.
    pub fn cancel(&self, job_id: &str) -> Result<BacktestProgress, ApiError> {
        let record = self.get(job_id)?;
        record.cancel_flag.store(true, Ordering::SeqCst);
        let snapshot = record.progress_tx.borrow().clone();
        Ok(snapshot)
    }

    /// Final result. Non-complete jobs get a typed 409, never fabricated
    /// numbers (`AGENTS.md` §5.3).
    pub fn result(&self, job_id: &str) -> Result<JobResult, ApiError> {
        let record = self.get(job_id)?;
        let progress = record.progress_tx.borrow();
        if progress.status != JobStatus::Complete {
            if progress.status == JobStatus::Cancelled {
                return Err(ApiError::new(
                    "RESULT_UNAVAILABLE",
                    format!("job '{job_id}' was cancelled; no result was produced"),
                    Some("Resubmit the job to get a result."),
                ));
            }
            return Err(ApiError::result_pending(job_id));
        }
        let result = record
            .result
            .lock()
            .map_err(|_| {
                ApiError::new(
                    "STORE_UNAVAILABLE",
                    "result lock poisoned".to_string(),
                    Some("Retry the request; restart the jobs service if this persists."),
                )
            })?
            .clone();
        result.ok_or_else(|| ApiError::result_pending(job_id))
    }

    /// Most-recent-first summaries, backing `docs/08` §8.15 from real pool
    /// state. `limit` is clamped to `[1, 200]`.
    pub fn list(&self, status_filter: Option<JobStatus>, limit: usize) -> Vec<JobSummary> {
        let limit = limit.clamp(1, 200);
        let inner = match self.lock_inner() {
            Ok(guard) => guard,
            Err(_) => return Vec::new(),
        };
        inner
            .order
            .iter()
            .rev()
            .filter_map(|id| inner.jobs.get(id))
            .map(|record| {
                let p = record.progress_tx.borrow();
                JobSummary {
                    job_id: record.job_id.clone(),
                    kind: record.kind,
                    status: p.status,
                    events_processed: p.events_processed,
                    total_events: p.total_events,
                    strategy_id: record.request.strategy_ref.id.clone(),
                    dataset_id: record.request.dataset_id.clone(),
                }
            })
            .filter(|s| status_filter.map(|f| s.status == f).unwrap_or(true))
            .take(limit)
            .collect()
    }

    /// Publish a progress snapshot (workers only).
    ///
    /// Uses `send_replace` (not `send`): `send` discards the value when no
    /// receiver is currently subscribed, but the REST poll fallback
    /// (`GET /api/v1/jobs/{id}`) and late WS re-subscribes (`docs/08` §8.14)
    /// must always observe the latest snapshot.
    pub fn publish(&self, job_id: &str, progress: BacktestProgress) {
        if let Ok(record) = self.get(job_id) {
            record.progress_tx.send_replace(progress);
        }
    }

    /// Acquire a worker permit. Queued jobs wait here; status becomes
    /// `running` only once a permit is held (real occupancy, `docs/08` §8.15).
    pub async fn acquire_worker(&self) -> tokio::sync::OwnedSemaphorePermit {
        self.worker_permits
            .clone()
            .acquire_owned()
            .await
            .expect("worker semaphore never closes")
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::types::{
        DateRange, ExecutionModelConfig, LatencyModelKind, RiskLimitsConfig, StrategyRef,
    };
    use std::collections::BTreeMap;

    pub fn fixture_request() -> BacktestRequest {
        BacktestRequest {
            strategy_ref: StrategyRef {
                id: "strat-fixture".to_string(),
                version: "0.1.0".to_string(),
                code_hash: "deadbeef".to_string(),
            },
            parameters: BTreeMap::new(),
            dataset_id: "binance/usdm/BTCUSDT/2024-01-01".to_string(),
            date_range: DateRange {
                start: 1_704_067_200_000_000_000,
                end: 1_704_153_600_000_000_000,
            },
            initial_capital: 100_000.0,
            execution_model: ExecutionModelConfig {
                maker_fee_pct: 0.02,
                taker_fee_pct: 0.05,
                tick_size: 0.1,
                lot_size: 0.001,
                latency_model: LatencyModelKind::Fixed,
                latency_data_file: None,
                queue_model_preset: "probabilistic".to_string(),
                allow_partial_fills: true,
                order_types_allowed: vec![],
            },
            risk_limits: RiskLimitsConfig {
                max_position: 1.0,
                max_order_size: 0.5,
                max_daily_loss: 1_000.0,
                max_drawdown_pct: 5.0,
                max_open_orders: 10,
                max_order_rate_per_sec: 5.0,
                max_notional_exposure: 50_000.0,
                emergency_stop_enabled: true,
            },
            random_seed: Some(42),
            iterations: 1,
        }
    }

    #[test]
    fn worker_pool_defaults_to_nproc_minus_one() {
        // docs/05 §5.6: default = nproc - 1, always >= 1.
        assert_eq!(resolve_worker_count(None, 8), 7);
        assert_eq!(resolve_worker_count(None, 2), 1);
        assert_eq!(resolve_worker_count(None, 1), 1);
        assert_eq!(resolve_worker_count(Some("4"), 8), 4);
        assert_eq!(resolve_worker_count(Some("0"), 8), 7);
        assert_eq!(resolve_worker_count(Some("banana"), 8), 7);
        assert_eq!(resolve_worker_count(Some(" 3 "), 8), 3);
    }

    #[test]
    fn unknown_job_is_not_found() {
        let store = JobStore::new();
        let err = store.progress("job-nope").expect_err("unknown id");
        assert_eq!(err.code, "JOB_NOT_FOUND");
        assert!(
            err.action.is_some(),
            "errors must be actionable (docs/14 §14.9)"
        );
    }

    #[tokio::test]
    async fn submit_and_cancel_lifecycle() {
        let store = JobStore::new();
        let record = store.submit_backtest(fixture_request(), 40);
        assert_eq!(record.progress_tx.borrow().status, JobStatus::Queued);

        let after_cancel = store.cancel(&record.job_id).expect("cancel known job");
        assert!(!after_cancel.status.is_terminal() || after_cancel.status == JobStatus::Cancelled);

        // Second cancel is idempotent.
        store.cancel(&record.job_id).expect("cancel is idempotent");

        // Unknown cancel is 404.
        assert_eq!(
            store.cancel("job-nope").expect_err("unknown").code,
            "JOB_NOT_FOUND"
        );
    }
}
