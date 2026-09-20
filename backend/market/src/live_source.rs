//! Live NATS feed → snapshot store (`docs/06` §6.3 observability path).
//!
//! Subscribes to the connector's `market.{symbol}.depth|trades|ticker`
//! subjects, normalizes every message, and folds it into the shared
//! [`MarketStore`]. Batching for UI render rate happens here: subscribers are
//! told a symbol is dirty at most every [`BROADCAST_INTERVAL`] (`docs/06`
//! §6.3: coalesce exchange-rate deltas to ~30–60Hz visual updates).
//!
//! A dead NATS server never kills this task: it backs off and reconnects,
//! flipping `connected` so the REST layer can report "no data yet"
//! (`docs/14` §14.7) instead of fabricating a snapshot.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use futures::StreamExt;
use ticklab_connectors_common::{
    events::MarketEvent,
    normalize_symbol,
    snapshot::{MarketSnapshot, SymbolState},
};
use tracing::{error, info, warn};

use crate::normalize::normalize_event;

/// Max UI refresh cadence per symbol (~30Hz, `docs/06` §6.3).
/// Consumed via [`MarketStore::take_dirty`] by the Gateway market.* fan-out
/// (Phase 3/5.3); until then it is exercised by unit tests.
#[allow(dead_code)]
pub const BROADCAST_INTERVAL: Duration = Duration::from_millis(33);

/// NATS subject patterns consumed (must equal the connector's publishers).
pub const LIVE_SUBJECTS: [&str; 3] = ["market.*.depth", "market.*.trades", "market.*.ticker"];

/// Shared snapshot state: per-symbol book + tape + ticker.
#[derive(Debug, Default)]
pub struct MarketStore {
    symbols: HashMap<String, SymbolState>,
    dirty_since: HashMap<String, Instant>,
}

impl MarketStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Fold one event; returns the normalized symbol when state changed.
    pub fn apply(&mut self, mut ev: MarketEvent) -> Option<String> {
        let symbol = normalize_event(&mut ev).ok()?;
        let st = self
            .symbols
            .entry(symbol.clone())
            .or_insert_with(|| SymbolState::new(&ev.exchange.clone()));
        if ev.exchange != st.exchange {
            st.exchange.clone_from(&ev.exchange);
        }
        if st.apply(&ev) {
            self.dirty_since
                .entry(symbol.clone())
                .or_insert_with(Instant::now);
            Some(symbol)
        } else {
            None
        }
    }

    pub fn snapshot(&self, symbol: &str, depth: usize) -> Option<MarketSnapshot> {
        let symbol = normalize_symbol(symbol);
        self.symbols
            .get(&symbol)
            .map(|st| st.snapshot(&symbol, depth))
    }

    pub fn symbols(&self) -> Vec<String> {
        let mut out: Vec<String> = self.symbols.keys().cloned().collect();
        out.sort();
        out
    }

    /// True when `symbol` has unseen updates older than the broadcast cadence.
    /// Consumer: the Gateway market.* fan-out (Phase 3/5.3).
    #[allow(dead_code)]
    pub fn take_dirty(&mut self, symbol: &str, now: Instant) -> bool {
        let symbol = normalize_symbol(symbol);
        match self.dirty_since.get(&symbol) {
            Some(since) if now.duration_since(*since) >= BROADCAST_INTERVAL => {
                self.dirty_since.remove(&symbol);
                true
            }
            _ => false,
        }
    }
}

pub type SharedStore = Arc<Mutex<MarketStore>>;
pub type SharedConnected = Arc<AtomicBool>;

/// Deserialize + normalize + apply one raw NATS payload. Returns true when
/// snapshot state changed. Corrupt payloads are logged and skipped.
pub fn handle_bytes(store: &SharedStore, subject: &str, bytes: &[u8]) -> bool {
    let ev: MarketEvent = match serde_json::from_slice(bytes) {
        Ok(ev) => ev,
        Err(e) => {
            warn!(%subject, ?e, "dropping undecodable market payload");
            return false;
        }
    };
    match store.lock().unwrap().apply(ev) {
        Some(_) => true,
        None => {
            warn!(%subject, "dropping inapplicable market event");
            false
        }
    }
}

/// Subscribe forever; reconnects with backoff, tracking liveness in
/// `connected` so REST serves "no data yet" instead of stale snapshots.
pub async fn run(nats_url: String, store: SharedStore, connected: SharedConnected) {
    let mut backoff = Duration::from_secs(1);
    loop {
        match subscribe_once(&nats_url, &store, &connected).await {
            Ok(()) => warn!("NATS subscription ended; reconnecting"),
            Err(e) => error!(?e, "NATS error; reconnecting"),
        }
        connected.store(false, Ordering::SeqCst);
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(Duration::from_secs(30));
    }
}

