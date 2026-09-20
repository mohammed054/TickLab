//! TickLab Gateway (`docs/16` Block 2.8 Task A + C, `docs/03` §3.5
//! `backend/gateway`).
//!
//! The frontend's single entry point: WebSocket fan-out (Sync Bus +
//! per-job progress topics, `docs/15` §15.3) and REST routing with the
//! async-job pattern (submit → job ID → progress stream → result, `docs/01`
//! §1.5, `docs/15` §15.2).
//!
//! Module map (per `docs/03` §3.5, plus `protocol`/`hub`/`progress` carrying
//! the §15.3 contract):
//! - [`ws`]: WS upgrade + per-connection task.
//! - [`protocol`]: WS frame shapes and validation.
//! - [`hub`]: session-scoped fan-out registry.
//! - [`progress`]: jobs-service polling forwarders.
//! - [`routes`]: REST surface (jobs proxy + health).
//! - [`auth`]: session-token validation.
//! - [`logging`]: structured JSON logging (docs/14-cross-cutting-systems.md §14.4).
//!
//! Environment isolation (`docs/12` §12.2): this service exposes backtest
//! job submission and read-only progress over historical datasets only.
//! There is no order-entry code path anywhere in this crate — Research and
//! Paper traffic cannot reach a live exchange endpoint by construction.

pub mod auth;
pub mod hub;
pub mod progress;
pub mod protocol;
pub mod routes;
pub mod ws;
pub mod logging;

use std::sync::Arc;

use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

pub use ws::AppState;

/// Gateway configuration (environment-overridable for local dev and
/// container deployments, `docs/03` §3.7).
pub struct GatewayConfig {
    /// Base URL of the jobs service, e.g. `http://127.0.0.1:50052`.
    /// In `docker-compose.yml` deployments this points at the `jobs`
    /// service; no compose change is made in this task (out of lane —
    /// noted in STATE.md), the default works for local processes.
    pub jobs_base_url: String,
}

/// Build the full gateway router.
pub fn build_router(config: &GatewayConfig) -> Result<Router, String> {
    let jobs = progress::JobsClient::new(config.jobs_base_url.clone())?;
    let state = AppState {
        hub: hub::Hub::new(),
        jobs,
    };
    Ok(Router::new()
        .merge(routes::routes())
        .merge(ws::ws_route())
        .layer(TraceLayer::new_for_http())
        // Permissive CORS is a local-dev setting (Vite dev server hits the
        // gateway directly, docs/03 §3.7); restrict origins in production.
        .layer(CorsLayer::permissive())
        .with_state(state))
}

/// Shared hub handle type for tests.
pub fn new_hub() -> Arc<hub::Hub> {
    hub::Hub::new()
}
