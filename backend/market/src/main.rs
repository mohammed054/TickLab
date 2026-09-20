//! Market Service — normalized market stream source (live/replay).
//!
//! `docs/06` §6.3 observability path: the Live Exchange Connector publishes
//! normalized events onto NATS; this service subscribes, maintains the
//! current-state snapshot (book top-N, recent trades, ticker) for fast
//! reconnect/late-subscriber catch-up, and serves it over REST. The Gateway
//! fans snapshots/deltas out to browsers; this service never pushes to a
//! browser directly, so a slow client has zero effect on ingestion.
//!
//! With no live feed connected, snapshots are absent (`connected: false`):
//! the service reports "no data yet" (`docs/14` §14.7) and never fabricates
//! market data (`docs/06` §6.5).
//!
//! Env: `MARKET_ADDR` (default `127.0.0.1:50053`), `NATS_URL`
//! (default `nats://127.0.0.1:4222`).

mod live_source;
mod normalize;
mod replay_source;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use ticklab_connectors_common::snapshot::DEFAULT_BOOK_DEPTH;

use crate::live_source::{MarketStore, SharedConnected, SharedStore};

const DEFAULT_ADDR: &str = "127.0.0.1:50053";
const DEFAULT_NATS_URL: &str = "nats://127.0.0.1:4222";
/// Hard cap on served book depth (transport guard, not a spec value).
const MAX_DEPTH: usize = 100;

#[derive(Clone)]
struct AppState {
    store: SharedStore,
    connected: SharedConnected,
}

#[derive(Debug, Deserialize)]
struct SnapshotQuery {
    #[serde(default)]
    depth: Option<usize>,
}

/// Health check endpoint.
async fn health() -> &'static str {
    "healthy"
}

/// Symbols currently held in snapshot state.
async fn list_symbols(State(st): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "symbols": st.store.lock().unwrap().symbols() }))
}

/// Current order book + ticker snapshot (`docs/15` §15.2
/// `GET /api/v1/market/{symbol}/snapshot`). Unknown symbols are 404 — never
/// an empty fabrication.
async fn snapshot(
    State(st): State<AppState>,
    Path(symbol): Path<String>,
    Query(q): Query<SnapshotQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let depth = q.depth.unwrap_or(DEFAULT_BOOK_DEPTH).clamp(1, MAX_DEPTH);
    match st.store.lock().unwrap().snapshot(&symbol, depth) {
        Some(snap) => Ok(Json(serde_json::json!({
            "snapshot": snap,
            "connected": st.connected.load(Ordering::SeqCst),
            "source": "live",
        }))),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": { "code": "NO_DATA_YET", "message": format!("no snapshot for '{symbol}' yet") },
            })),
        )),
    }
}

/// Create the market service router.
fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/symbols", get(list_symbols))
        // `:symbol` (not `{symbol}`): matchit 0.7 (via axum 0.7) uses
        // colon captures — same form as backend/gateway/src/routes.rs.
        .route("/api/v1/market/:symbol/snapshot", get(snapshot))
        .with_state(state)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let addr = std::env::var("MARKET_ADDR").unwrap_or_else(|_| DEFAULT_ADDR.to_string());
    let nats_url = std::env::var("NATS_URL").unwrap_or_else(|_| DEFAULT_NATS_URL.to_string());
    let state = AppState {
        store: Arc::new(Mutex::new(MarketStore::new())),
        connected: Arc::new(AtomicBool::new(false)),
    };

    // Live feed runs for the life of the process; NATS outages flip
    // `connected` and back off rather than killing the service.
    tokio::spawn(crate::live_source::run(
        nats_url,
        state.store.clone(),
        state.connected.clone(),
    ));

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!(%addr, "market service listening");
    axum::serve(listener, create_router(state)).await.unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;
    use tower::ServiceExt;

    fn state_with_trade() -> AppState {
        let store: SharedStore = Arc::new(Mutex::new(MarketStore::new()));
        let bytes = serde_json::json!({
            "timestampNs": 1_700_000_000_000_000_000_i64,
            "symbol": "btcusdt",
            "exchange": "binance-futures",
            "type": "trade",
            "side": "ask",
            "price": 97500.5,
            "size": 0.01,
            "sequence": 42
        })
        .to_string()
        .into_bytes();
        assert!(crate::live_source::handle_bytes(
            &store,
            "market.btcusdt.trades",
            &bytes
        ));
        AppState {
            store,
            connected: Arc::new(AtomicBool::new(true)),
        }
    }

    #[tokio::test]
    async fn snapshot_endpoint_serves_live_state() {
        let app = create_router(state_with_trade());
        let res = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/market/BTCUSDT/snapshot?depth=5")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(v["snapshot"]["symbol"], "btcusdt");
        assert_eq!(v["snapshot"]["trades"][0]["price"], 97500.5);
        assert_eq!(v["connected"], true);
        assert_eq!(v["source"], "live");
    }

    #[tokio::test]
    async fn unknown_symbol_is_404_not_fabricated() {
        let app = create_router(state_with_trade());
        let res = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/market/ethusdt/snapshot")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
        let body = axum::body::to_bytes(res.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(v["error"]["code"], "NO_DATA_YET");
    }

    #[tokio::test]
    async fn symbols_lists_held_state() {
        let app = create_router(state_with_trade());
        let res = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/symbols")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(v["symbols"], serde_json::json!(["btcusdt"]));
    }
}