async fn subscribe_once(
    nats_url: &str,
    store: &SharedStore,
    connected: &SharedConnected,
) -> Result<(), String> {
    let client = async_nats::connect(nats_url)
        .await
        .map_err(|e| e.to_string())?;
    let mut subs = Vec::with_capacity(LIVE_SUBJECTS.len());
    for pattern in LIVE_SUBJECTS {
        subs.push(
            client
                .subscribe(pattern.to_string())
                .await
                .map_err(|e| e.to_string())?,
        );
    }
    connected.store(true, Ordering::SeqCst);
    info!(subjects = ?LIVE_SUBJECTS, "market subscribed to live feed");
    // Whichever subject delivers next wins; a quiet subject never starves
    // the others.
    let [mut depth, mut trades, mut ticker] = subs
        .into_iter()
        .collect::<Vec<_>>()
        .try_into()
        .map_err(|_| "expected three live subscriptions".to_string())?;
    loop {
        tokio::select! {
            msg = depth.next() => {
                match msg {
                    Some(m) => { handle_bytes(store, m.subject.as_ref(), &m.payload); }
                    None => return Ok(()),
                }
            }
            msg = trades.next() => {
                match msg {
                    Some(m) => { handle_bytes(store, m.subject.as_ref(), &m.payload); }
                    None => return Ok(()),
                }
            }
            msg = ticker.next() => {
                match msg {
                    Some(m) => { handle_bytes(store, m.subject.as_ref(), &m.payload); }
                    None => return Ok(()),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ticklab_connectors_common::{events::Side, snapshot::DEFAULT_BOOK_DEPTH};

    fn trade_json() -> Vec<u8> {
        serde_json::json!({
            "timestampNs": 1_700_000_000_000_000_000_i64,
            "symbol": "BTCUSDT",
            "exchange": "binance-futures",
            "type": "trade",
            "side": "bid",
            "price": 100.0,
            "size": 0.5,
            "sequence": 7
        })
        .to_string()
        .into_bytes()
    }

    #[test]
    fn valid_payload_applies_and_snapshot_serves() {
        let store: SharedStore = Arc::new(Mutex::new(MarketStore::new()));
        assert!(handle_bytes(&store, "market.btcusdt.trades", &trade_json()));
        let snap = store
            .lock()
            .unwrap()
            .snapshot("BTCUSDT", DEFAULT_BOOK_DEPTH)
            .unwrap();
        assert_eq!(snap.symbol, "btcusdt");
        assert_eq!(snap.trades.len(), 1);
        assert_eq!(snap.trades[0].side, Side::Bid);
        // Case-insensitive lookup (Planner-flagged assumption).
        assert!(store.lock().unwrap().snapshot("btcusdt", 5).is_some());
    }

    #[test]
    fn corrupt_payloads_skipped_never_fatal() {
        let store: SharedStore = Arc::new(Mutex::new(MarketStore::new()));
        assert!(!handle_bytes(&store, "market.btcusdt.trades", b"not json"));
        assert!(!handle_bytes(
            &store,
            "market.btcusdt.trades",
            br#"{"timestampNs":0,"symbol":"","exchange":"","type":"trade"}"#
        ));
        assert!(store.lock().unwrap().symbols().is_empty());
    }

    #[test]
    fn dirty_flag_throttles_to_broadcast_cadence() {
        let store: SharedStore = Arc::new(Mutex::new(MarketStore::new()));
        assert!(handle_bytes(&store, "market.btcusdt.trades", &trade_json()));
        let t0 = Instant::now();
        {
            let mut st = store.lock().unwrap();
            assert!(!st.take_dirty("btcusdt", t0));
            // Backdate past the cadence → fires once, then quiet.
            st.dirty_since.insert(
                "btcusdt".to_string(),
                t0 - BROADCAST_INTERVAL - Duration::from_millis(1),
            );
            assert!(st.take_dirty("btcusdt", t0));
            assert!(!st.take_dirty("btcusdt", t0));
        }
    }

    #[test]
    fn unknown_symbol_snapshots_none_not_fabricated() {
        let store: SharedStore = Arc::new(Mutex::new(MarketStore::new()));
        assert!(store.lock().unwrap().snapshot("ethusdt", 5).is_none());
    }
}
