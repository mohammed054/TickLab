//! Exchange read loop (`docs/06` §6.2–§6.3).
//!
//! Owns the WebSocket session, maintains local order-book state, and hands
//! normalized events to the publish task through an unbounded channel. The
//! read loop **never blocks on publish**: a slow/broken downstream only
//! increments `dropped` and logs — it can never stall the exchange feed
//! (the §6.3 zero-effect rule).

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use futures::{SinkExt, StreamExt};
use ticklab_connectors_common::{
    book::TopBook,
    events::{MarketEvent, MarketEventType},
    subjects::{depth_subject, ticker_subject, trades_subject},
};
use tokio::sync::mpsc::UnboundedSender;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{error, info, warn};

use crate::{config::Config, error::ConnectorError};

/// Hot-path counters (surfaced on `/health`; measured values only, never
/// placeholders — `docs/06` §6.5).
#[derive(Clone, Debug, Default)]
pub struct IngestStats {
    pub frames: u64,
    pub events: u64,
    pub dropped: u64,
    pub reconnects: u64,
    pub last_error: Option<String>,
}

pub type SharedBooks = Arc<Mutex<HashMap<String, TopBook>>>;
pub type SharedStats = Arc<Mutex<IngestStats>>;
/// Normalized outbox: `(NATS subject, event)` handed to the publish task.
pub type OutboxTx = UnboundedSender<(String, MarketEvent)>;
pub type OutboxRx = tokio::sync::mpsc::UnboundedReceiver<(String, MarketEvent)>;

/// Levels retained per side relative to the served book depth: deep levels
/// that can never enter a snapshot are pruned so a days-long connection
/// cannot grow memory without bound.
pub const PRUNE_FACTOR: usize = 10;

fn subject_for(ev: &MarketEvent) -> String {
    match ev.event_type {
        MarketEventType::BookUpdate | MarketEventType::Snapshot => depth_subject(&ev.symbol),
        MarketEventType::Trade => trades_subject(&ev.symbol),
        MarketEventType::Ticker | MarketEventType::Funding | MarketEventType::Liquidation => {
            ticker_subject(&ev.symbol)
        }
    }
}

/// Apply one parsed frame: fold deltas into the local book, then hand every
/// normalized event to the publish task without waiting.
pub fn handle_frame(
    frame: crate::streams::Frame,
    books: &SharedBooks,
    tx: &OutboxTx,
    stats: &SharedStats,
    keep_per_side: usize,
) {
    if !frame.deltas.is_empty() {
        let mut books = books.lock().unwrap();
        let book = books.entry(frame.symbol.clone()).or_default();
        for (is_bid, px, qty) in frame.deltas {
            book.apply_delta(is_bid, px, qty);
        }
        if let Some(seq) = frame.sequence {
            book.set_sequence(seq);
        }
        book.prune(keep_per_side);
    }
    let mut st = stats.lock().unwrap();
    st.frames += 1;
    for ev in frame.events {
        st.events += 1;
        let subject = subject_for(&ev);
        if tx.send((subject, ev)).is_err() {
            st.dropped += 1;
            warn!("publish task gone; dropping live event (downstream has zero effect on ingest)");
            break;
        }
    }
}

async fn connect_once(
    cfg: &Config,
    books: SharedBooks,
    tx: OutboxTx,
    stats: SharedStats,
) -> Result<(), ConnectorError> {
    let keep_per_side = cfg.book_depth.saturating_mul(PRUNE_FACTOR).max(1);
    let url = cfg.combined_url();
    info!(%url, symbols = ?cfg.symbols, "connecting to exchange stream");
    let (ws, _) = connect_async(&url)
        .await
        .map_err(|e| ConnectorError::WebSocket(e.to_string()))?;
    let (mut write, mut read) = ws.split();
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => match crate::streams::parse_frame(&text) {
                Ok(frame) => handle_frame(frame, &books, &tx, &stats, keep_per_side),
                Err(e) => {
                    // Rejected frames (private streams, unsupported kinds,
                    // malformed payloads) are logged, never fatal.
                    warn!(?e, "rejected exchange frame");
                }
            },
            Ok(Message::Ping(data)) => {
                if write.send(Message::Pong(data)).await.is_err() {
                    break;
                }
            }
            Ok(Message::Close(frame)) => {
                warn!(?frame, "exchange closed the stream");
                break;
            }
            Ok(_) => {}
            Err(e) => {
                return Err(ConnectorError::WebSocket(e.to_string()));
            }
        }
    }
    Ok(())
}

