/// Job Runner — Rust/Axum job queue, engine gRPC client, progress streaming.
/// 
/// This service owns job lifecycle/queueing and calls the Engine Abstraction
/// Layer's gRPC methods directly. It is the bridge between the backend API
/// (FastAPI) and the Rust backtest engine.
/// 
/// Key responsibilities:
/// - Accept backtest job submissions from the gateway or API
/// - Queue jobs and dispatch workers
/// - Stream progress updates via WebSocket/NATS
/// - Call the engine gRPC service for backtest execution
/// - Handle job cancellation and retry logic
/// - Persist job state in PostgreSQL
/// 
/// The Job Runner is the critical path between user interaction and backtest
/// execution. It must be reliable and able to handle restarts without data loss.
use axum::{
    routing::{get, post, put, delete},
    Json, Router,
};
use serde::Deserialize;
use std::net::SocketAddr;
use tower::ServiceBuilder;
use tracing_subscriber::fmt::Layer;

mod queue;
mod runner;
mod sweep;
mod walkforward;
mod robustness;

/// Create the job router with all routes
pub fn create_router() -> Router {
    Router::new()
        .route("/jobs", post(queue::submit_job))
        .route("/jobs/:id", get(queue::get_job))
        .route("/jobs/:id/cancel", post(queue::cancel_job))
        .route("/jobs/:id/progress", get(queue::get_progress))
        .nest("/api", routes::router())
}

/// Job submission request
#[derive(Debug, Deserialize)]
pub struct SubmitJobRequest {
    /// Dataset identifier
    pub dataset_id: String,
    /// Strategy identifier
    pub strategy_id: String,
    /// Parameters for the strategy
    pub parameters: serde_json::Value,
    /// Priority level
    pub priority: u8,
}

/// Job status response
#[derive(Debug, serde::Serialize)]
pub struct JobStatusResponse {
    /// Job ID
    pub id: String,
    /// Current status: queued, running, completed, failed, cancelled
    pub status: String,
    /// Progress percentage (0-100)
    pub progress: f32,
    /// Estimated completion time
    pub estimated_completion: Option<String>,
}

/// Entry point for the Job Runner service
#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let router = create_router();
    let addr = SocketAddr::from(([127, 0, 0, 1], 50052));
    tracing::info!("Job Runner listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap();

    axum::serve(listener, router)
        .await
        .unwrap();
}