//! Job execution: worker-pool runners and parent aggregation.
//!
//! A single backtest runs as a deterministic, chunked pipeline stage:
//! validate (at submit) → acquire worker → stream `BacktestProgress`
//! snapshots → terminal status + result record. Progress numbers are
//! runner-stage pipeline telemetry (`docs/15` §15.5 field set, rendered by
//! `docs/08` §8.14); `ordersSubmitted`/`fills` stay 0 because order lifecycle
//! observation arrives with Block 2.5's extended event stream, and headline
//! metrics stay pending for Block 2.4 — nothing financial is fabricated
//! (`AGENTS.md` §5.3, §5.7). The vendor execution itself plugs in behind this
//! same lifecycle once `engine/vendor/hftbacktest` lands (Block 2.2 `TODO`).

use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Instant;

use tokio::time::{sleep, Duration};

use crate::queue::{JobRecord, JobStore};
use crate::types::{BacktestProgress, JobResult, JobStatus, MetricsPending};

/// Runner-stage pacing steps per iteration. The total work for a job is
/// `iterations × STEPS_PER_ITERATION`, fixed at submit, so progress is a real
/// fraction of work done by this stage — not a timer estimate.
pub const STEPS_PER_ITERATION: u64 = 20;

/// Yield between steps so progress streams while running and cancellation is
/// observed promptly. Keeps fixture-scale jobs in the hundreds of
/// milliseconds; production-scale pacing comes from real engine throughput.
const STEP_DELAY: Duration = Duration::from_millis(2);

/// How often a parent re-aggregates its children's progress.
const AGGREGATE_INTERVAL: Duration = Duration::from_millis(25);

/// Deterministic total work units for a request (fixed at submit).
pub fn total_events_for_iterations(iterations: u32) -> u64 {
    u64::from(iterations) * STEPS_PER_ITERATION
}

/// Interpolated simulated clock across the request range (`docs/15` §15.1 ns
/// ints). i128 arithmetic: `processed × span` can exceed i64 for large jobs.
fn simulated_time_ns(start_ns: i64, end_ns: i64, processed: u64, total: u64) -> i64 {
    if total == 0 {
        return start_ns;
    }
    let span = (end_ns as i128 - start_ns as i128).max(0);
    let t = start_ns as i128 + span * processed as i128 / total as i128;
    t.clamp(i64::MIN as i128, i64::MAX as i128) as i64
}

fn snapshot(
    record: &JobRecord,
    status: JobStatus,
    processed: u64,
    total: u64,
    elapsed_ms: u64,
) -> BacktestProgress {
    let events_per_sec = if elapsed_ms == 0 {
        0.0
    } else {
        processed as f64 * 1000.0 / elapsed_ms as f64
    };
    BacktestProgress {
        job_id: record.job_id.clone(),
        events_processed: processed,
        total_events: total,
        events_per_sec,
        // Engine-owned counters until Block 2.5 wires the extended event
        // stream (`docs/05` §5.5): honestly zero, never synthesized.
        orders_submitted: 0,
        fills: 0,
        simulated_time_ns: simulated_time_ns(
            record.request.date_range.start,
            record.request.date_range.end,
            processed,
            total,
        ),
        wall_clock_elapsed_ms: elapsed_ms,
        status,
    }
}

fn is_cancelled(record: &JobRecord) -> bool {
    record.cancel_flag.load(Ordering::SeqCst)
}

fn finish_complete(store: &JobStore, record: &JobRecord, total: u64, elapsed_ms: u64) {
    let progress = snapshot(record, JobStatus::Complete, total, total, elapsed_ms);
    store.publish(&record.job_id, progress);
    let result = JobResult {
        job_id: record.job_id.clone(),
        experiment_id: format!("exp-{}", record.job_id),
        engine_version: None,
        headline: None,
        recorder_series_ref: None,
        fine_grained_events_ref: None,
        metrics_pending: MetricsPending::engine_and_metrics(),
    };
    if let Ok(mut guard) = record.result.lock() {
        *guard = Some(result);
    }
}

fn finish_cancelled(
    store: &JobStore,
    record: &JobRecord,
    processed: u64,
    total: u64,
    elapsed_ms: u64,
) {
    store.publish(
        &record.job_id,
        snapshot(record, JobStatus::Cancelled, processed, total, elapsed_ms),
    );
}

/// Execute one backtest job on a worker permit.
pub async fn run_backtest(store: Arc<JobStore>, record: Arc<JobRecord>) {
    // Queued until a permit is held: `running` == real occupancy (`docs/08` §8.15).
    let _permit = store.acquire_worker().await;
    let total = total_events_for_iterations(record.request.iterations);
    let started = Instant::now();

    if is_cancelled(&record) {
        finish_cancelled(&store, &record, 0, total, 0);
        return;
    }
    store.publish(
        &record.job_id,
        snapshot(&record, JobStatus::Running, 0, total, 0),
    );

    for step in 1..=total {
        if is_cancelled(&record) {
            finish_cancelled(
                &store,
                &record,
                step - 1,
                total,
                started.elapsed().as_millis() as u64,
            );
            return;
        }
        sleep(STEP_DELAY).await;
        store.publish(
            &record.job_id,
            snapshot(
                &record,
                JobStatus::Running,
                step,
                total,
                started.elapsed().as_millis() as u64,
            ),
        );
    }

    finish_complete(&store, &record, total, started.elapsed().as_millis() as u64);
}

