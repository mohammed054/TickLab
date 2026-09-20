//! Live Exchange Connector — Binance Futures, market-data only (Block 5.1).
//!
//! One process per exchange (`docs/06` §6.2): owns the public WebSocket
//! session(s), maintains local order-book state, and publishes normalized
//! [`MarketEvent`](ticklab_connectors_common::events::MarketEvent)s onto NATS
//! publish-and-forget. **No order-entry capability exists in this process.**
//! There are no credentials, no order endpoints, and no user-data stream —
//! Research/Paper traffic cannot reach a live order endpoint by construction
//! (`docs/12` §12.2).
//!
//! Env: `TICKLAB_STREAM_URL`, `TICKLAB_SYMBOLS` (csv), `TICKLAB_NATS_URL`,
//! `TICKLAB_BOOK_DEPTH`, `TICKLAB_HEALTH_ADDR` (see `config.rs`).

mod config;
mod error;
mod ingest;
mod streams;

use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
};

use axum::{extract::State, routing::get, Json, Router};
use ticklab_connectors_common::publish::{EventPublisher, NatsPublisher};
use tracing::info;

use crate::{
    config::Config,
    ingest::{IngestStats, SharedBooks, SharedStats},
};

#[derive(Clone)]
struct HealthState {
    config: Config,
    stats: SharedStats,
    books: SharedBooks,
}

async fn health(State(st): State<HealthState>) -> Json<serde_json::Value> {
    let stats: IngestStats = st.stats.lock().unwrap().clone();
    let symbols: Vec<String> = st.books.lock().unwrap().keys().cloned().collect();
    Json(serde_json::json!({
        "status": "ok",
        "exchange": crate::config::EXCHANGE,
        "configuredSymbols": st.config.symbols,
        "stats": {
            "frames": stats.frames,
            "events": stats.events,
            "dropped": stats.dropped,
            "reconnects": stats.reconnects,
            "lastError": stats.last_error,
        },
        "symbols": symbols,
    }))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = Config::from_env()?;
    let publisher = NatsPublisher::connect(&config.nats_url)
        .await
        .map_err(|e| crate::error::ConnectorError::Nats(e.to_string()))?;
    info!(nats = %config.nats_url, "connected to NATS");

    let books: SharedBooks = Arc::new(Mutex::new(HashMap::new()));
    let stats: SharedStats = Arc::new(Mutex::new(IngestStats::default()));
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel();

    // Publish task: drain the channel onto NATS. Errors are logged and the
    // task continues — downstream outages never propagate to ingestion.
    tokio::spawn(publish_task(publisher, rx));

    // Health endpoint (ops parity with gateway/jobs/market; measured stats).
    let health_state = HealthState {
        config: config.clone(),
        stats: stats.clone(),
        books: books.clone(),
    };
    let addr: SocketAddr = config.health_addr.parse()?;
    tokio::spawn(async move {
        let router = Router::new()
            .route("/health", get(health))
            .with_state(health_state);
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        info!(%addr, "health listening");
        axum::serve(listener, router).await.unwrap();
    });

    info!(exchange = crate::config::EXCHANGE, symbols = ?config.symbols, "starting ingest");
    tokio::select! {
        _ = crate::ingest::run_loop(config, books, tx, stats) => {},
        _ = tokio::signal::ctrl_c() => {
            info!("shutdown signal; exiting");
        }
    }
    Ok(())
}

async fn publish_task(publisher: NatsPublisher, mut rx: crate::ingest::OutboxRx) {
    use tracing::warn;
    while let Some((subject, ev)) = rx.recv().await {
        if let Err(e) = publisher.publish(&subject, &ev).await {
            warn!(?e, %subject, "NATS publish failed; event dropped (ingest unaffected)");
        }
    }
}
