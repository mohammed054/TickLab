//! Robustness-test jobs (`docs/15` §15.2 `POST /api/v1/jobs/robustness`).
//!
//! Each named case applies parameter overrides to the base request and runs
//! as an independent child job on the worker pool (`docs/05` §5.6). The
//! parent aggregates and settles when every case is terminal. Perturbation
//! semantics (which overrides constitute a meaningful robustness battery) are
//! a research concern; this module owns honest fan-out + lifecycle.

use std::sync::Arc;

use crate::queue::{JobRecord, JobStore};
use crate::runner::total_events_for_iterations;
use crate::types::{ApiError, JobKind, RobustnessRequest};

/// Cap on cases per robustness job (interactive use, `docs/01` §1.5).
pub const MAX_ROBUSTNESS_CASES: usize = 64;

/// Submit a robustness job. Returns the parent id.
pub fn submit_robustness(
    store: &Arc<JobStore>,
    request: RobustnessRequest,
) -> Result<String, ApiError> {
    crate::types::validate_backtest_request(&request.request)?;
    if request.cases.is_empty() {
        return Err(ApiError::invalid_request(
            "robustness.cases must contain at least one case".to_string(),
        ));
    }
    if request.cases.len() > MAX_ROBUSTNESS_CASES {
        return Err(ApiError::invalid_request(format!(
            "robustness case count exceeds the {MAX_ROBUSTNESS_CASES}-case cap"
        )));
    }

    // Validate everything before submitting anything: a rejected request
    // must not leave half-submitted child jobs behind.
    let mut seen = std::collections::HashSet::new();
    for case in &request.cases {
        if case.name.trim().is_empty() {
            return Err(ApiError::invalid_request(
                "robustness case name must not be empty".to_string(),
            ));
        }
        if !seen.insert(case.name.clone()) {
            return Err(ApiError::invalid_request(format!(
                "duplicate robustness case name '{}'",
                case.name
            )));
        }
    }
    let mut cell_ids = Vec::with_capacity(request.cases.len());
    for case in &request.cases {
        let mut child = request.request.clone();
        for (name, value) in &case.parameter_overrides {
            child.parameters.insert(name.clone(), value.clone());
        }
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
        store.insert_parent(JobKind::Robustness, request.request, cell_ids, total);
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
    use crate::types::{JobStatus, ParameterValue, RobustnessCase, RobustnessRequest};
    use std::collections::BTreeMap;
    use tokio::time::{sleep, Duration};

    fn robustness_request() -> RobustnessRequest {
        let mut overrides = BTreeMap::new();
        overrides.insert("latency_ms".to_string(), ParameterValue::Number(5.0));
        RobustnessRequest {
            request: fixture_request(),
            cases: vec![
                RobustnessCase {
                    name: "base".to_string(),
                    parameter_overrides: BTreeMap::new(),
                },
                RobustnessCase {
                    name: "high-latency".to_string(),
                    parameter_overrides: overrides,
                },
            ],
        }
    }

    #[tokio::test]
    async fn duplicate_case_names_rejected() {
        let mut req = robustness_request();
        req.cases[1].name = "base".to_string();
        let store = JobStore::new();
        assert!(submit_robustness(&store, req).is_err());
    }

    #[tokio::test]
    async fn robustness_parent_completes() {
        let store = JobStore::new();
        let parent_id = submit_robustness(&store, robustness_request()).expect("submit");

        let deadline = tokio::time::Instant::now() + Duration::from_secs(20);
        loop {
            if tokio::time::Instant::now() > deadline {
                panic!("robustness did not settle");
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
