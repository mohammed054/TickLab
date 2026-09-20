//! Publish-and-forget event bus (`docs/06` §6.3).
//!
//! "The Connector/Live Bot publish-and-forget onto NATS; they never wait for
//! an acknowledgment from anything downstream. A slow or disconnected frontend
//! client has **zero** effect on trading." Implementations of [`EventPublisher`]
//! therefore await at most the local client buffer flush — never a server
//! round-trip — and callers must never block the exchange read loop on publish.

use std::sync::Mutex;

use thiserror::Error;

use crate::events::MarketEvent;

/// Publish errors are transport-local only (never a downstream ack).
#[derive(Debug, Error)]
pub enum PublishError {
    #[error("serialize: {0}")]
    Serialize(String),
    #[error("transport: {0}")]
    Transport(String),
}

/// Fire-and-forget sink for normalized events.
pub trait EventPublisher: Send + Sync {
    /// Publish one event. Must return once the message is handed to the local
    /// client buffer; must not wait for subscribers.
    fn publish(
        &self,
        subject: &str,
        event: &MarketEvent,
    ) -> impl std::future::Future<Output = Result<(), PublishError>> + Send;
}

/// NATS publisher (`docs/03` §3.1 bus). `NATS_URL` comes from the environment
/// (`nats://nats:4222` in compose, `NATS_URL` env locally).
pub struct NatsPublisher {
    client: async_nats::Client,
}

impl NatsPublisher {
    pub async fn connect(url: &str) -> Result<Self, PublishError> {
        let client = async_nats::connect(url)
            .await
            .map_err(|e| PublishError::Transport(e.to_string()))?;
        Ok(Self { client })
    }

    pub fn client(&self) -> &async_nats::Client {
        &self.client
    }
}

impl EventPublisher for NatsPublisher {
    async fn publish(&self, subject: &str, event: &MarketEvent) -> Result<(), PublishError> {
        let bytes =
            serde_json::to_vec(event).map_err(|e| PublishError::Serialize(e.to_string()))?;
        self.client
            .publish(subject.to_string(), bytes.into())
            .await
            .map_err(|e| PublishError::Transport(e.to_string()))
    }
}

/// Hermetic in-memory publisher for tests (no NATS server needed).
#[derive(Debug, Default)]
pub struct InMemoryPublisher {
    pub outbox: Mutex<Vec<(String, MarketEvent)>>,
}

impl InMemoryPublisher {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn published(&self) -> Vec<(String, MarketEvent)> {
        self.outbox.lock().unwrap().clone()
    }
}

impl EventPublisher for InMemoryPublisher {
    async fn publish(&self, subject: &str, event: &MarketEvent) -> Result<(), PublishError> {
        self.outbox
            .lock()
            .unwrap()
            .push((subject.to_string(), event.clone()));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::MarketEventType;

    fn ev() -> MarketEvent {
        MarketEvent {
            timestamp_ns: 1,
            symbol: "btcusdt".to_string(),
            exchange: "binance-futures".to_string(),
            event_type: MarketEventType::Ticker,
            side: None,
            price: Some(1.0),
            size: None,
            sequence: None,
            funding_rate: None,
            next_funding_time: None,
            open_interest: None,
            mark_price: None,
            index_price: None,
            basis: None,
        }
    }

    #[tokio::test]
    async fn in_memory_publisher_records_subject_and_event() {
        let p = InMemoryPublisher::new();
        p.publish("market.btcusdt.ticker", &ev()).await.unwrap();
        let out = p.published();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].0, "market.btcusdt.ticker");
        assert_eq!(out[0].1.side, None);
    }

    #[test]
    fn _no_order_entry_types_exist() {
        // Compile-time guard for the Block 5.1 read-only bar: this crate must
        // not grow order/submit/cancel vocabulary. If any ever appears, this
        // test's include_str scan fails loudly.
        // NOTE: publish.rs itself is excluded: the forbidden-word list below
        // lives in this file, so scanning it would always match.
        let src = concat!(
            include_str!("events.rs"),
            include_str!("subjects.rs"),
            include_str!("book.rs"),
            include_str!("snapshot.rs"),
            include_str!("lib.rs"),
        )
        .to_lowercase();
        for word in [
            "submit_order",
            "cancel_order",
            "amend",
            "place_order",
            "api_key",
            "secret",
        ] {
            assert!(
                !src.contains(word),
                "read-only violation: {word} must not appear in connectors-common"
            );
        }
    }
}
