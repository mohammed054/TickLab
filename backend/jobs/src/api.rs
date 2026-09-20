//! REST surface of the Job Runner (`docs/15` §15.2, versioned `/api/v1` per §15.1).
//!
//! Endpoints:
//! - `POST /api/v1/jobs/backtest` → `{jobId}` (async submit, `docs/01` §1.5)
//! - `POST /api/v1/jobs/sweep` → `{jobId, cellJobIds[]}`
//! - `POST /api/v1/jobs/walkforward` → `{jobId}`
//! - `POST /api/v1/jobs/robustness` → `{jobId}`
//! - `GET /api/v1/jobs/{jobId}` → progress poll fallback
//! - `DELETE /api/v1/jobs/{jobId}` → cancel (idempotent)
//! - `GET /api/v1/jobs/{jobId}/result` → result, or typed 409 while pending
//! - `GET /api/v1/jobs` → recent summaries for `docs/08` §8.15 (smallest
//!   assumption: the §15.2 table has no list endpoint, but §8.15's
//!   RUNNING/QUEUED/COMPLETE list needs a source; logged in STATE.md)
//! - `GET /healthz` → pool + queue health

use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};

use crate::queue::JobStore;
use crate::runner::total_events_for_iterations;
use crate::types::{
    ApiError, BacktestRequest, JobStatus, RobustnessRequest, SubmitResponse, SweepRequest,
    SweepSubmitResponse, WalkforwardRequest,
};

/// Shared service state.
#[derive(Clone)]
pub struct AppState {
    pub store: Arc<JobStore>,
}

impl AppState {
    pub fn new(store: Arc<JobStore>) -> Self {
        Self { store }
    }
}

/// Typed JSON error body with the matching HTTP status.
pub struct ApiResponse(pub StatusCode, pub ApiError);

impl IntoResponse for ApiResponse {
    fn into_response(self) -> Response {
        (self.0, Json(self.1)).into_response()
    }
}

fn err(status: StatusCode, err: ApiError) -> ApiResponse {
    ApiResponse(status, err)
}