/// Reconnect forever with exponential backoff (1s → 30s cap). Only shutdown
/// (via the caller's `select!`) stops this loop.
pub async fn run_loop(cfg: Config, books: SharedBooks, tx: OutboxTx, stats: SharedStats) {
    let mut backoff = Duration::from_secs(1);
    loop {
        match connect_once(&cfg, books.clone(), tx.clone(), stats.clone()).await {
            Ok(()) => warn!("stream ended; reconnecting"),
            Err(e) => {
                error!(?e, "stream error; reconnecting");
                stats.lock().unwrap().last_error = Some(e.to_string());
            }
        }
        stats.lock().unwrap().reconnects += 1;
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(Duration::from_secs(30));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::streams::parse_frame;

    struct Fixture {
        books: SharedBooks,
        rx: OutboxRx,
        tx: OutboxTx,
        stats: SharedStats,
    }

    fn setup() -> Fixture {
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        Fixture {
            books: Arc::new(Mutex::new(HashMap::new())),
            rx,
            tx,
            stats: Arc::new(Mutex::new(IngestStats::default())),
        }
    }

    #[test]
    fn depth_frame_updates_book_and_routes_to_depth_subject() {
        let Fixture {
            books,
            mut rx,
            tx,
            stats,
        } = setup();
        let frame = parse_frame(r#"{"stream":"btcusdt@depth@100ms","data":{"e":"depthUpdate","E":1,"T":2,"s":"BTCUSDT","U":1,"u":9,"pu":0,"b":[["100.0","1.0"]],"a":[["101.0","2.0"]]}}"#).unwrap();
        handle_frame(frame, &books, &tx, &stats, 250);
        let book = books.lock().unwrap();
        assert_eq!(book["btcusdt"].sequence, Some(9));
        let (bids, asks) = book["btcusdt"].snapshot(5);
        assert_eq!(bids[0].price, 100.0);
        assert_eq!(asks[0].price, 101.0);
        drop(book);
        let st = stats.lock().unwrap();
        assert_eq!(st.frames, 1);
        assert_eq!(st.events, 2);
        assert_eq!(st.dropped, 0);
        drop(st);
        let (s1, _) = rx.try_recv().unwrap();
        let (s2, _) = rx.try_recv().unwrap();
        assert_eq!(s1, "market.btcusdt.depth");
        assert_eq!(s2, "market.btcusdt.depth");
    }

    #[test]
    fn trade_routes_to_trades_subject() {
        let Fixture {
            books,
            mut rx,
            tx,
            stats,
        } = setup();
        let frame = parse_frame(r#"{"stream":"btcusdt@trade","data":{"e":"trade","E":1,"T":2,"s":"BTCUSDT","t":3,"p":"100.0","q":"0.5","m":false,"X":"MARKET"}}"#).unwrap();
        handle_frame(frame, &books, &tx, &stats, 250);
        let (subject, ev) = rx.try_recv().unwrap();
        assert_eq!(subject, "market.btcusdt.trades");
        assert_eq!(ev.event_type, MarketEventType::Trade);
        // Trades never touch the book.
        assert!(books.lock().unwrap().get("btcusdt").is_none());
    }

    #[test]
    fn closed_publish_channel_counts_dropped_never_panics() {
        let books: SharedBooks = Arc::new(Mutex::new(HashMap::new()));
        let stats: SharedStats = Arc::new(Mutex::new(IngestStats::default()));
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<(String, MarketEvent)>();
        drop(rx);
        let frame = parse_frame(r#"{"stream":"btcusdt@ticker","data":{"e":"24hrTicker","E":1,"s":"BTCUSDT","c":"100.0"}}"#).unwrap();
        handle_frame(frame, &books, &tx, &stats, 250);
        assert_eq!(stats.lock().unwrap().dropped, 1);
    }
}
