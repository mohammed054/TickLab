//! Job Runner service entry point (`docs/03` §3.5 `backend/jobs/src/main.rs`).
//!
//! Binds `JOBS_ADDR` (default `127.0.0.1:50052`, the pre-existing scaffold
//! default) and serves the [`ticklab_jobs::api`] router. The Gateway reaches
//! this service over localhost HTTP in Phase 2 local dev (`docs/03` §3.7);
//! the choice of in-process vs. localhost-gRPC engine calls is documented in
//! `STATE.md` per `docs/03` §3.4 (in-process runner-stage execution until the
//! vendor checkout lands).

use std::net::SocketAddr;

use ticklab_jobs::{api, queue::JobStore};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let addr: SocketAddr = std::env::var("JOBS_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:50052".to_string())
        .parse()?;
    let state = api::AppState::new(JobStore::new());
    let router = api::router(state);
    tracing::info!("ticklab-jobs listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