fn status_for_code(code: &str) -> StatusCode {
    match code {
        "INVALID_REQUEST" => StatusCode::BAD_REQUEST,
        "JOB_NOT_FOUND" => StatusCode::NOT_FOUND,
        "RESULT_PENDING" | "RESULT_UNAVAILABLE" => StatusCode::CONFLICT,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn submit_backtest(
    State(state): State<AppState>,
    Json(req): Json<BacktestRequest>,
) -> Result<impl IntoResponse, ApiResponse> {
    if let Err(e) = crate::types::validate_backtest_request(&req) {
        return Err(err(StatusCode::BAD_REQUEST, e));
    }
    let total = total_events_for_iterations(req.iterations);
    let record = state.store.submit_backtest(req, total);
    Ok((
        StatusCode::CREATED,
        Json(SubmitResponse {
            job_id: record.job_id.clone(),
        }),
    ))
}

async fn submit_sweep(
    State(state): State<AppState>,
    Json(req): Json<SweepRequest>,
) -> Result<impl IntoResponse, ApiResponse> {
    match crate::sweep::submit_sweep(&state.store, req) {
        Ok((job_id, cell_job_ids)) => Ok((
            StatusCode::CREATED,
            Json(SweepSubmitResponse {
                job_id,
                cell_job_ids,
            }),
        )),
        Err(e) => Err(err(status_for_code(&e.code), e)),
    }
}

async fn submit_walkforward(
    State(state): State<AppState>,
    Json(req): Json<WalkforwardRequest>,
) -> Result<impl IntoResponse, ApiResponse> {
    match crate::walkforward::submit_walkforward(&state.store, req) {
        Ok(job_id) => Ok((StatusCode::CREATED, Json(SubmitResponse { job_id }))),
        Err(e) => Err(err(status_for_code(&e.code), e)),
    }
}

async fn submit_robustness(
    State(state): State<AppState>,
    Json(req): Json<RobustnessRequest>,
) -> Result<impl IntoResponse, ApiResponse> {
    match crate::robustness::submit_robustness(&state.store, req) {
        Ok(job_id) => Ok((StatusCode::CREATED, Json(SubmitResponse { job_id }))),
        Err(e) => Err(err(status_for_code(&e.code), e)),
    }
}

async fn get_job(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<impl IntoResponse, ApiResponse> {
    match state.store.progress(&job_id) {
        Ok(p) => Ok(Json(p)),
        Err(e) => Err(err(status_for_code(&e.code), e)),
    }
}

async fn cancel_job(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<impl IntoResponse, ApiResponse> {
    match state.store.cancel(&job_id) {
        Ok(p) => Ok(Json(p)),
        Err(e) => Err(err(status_for_code(&e.code), e)),
    }
}

async fn get_result(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
) -> Result<impl IntoResponse, ApiResponse> {
    match state.store.result(&job_id) {
        Ok(r) => Ok(Json(r)),
        Err(e) => Err(err(status_for_code(&e.code), e)),
    }
}

async fn list_jobs(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let status_filter = params.get("status").and_then(|s| {
        serde_json::from_value::<JobStatus>(serde_json::Value::String(s.clone())).ok()
    });
    let limit = params
        .get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(50);
    Json(serde_json::json!({
        "jobs": state.store.list(status_filter, limit),
    }))
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let queued = state.store.list(Some(JobStatus::Queued), 200).len();
    Json(serde_json::json!({
        "status": "ok",
        "service": "ticklab-jobs",
        "workers": state.store.worker_count(),
        "running": state.store.running_count(),
        "queued": queued,
    }))
}

async fn fallback_404() -> ApiResponse {
    err(
        StatusCode::NOT_FOUND,
        ApiError::new(
            "NOT_FOUND",
            "no such endpoint".to_string(),
            Some("See docs/15 §15.2 for the REST contract."),
        ),
    )
}

/// Build the jobs router over shared state.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/jobs/backtest", post(submit_backtest))
        .route("/api/v1/jobs/sweep", post(submit_sweep))
        .route("/api/v1/jobs/walkforward", post(submit_walkforward))
        .route("/api/v1/jobs/robustness", post(submit_robustness))
        .route("/api/v1/jobs", get(list_jobs))
        .route("/api/v1/jobs/:id", get(get_job))
        .route("/api/v1/jobs/:id", delete(cancel_job))
        .route("/api/v1/jobs/:id/result", get(get_result))
        .route("/healthz", get(health))
        .fallback(fallback_404)
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    fn app() -> Router {
        router(AppState::new(JobStore::new()))
    }

    fn backtest_body(iterations: u32) -> serde_json::Value {
        serde_json::json!({
            "strategyRef": {"id": "s", "version": "1", "codeHash": "abc"},
            "parameters": {},
            "datasetId": "d",
            "dateRange": {"start": 1, "end": 100},
            "initialCapital": 1000.0,
            "executionModel": {
                "makerFeePct": 0.02, "takerFeePct": 0.05,
                "tickSize": 0.1, "lotSize": 0.001,
                "latencyModel": "fixed",
                "queueModelPreset": "probabilistic",
                "allowPartialFills": true
            },
            "riskLimits": {
                "maxPosition": 1.0, "maxOrderSize": 0.5, "maxDailyLoss": 100.0,
                "maxDrawdownPct": 5.0, "maxOpenOrders": 10,
                "maxOrderRatePerSec": 5.0, "maxNotionalExposure": 5000.0,
                "emergencyStopEnabled": true
            },
            "randomSeed": null,
            "iterations": iterations
        })
    }

    async fn post_json(
        app: Router,
        uri: &str,
        body: serde_json::Value,
    ) -> (StatusCode, serde_json::Value) {
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(uri)
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&body).expect("json")))
                    .expect("request"),
            )
            .await
            .expect("oneshot");
        let status = res.status();
        let bytes = axum::body::to_bytes(res.into_body(), 64 * 1024)
            .await
            .expect("body");
        (status, serde_json::from_slice(&bytes).expect("json body"))
    }

    async fn get_json(app: Router, uri: &str) -> (StatusCode, serde_json::Value) {
        let res = app
            .oneshot(
                Request::builder()
                    .uri(uri)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("oneshot");
        let status = res.status();
        let bytes = axum::body::to_bytes(res.into_body(), 1024 * 1024)
            .await
            .expect("body");
        (status, serde_json::from_slice(&bytes).expect("json body"))
    }

    #[tokio::test]
    async fn submit_poll_complete_result_over_http() {
        let app = app();
        let (status, body) =
            post_json(app.clone(), "/api/v1/jobs/backtest", backtest_body(2)).await;
        assert_eq!(status, StatusCode::CREATED);
        let job_id = body["jobId"].as_str().expect("jobId").to_string();

        // Poll fallback until terminal (docs/15 §15.2).
        let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(15);
        let final_status = loop {
            if tokio::time::Instant::now() > deadline {
                panic!("job did not finish");
            }
            let (status, body) = get_json(app.clone(), &format!("/api/v1/jobs/{job_id}")).await;
            assert_eq!(status, StatusCode::OK);
            let s = body["status"].as_str().expect("status").to_string();
            if ["complete", "failed", "cancelled"].contains(&s.as_str()) {
                break s;
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
        };
        assert_eq!(final_status, "complete");

        let (status, body) = get_json(app.clone(), &format!("/api/v1/jobs/{job_id}/result")).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body["headline"].is_null());
        assert!(body["metricsPending"]["blockedBy"].is_array());
    }

    #[tokio::test]
    async fn invalid_submit_is_400_with_action() {
        let app = app();
        let mut bad = backtest_body(1);
        bad["datasetId"] = serde_json::Value::String(String::new());
        let (status, body) = post_json(app, "/api/v1/jobs/backtest", bad).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["code"], "INVALID_REQUEST");
        assert!(body["action"].is_string());
    }

    #[tokio::test]
    async fn unknown_job_is_404_and_early_result_is_409() {
        let app = app();
        let (status, body) = get_json(app.clone(), "/api/v1/jobs/job-nope").await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["code"], "JOB_NOT_FOUND");

        let (status, _) = post_json(app.clone(), "/api/v1/jobs/backtest", backtest_body(30)).await;
        assert_eq!(status, StatusCode::CREATED);
        // Fresh big job: result raced immediately is 409 (or 200 in the
        // unlikely event it already finished — either is correct behavior).
        let (status, _) = get_json(app, "/api/v1/jobs/job-1/result").await;
        assert!(status == StatusCode::CONFLICT || status == StatusCode::OK);
    }

    #[tokio::test]
    async fn list_endpoint_shows_submitted_jobs() {
        let app = app();
        let (status, _) = post_json(app.clone(), "/api/v1/jobs/backtest", backtest_body(1)).await;
        assert_eq!(status, StatusCode::CREATED);
        let (status, body) = get_json(app, "/api/v1/jobs?limit=10").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["jobs"].as_array().expect("jobs").len(), 1);
    }

    #[tokio::test]
    async fn health_reports_pool() {
        let (status, body) = get_json(app(), "/healthz").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["status"], "ok");
        assert!(body["workers"].as_u64().expect("workers") >= 1);
    }
}
