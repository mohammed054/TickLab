/// Market Service — Normalized market stream source (live/replay).
/// 
/// This service provides the normalized market data stream to the frontend
/// and other backend services. It supports:
/// - Live feed from exchange connectors (WebSocket)
/// - Replay of historical datasets
/// - Normalization of raw market data into a unified format
/// - Real-time updates via WebSocket
/// - Historical data on demand
/// 
/// The market service is the single source of truth for market data in the
/// workstation. All UI components subscribe to this service for their market
/// data needs.
use axum::{
    routing::get,
    Router,
};
use std::net::SocketAddr;

/// Create the market service router
pub fn create_router() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/symbols", get(list_symbols))
}

/// Health check endpoint
async fn health() -> &'static str {
    "healthy"
}

/// List available symbols/instruments
async fn list_symbols() -> &'static str {
    "BTC-USD, ETH-USD, etc."
}

#[tokio::main]
async fn main() {
    let router = create_router();
    let addr = SocketAddr::from(([127, 0, 0, 1], 50053));
    tracing::info!("Market service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap();

    axum::serve(listener, router)
        .await
        .unwrap();
}