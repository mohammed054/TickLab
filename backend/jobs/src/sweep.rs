//! Parameter sweeps (`docs/15` §15.2 `POST /api/v1/jobs/sweep`).
//!
//! Each grid cell is an independent backtest submitted as its own job, so a
//! sweep fans out across the worker pool (`docs/05` §5.6: "each cell … is an
//! independent backtest submitted as its own job"). The parent aggregates cell
//! progress and settles when every cell is terminal.

use std::sync::Arc;

use crate::queue::{JobRecord, JobStore};
use crate::runner::total_events_for_iterations;
use crate::types::{ApiError, JobKind, ParameterValue, SweepRequest};

/// Guard against grid explosions: a sweep is interactive (`docs/01` §1.5), so
/// an unbounded cross-product is rejected with a typed error instead of
/// flooding the pool.
pub const MAX_SWEEP_CELLS: usize = 256;

/// Expand the axis cross-product into per-cell parameter overrides.
pub fn expand_cells(
    request: &SweepRequest,
) -> Result<Vec<Vec<(String, ParameterValue)>>, ApiError> {
    if request.axes.is_empty() {
        return Err(ApiError::invalid_request(
            "sweep.axes must contain at least one axis".to_string(),
        ));
    }
    for axis in &request.axes {
        if axis.parameter.trim().is_empty() {
            return Err(ApiError::invalid_request(
                "sweep axis parameter must not be empty".to_string(),
            ));
        }
        if axis.values.is_empty() {
            return Err(ApiError::invalid_request(format!(
                "sweep axis '{}' must contain at least one value",
                axis.parameter
            )));
        }
    }
    let mut cells: Vec<Vec<(String, ParameterValue)>> = vec![Vec::new()];
    for axis in &request.axes {
        let mut next = Vec::with_capacity(cells.len() * axis.values.len().max(1));
        for prefix in &cells {
            for value in &axis.values {
                let mut cell = prefix.clone();
                cell.push((axis.parameter.clone(), value.clone()));
                next.push(cell);
            }
        }
        cells = next;
        if cells.len() > MAX_SWEEP_CELLS {
            return Err(ApiError::invalid_request(format!(
                "sweep grid ({} cells so far) exceeds the {MAX_SWEEP_CELLS}-cell cap; narrow the axes",
                cells.len()
            )));
        }
    }
    Ok(cells)
}

/// Submit a sweep: one child job per cell plus an aggregating parent.
/// Returns `(parent_id, cell_ids)`.
pub fn submit_sweep(
    store: &Arc<JobStore>,
    request: SweepRequest,
) -> Result<(String, Vec<String>), ApiError> {
    crate::types::validate_backtest_request(&request.request)?;
    let cells = expand_cells(&request)?;

    let mut cell_ids = Vec::with_capacity(cells.len());
    for overrides in &cells {
        let mut cell_request = request.request.clone();
        for (name, value) in overrides {
            cell_request.parameters.insert(name.clone(), value.clone());
        }
        let total = total_events_for_iterations(cell_request.iterations);
        let cell = store.submit_backtest(cell_request, total);
        cell_ids.push(cell.job_id.clone());
    }

    let total: u64 = cell_ids
        .iter()
        .filter_map(|id| store.progress(id).ok())
        .map(|p| p.total_events)
        .sum();
    let parent: Arc<JobRecord> =
        store.insert_parent(JobKind::Sweep, request.request, cell_ids.clone(), total);
    let parent_id = parent.job_id.clone();
    let store_clone = Arc::clone(store);
    tokio::spawn(async move {
        crate::runner::run_parent_aggregate(store_clone, parent).await;
    });
    Ok((parent_id, cell_ids))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queue::tests::fixture_request;
    use crate::types::{JobStatus, SweepAxis};
    use tokio::time::{sleep, Duration};

    fn sweep_request() -> SweepRequest {
        SweepRequest {
            request: fixture_request(),
            axes: vec![
                SweepAxis {
                    parameter: "threshold".to_string(),
                    values: vec![ParameterValue::Number(0.5), ParameterValue::Number(1.0)],
                },
                SweepAxis {
                    parameter: "mode".to_string(),
                    values: vec![
                        ParameterValue::Text("a".to_string()),
                        ParameterValue::Text("b".to_string()),
                    ],
                },
            ],
        }
    }

    #[test]
    fn grid_expands_to_cross_product() {
        let cells = expand_cells(&sweep_request()).expect("expand");
        assert_eq!(cells.len(), 4);
        for cell in &cells {
            assert_eq!(cell.len(), 2);
        }
    }

    #[test]
    fn empty_axes_rejected() {
        let mut req = sweep_request();
        req.axes.clear();
        assert!(expand_cells(&req).is_err());
    }

    #[tokio::test]
    async fn sweep_parent_completes_when_cells_complete() {
        let store = JobStore::new();
        let (parent_id, cell_ids) = submit_sweep(&store, sweep_request()).expect("submit");
        assert_eq!(cell_ids.len(), 4);

        let deadline = tokio::time::Instant::now() + Duration::from_secs(20);
        loop {
            if tokio::time::Instant::now() > deadline {
                panic!("sweep did not settle");
            }
            let p = store.progress(&parent_id).expect("parent progress");
            if p.status.is_terminal() {
                assert_eq!(p.status, JobStatus::Complete);
                assert_eq!(p.events_processed, p.total_events);
                break;
            }
            sleep(Duration::from_millis(10)).await;
        }
        let result = store.result(&parent_id).expect("parent result");
        assert!(result.headline.is_none(), "no fabricated metrics");
    }
}
