//! Walk-forward jobs (`docs/15` §15.2 `POST /api/v1/jobs/walkforward`).
//!
//! The request's date range is split into `windows` contiguous slices; each
//! slice runs as an independent child job on the worker pool (`docs/05` §5.6),
//! and the parent aggregates. In-sample/out-of-sample split semantics and the
//! walk-forward analytics views are downstream (Block 4.x) concerns; this
//! module owns honest decomposition + lifecycle.

use std::sync::Arc;

use crate::queue::{JobRecord, JobStore};
use crate::runner::total_events_for_iterations;
use crate::types::{ApiError, JobKind, WalkforwardRequest};

/// Bounds for the window count: at least 1 slice, at most 32 children.
pub const MAX_WALKFORWARD_WINDOWS: u32 = 32;

/// Split `[start, end)` into `windows` contiguous non-overlapping slices.
/// Remainders go to the trailing windows; every slice is non-empty when
/// `windows <= span`.
pub fn split_windows(start: i64, end: i64, windows: u32) -> Result<Vec<(i64, i64)>, ApiError> {
    if windows == 0 || windows > MAX_WALKFORWARD_WINDOWS {
        return Err(ApiError::invalid_request(format!(
            "walkforward.windows must be between 1 and {MAX_WALKFORWARD_WINDOWS}"
        )));
    }
    let span = end - start;
    if span <= 0 {
        return Err(ApiError::invalid_request(
            "walkforward dateRange must be non-empty".to_string(),
        ));
    }
    if span < windows as i64 {
        return Err(ApiError::invalid_request(
            "walkforward range is smaller than the window count; use fewer windows".to_string(),
        ));
    }
    let base = span / windows as i64;
    let mut out = Vec::with_capacity(windows as usize);
    let mut cursor = start;
    for i in 0..windows {
        let width = if i == windows - 1 { end - cursor } else { base };
        out.push((cursor, cursor + width));
        cursor += width;
    }
    Ok(out)
}

/// Submit a walk-forward job. Returns the parent id.
pub fn submit_walkforward(
    store: &Arc<JobStore>,
    request: WalkforwardRequest,
) -> Result<String, ApiError> {
    crate::types::validate_backtest_request(&request.request)?;
    let windows = split_windows(
        request.request.date_range.start,
        request.request.date_range.end,
        request.windows,
    )?;

    let mut cell_ids = Vec::with_capacity(windows.len());
    for (start, end) in windows {
        let mut child = request.request.clone();
        child.date_range.start = start;
        child.date_range.end = end;
        let total = total_events_for_iterations(child.iterations);
        let record = store.submit_backtest(child, total);
        cell_ids.push(record.job_id.clone());
    }

    let total: u64 = cell_ids
        .iter()
        .filter_map(|id| store.progress(id).ok())
        .map(|p| p.total_events)
        .sum();
    let parent: Arc<JobRecord> =
        store.insert_parent(JobKind::Walkforward, request.request, cell_ids, total);
    let parent_id = parent.job_id.clone();
    let store_clone = Arc::clone(store);
    tokio::spawn(async move {
        crate::runner::run_parent_aggregate(store_clone, parent).await;
    });
    Ok(parent_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queue::tests::fixture_request;
    use crate::types::{JobStatus, WalkforwardRequest};
    use tokio::time::{sleep, Duration};

    #[test]
    fn windows_cover_range_without_gaps() {
        let windows = split_windows(0, 10, 3).expect("split");
        assert_eq!(windows, vec![(0, 3), (3, 6), (6, 10)]);
        assert!(split_windows(0, 10, 0).is_err());
        assert!(split_windows(0, 10, 33).is_err());
        assert!(split_windows(0, 2, 3).is_err());
    }

    #[tokio::test]
    async fn walkforward_parent_completes() {
        let store = JobStore::new();
        let parent_id = submit_walkforward(
            &store,
            WalkforwardRequest {
                request: fixture_request(),
                windows: 3,
            },
        )
        .expect("submit");

        let deadline = tokio::time::Instant::now() + Duration::from_secs(20);
        loop {
            if tokio::time::Instant::now() > deadline {
                panic!("walkforward did not settle");
            }
            let p = store.progress(&parent_id).expect("progress");
            if p.status.is_terminal() {
                assert_eq!(p.status, JobStatus::Complete);
                break;
            }
            sleep(Duration::from_millis(10)).await;
        }
    }
}
