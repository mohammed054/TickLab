//! Gateway REST: jobs proxy + health (`docs/15` §15.2).
//!
//! The gateway is the frontend's single entry point (`docs/03` §3.5); job
//! routes are forwarded to the jobs service over localhost HTTP with status
//! and body preserved, so the §15.2 contract holds end-to-end. A lost jobs
//! service surfaces as a typed 502, never a dropped connection
//! (`docs/14` §14.9).

use axum::{
    body::Body,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};

use crate::ws::AppState;

/// Upstream body cap (sweep/robustness payloads are small parameter grids).
const MAX_PROXY_BODY_BYTES: usize = 1024 * 1024;

fn gateway_error(status: StatusCode, code: &str, message: String, action: &str) -> Response {
    (
        status,
        Json(serde_json::json!({"code": code, "message": message, "action": action})),
    )
        .into_response()
}

/// Forward one jobs-service request, preserving method, path, query, status,
/// and body.
async fn proxy_to_jobs(State(state): State<AppState>, req: axum::http::Request<Body>) -> Response {
    let method = req.method().clone();
    let path_query = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str().to_string())
        .unwrap_or_else(|| req.uri().path().to_string());
    let url = format!("{}{}", state.jobs.base_url_trimmed(), path_query);

    let bytes = match axum::body::to_bytes(req.into_body(), MAX_PROXY_BODY_BYTES).await {
        Ok(b) => b,
        Err(_) => {
            return gateway_error(
                StatusCode::PAYLOAD_TOO_LARGE,
                "PAYLOAD_TOO_LARGE",
                format!("request body exceeds the {MAX_PROXY_BODY_BYTES}-byte cap"),
                "Submit a smaller parameter grid.",
            );
        }
    };

    let method_name = method.to_string();
    let upstream = state
        .jobs
        .request(method, &url, bytes)
        .await
        .map_err(|e| {
            tracing::warn!("jobs proxy failed: {e}");
            gateway_error(
                StatusCode::BAD_GATEWAY,
                "JOBS_UNREACHABLE",
                "jobs service is unreachable".to_string(),
                "Check that the jobs service is running (JOBS_BASE_URL); retry, then inspect the gateway logs.",
            )
        });
    let upstream = match upstream {
        Ok(res) => res,
        Err(res) => return res,
    };

    let status = upstream.status();
    let body = upstream.bytes().await.unwrap_or_default();
    tracing::debug!("proxied {method_name} {path_query} -> {status}");
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .unwrap_or_else(|_| {
            gateway_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "PROXY_FAILED",
                "failed to relay the jobs response".to_string(),
                "Retry the request; inspect the gateway logs if this persists.",
            )
        })
}

/// `GET /healthz`: gateway liveness plus jobs reachability.
async fn healthz(State(state): State<AppState>) -> impl IntoResponse {
    let jobs_reachable = state.jobs.probe_jobs().await;
    let status = if jobs_reachable { "ok" } else { "degraded" };
    Json(serde_json::json!({
        "status": status,
        "service": "ticklab-gateway",
        "jobsReachable": jobs_reachable,
    }))
}

/// `GET /`: service identity (scaffold parity, human-friendly root).
async fn root() -> impl IntoResponse {
    Json(serde_json::json!({
        "name": "TickLab Gateway",
        "version": "0.1.0",
        "status": "operational",
    }))
}

async fn not_found() -> Response {
    gateway_error(
        StatusCode::NOT_FOUND,
        "NOT_FOUND",
        "no such endpoint".to_string(),
        "See docs/15 §15.2 for the REST contract.",
    )
}

/// Dataset endpoints (`docs/15` §15.2)
async fn list_datasets(State(state): State<AppState>) -> impl IntoResponse {
    let datasets = state.datasets.list().await;
    Json(serde_json::json!({"datasets": datasets}))
}

async fn get_dataset_quality(State(state): State<AppState>, Json(payload): Json<serde_json::Value>) -> impl IntoResponse {
    let dataset_id = payload.get("dataset_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let quality = state.datasets.get_quality(dataset_id).await;
    Json(quality)
}

/// Strategy template endpoints (`docs/15` §15.2)
async fn list_strategies_templates(State(state): State<AppState>) -> impl IntoResponse {
    let templates = state.strategies.list_templates().await;
    Json(serde_json::json!({"templates": templates}))
}

async fn validate_strategy(State(state): State<AppState>, Json(payload): Json<serde_json::Value>) -> impl IntoResponse {
    let result = state.strategies.validate(&payload).await;
    Json(result)
}

/// Experiment endpoints (`docs/15` §15.2)
async fn get_experiment(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let experiment = state.experiments.get(&id).await;
    Json(experiment)
}

async fn reproduce_experiment(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let new_id = state.experiments.reproduce(&id).await;
    Json(serde_json::json!({"newExperimentId": new_id}))
}

/// Job batch endpoint (`docs/15` §15.2)
async fn submit_batch(State(state): State<AppState>, Json(payload): Json<serde_json::Value>) -> impl IntoResponse {
    let result = state.jobs.submit_batch(payload).await;
    Json(result)
}

async fn not_found() -> Response {
    gateway_error(
        StatusCode::NOT_FOUND,
        "NOT_FOUND",
        "no such endpoint".to_string(),
        "See docs/15 §15.2 for the REST contract.",
    )
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(root))
        .route("/healthz", get(healthz))
        .route("/api/v1/jobs/backtest", post(proxy_to_jobs))
        .route("/api/v1/jobs/sweep", post(proxy_to_jobs))
        .route("/api/v1/jobs/walkforward", post(proxy_to_jobs))
        .route("/api/v1/jobs/robustness", post(proxy_to_jobs))
        .route("/api/v1/jobs", get(proxy_to_jobs))
        .route("/api/v1/jobs/:id", get(proxy_to_jobs).delete(proxy_to_jobs))
        .route("/api/v1/jobs/:id/result", get(proxy_to_jobs))
        .route("/api/v1/datasets", get(list_datasets))
        .route("/api/v1/datasets/{dataset_id}/quality", post(get_dataset_quality))
        .route("/api/v1/strategies/templates", get(list_strategies_templates))
        .route("/api/v1/strategies/validate", post(validate_strategy))
        .route("/api/v1/experiments/{id}", get(get_experiment).post(reproduce_experiment))
        .route("/api/v1/jobs/batches", post(submit_batch))
        .fallback(not_found)
}
