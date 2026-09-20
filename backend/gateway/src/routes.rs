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
        .fallback(not_found)
}