/// Supervise sweep/walkforward/robustness children: aggregate progress as the
/// mean of completions, propagate parent cancellation, and settle the parent
/// when every child is terminal. The supervisor holds no worker permit —
/// permits belong to the children doing the work (`docs/05` §5.6).
pub async fn run_parent_aggregate(store: Arc<JobStore>, parent: Arc<JobRecord>) {
    let started = Instant::now();
    let total: u64 = {
        let mut sum = 0u64;
        for child_id in &parent.children {
            if let Ok(p) = store.progress(child_id) {
                sum = sum.saturating_add(p.total_events);
            }
        }
        sum
    };

    if is_cancelled(&parent) {
        cancel_children(&store, &parent);
        finish_cancelled(&store, &parent, 0, total, 0);
        return;
    }
    store.publish(
        &parent.job_id,
        snapshot(&parent, JobStatus::Running, 0, total, 0),
    );

    loop {
        if is_cancelled(&parent) {
            cancel_children(&store, &parent);
        }
        let mut processed = 0u64;
        let mut complete = 0usize;
        let mut failed = 0usize;
        let mut cancelled = 0usize;
        for child_id in &parent.children {
            match store.progress(child_id) {
                Ok(p) => {
                    processed = processed.saturating_add(p.events_processed);
                    match p.status {
                        JobStatus::Complete => complete += 1,
                        JobStatus::Failed => failed += 1,
                        JobStatus::Cancelled => cancelled += 1,
                        _ => {}
                    }
                }
                Err(_) => failed += 1,
            }
        }
        let elapsed_ms = started.elapsed().as_millis() as u64;
        if complete + failed + cancelled == parent.children.len() {
            let status = if failed > 0 {
                JobStatus::Failed
            } else if cancelled > 0 || is_cancelled(&parent) {
                JobStatus::Cancelled
            } else {
                JobStatus::Complete
            };
            if status == JobStatus::Complete {
                finish_complete(&store, &parent, total, elapsed_ms);
            } else {
                finish_cancelled(&store, &parent, processed.min(total), total, elapsed_ms);
            }
            return;
        }
        store.publish(
            &parent.job_id,
            snapshot(
                &parent,
                JobStatus::Running,
                processed.min(total),
                total,
                elapsed_ms,
            ),
        );
        sleep(AGGREGATE_INTERVAL).await;
    }
}

fn cancel_children(store: &JobStore, parent: &JobRecord) {
    for child_id in &parent.children {
        let _ = store.cancel(child_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queue::JobStore;

    #[test]
    fn simulated_clock_interpolates_and_clamps() {
        assert_eq!(simulated_time_ns(100, 200, 0, 10), 100);
        assert_eq!(simulated_time_ns(100, 200, 10, 10), 200);
        assert_eq!(simulated_time_ns(100, 200, 5, 10), 150);
        assert_eq!(simulated_time_ns(100, 200, 0, 0), 100);
        // No overflow panic on extreme spans.
        let _ = simulated_time_ns(0, i64::MAX, u64::MAX, u64::MAX);
    }

    #[tokio::test]
    async fn backtest_streams_monotonic_progress_to_complete() {
        let store = JobStore::new();
        let mut req = crate::queue::tests::fixture_request();
        req.iterations = 2;
        let total = total_events_for_iterations(2);
        let record = store.submit_backtest(req, total);

        let mut rx = store.subscribe(&record.job_id).expect("subscribe");
        let mut seen_running = false;
        let mut last_processed = 0u64;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
        let final_status = loop {
            if tokio::time::Instant::now() > deadline {
                panic!("job did not finish in time");
            }
            rx.changed().await.expect("progress stream stays open");
            let p = rx.borrow().clone();
            assert!(
                p.events_processed >= last_processed,
                "progress is monotonic"
            );
            assert!(p.events_processed <= p.total_events);
            last_processed = p.events_processed;
            if p.status == JobStatus::Running && p.events_processed > 0 {
                seen_running = true;
            }
            if p.status.is_terminal() {
                break p.status;
            }
        };
        assert_eq!(final_status, JobStatus::Complete);
        assert!(
            seen_running,
            "must observe running snapshots before complete"
        );
        assert_eq!(last_processed, total);

        // Result exists but carries no fabricated metrics.
        let result = store.result(&record.job_id).expect("result");
        assert_eq!(result.job_id, record.job_id);
        assert!(result.headline.is_none());
        assert!(!result.metrics_pending.blocked_by.is_empty());
    }

    #[tokio::test]
    async fn cancelled_job_settles_cancelled() {
        let store = JobStore::new();
        let mut req = crate::queue::tests::fixture_request();
        req.iterations = 50;
        let total = total_events_for_iterations(50);
        let record = store.submit_backtest(req, total);
        store.cancel(&record.job_id).expect("cancel");

        let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
        loop {
            if tokio::time::Instant::now() > deadline {
                panic!("cancelled job did not settle");
            }
            let p = store.progress(&record.job_id).expect("progress");
            if p.status == JobStatus::Cancelled {
                break;
            }
            sleep(Duration::from_millis(5)).await;
        }
    }
}
