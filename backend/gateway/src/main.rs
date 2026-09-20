//! Gateway service entry point (`docs/03` §3.5 `backend/gateway/src/main.rs`).
//!
//! Binds `GATEWAY_ADDR` (default `0.0.0.0:8080`, matching the published
//! `docker-compose.yml` port) and forwards job routes to `JOBS_BASE_URL`
//! (default `http://127.0.0.1:50052`).

use ticklab_gateway::GatewayConfig;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let addr: std::net::SocketAddr = std::env::var("GATEWAY_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".to_string())
        .parse()?;
    let config = GatewayConfig {
        jobs_base_url: std::env::var("JOBS_BASE_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:50052".to_string()),
    };
    let router = ticklab_gateway::build_router(&config).map_err(|e| {
        eprintln!("gateway configuration error: {e}");
        e
    })?;
    tracing::info!("ticklab-gateway listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
