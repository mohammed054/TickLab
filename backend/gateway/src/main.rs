/// Gateway — Rust/Axum WebSocket fan-out, REST/GraphQL routing, auth.
/// 
/// This is the primary entry point for the frontend and external clients.
/// It handles:
/// - WebSocket connections for real-time market data and progress streaming
/// - REST API routing for backtest submission, status, and results
/// - Authentication and authorization via JWT or session tokens
/// - Health checks and metrics endpoints
/// 
/// The gateway does not contain backtest logic — it delegates to the Job Runner
/// which calls the Engine Abstraction Layer gRPC service.
use axum::{
    routing::{get, post, get_service},
    Json, Router,
};
use serde::Deserialize;
use std::net::SocketAddr;
use tower_http::trace::TraceLayer;
use tracing_subscriber::fmt::Layer;

mod ws;
mod routes;
mod auth;

/// Root API response type
type ApiResult<T> = Result<T, ApiError>;

/// API error type
#[derive(Debug, Clone, serde::Serialize)]
pub struct ApiError {
    pub message: String,
    pub code: String,
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.message, self.code)
    }
}

impl std::error::Error for ApiError {}

/// API root endpoint
async fn api_root() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "name": "TickLab Gateway",
        "version": "0.1.0",
        "status": "operational"
    }))
}

/// Create the router with all routes
pub fn create_router() -> Router {
    Router::new()
        .route("/", get(api_root))
        .nest("/ws", ws::router())
        .nest("/api", routes::router())
        .layer(TraceLayer::new_for_http())
        .layer(
            tower::ServiceBuilder::new()
                .tick(()))
        .with(
            tower_http::cors::CorsLayer::permissive(), // TODO: restrict in production
        )
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Build the router
    let router = create_router();

    // Bind to address
    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));
    tracing::info!("Gateway listening on {}", addr);

    // Start the server
    axum::serve(tokio::net::TcpListener::bind(addr)
        .await
        .unwrap(),
        router)
        .await
        .unwrap();
}