//! Snapshot types for reconnect/late-subscriber catch-up (`docs/06` §6.3:
//! "If the frontend disconnects and reconnects, it re-syncs from the Redis
//! snapshot (current book + recent trade tape + current strategy state)").
//!
//! The Market Data Service holds these in memory (same shape the Redis cache
//! will persist at scale-out); field names follow the `docs/15` §15.5
//! camelCase convention.

use std::collections::VecDeque;

use serde::{Deserialize, Serialize};

use crate::{
    book::{Level, TopBook},
    events::{MarketEvent, MarketEventType, Side},
};

/// Cap on the retained recent-trade tape per symbol (transport guard).
pub const MAX_TAPE_LEN: usize = 200;

/// Default book depth served in snapshots (top-N, `docs/06` §6.3).
pub const DEFAULT_BOOK_DEPTH: usize = 25;

/// One recent trade print.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradePrint {
    pub timestamp_ns: i64,
    pub price: f64,
    pub size: f64,
    pub side: Side,
}

/// Latest ticker state.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TickerState {
    pub timestamp_ns: i64,
    pub price: f64,
}

/// Full per-symbol snapshot served for catch-up.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSnapshot {
    pub symbol: String,
    pub exchange: String,
    pub timestamp_ns: i64,
    /// Highest sequence applied, if any exchange sequencing was observed.
    pub sequence: Option<i64>,
    pub bids: Vec<LevelSer>,
    pub asks: Vec<LevelSer>,
    pub trades: Vec<TradePrint>,
    pub ticker: Option<TickerState>,
}

/// Serializable price level (`[price, size]` pairs would save bytes, but named
/// fields stay greppable against the spec).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelSer {
    pub price: f64,
    pub size: f64,
}

impl From<Level> for LevelSer {
    fn from(l: Level) -> Self {
        Self {
            price: l.price,
            size: l.qty,
        }
    }
}

/// Mutable per-symbol state behind a snapshot.
#[derive(Clone, Debug, Default)]
pub struct SymbolState {
    pub exchange: String,
    pub book: TopBook,
    pub tape: VecDeque<TradePrint>,
    pub ticker: Option<TickerState>,
    pub last_timestamp_ns: i64,
}

impl SymbolState {
    pub fn new(exchange: &str) -> Self {
        Self {
            exchange: exchange.to_string(),
            ..Default::default()
        }
    }

    /// Fold one normalized event into state. Returns false for events that
    /// carry no state for the snapshot (funding/liquidation travel on their
    /// own subjects untouched).
    pub fn apply(&mut self, ev: &MarketEvent) -> bool {
        self.last_timestamp_ns = self.last_timestamp_ns.max(ev.timestamp_ns);
        match ev.event_type {
            MarketEventType::BookUpdate => {
                let (Some(side), Some(price), Some(size)) = (ev.side, ev.price, ev.size) else {
                    return false;
                };
                self.book.apply_delta(side == Side::Bid, price, size);
                if let Some(seq) = ev.sequence {
                    self.book.set_sequence(seq);
                }
                true
            }
            MarketEventType::Trade => {
                let (Some(side), Some(price), Some(size)) = (ev.side, ev.price, ev.size) else {
                    return false;
                };
                self.tape.push_back(TradePrint {
                    timestamp_ns: ev.timestamp_ns,
                    price,
                    size,
                    side,
                });
                while self.tape.len() > MAX_TAPE_LEN {
                    self.tape.pop_front();
                }
                true
            }
            MarketEventType::Ticker => {
                if let Some(price) = ev.price {
                    self.ticker = Some(TickerState {
                        timestamp_ns: ev.timestamp_ns,
                        price,
                    });
                    true
                } else {
                    false
                }
            }
            MarketEventType::Snapshot => {
                // A snapshot event replaces book state wholesale when it
                // carries levels encoded as one book_update per level is not
                // available; without level detail there is nothing to apply.
                false
            }
            MarketEventType::Funding | MarketEventType::Liquidation => false,
        }
    }

    pub fn snapshot(&self, symbol: &str, depth: usize) -> MarketSnapshot {
        let (bids, asks) = self.book.snapshot(depth);
        MarketSnapshot {
            symbol: symbol.to_string(),
            exchange: self.exchange.clone(),
            timestamp_ns: self.last_timestamp_ns,
            sequence: self.book.sequence,
            bids: bids.into_iter().map(LevelSer::from).collect(),
            asks: asks.into_iter().map(LevelSer::from).collect(),
            trades: self.tape.iter().cloned().collect(),
            ticker: self.ticker.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn trade(ts: i64, price: f64, size: f64, side: Side) -> MarketEvent {
        MarketEvent {
            timestamp_ns: ts,
            symbol: "btcusdt".to_string(),
            exchange: "binance-futures".to_string(),
            event_type: MarketEventType::Trade,
            side: Some(side),
            price: Some(price),
            size: Some(size),
            sequence: None,
            funding_rate: None,
            next_funding_time: None,
            open_interest: None,
            mark_price: None,
            index_price: None,
            basis: None,
        }
    }

    #[test]
    fn tape_is_capped_and_ordered() {
        let mut st = SymbolState::new("binance-futures");
        for i in 0..(MAX_TAPE_LEN + 10) {
            assert!(st.apply(&trade(i as i64, 100.0 + i as f64, 0.01, Side::Bid)));
        }
        let snap = st.snapshot("btcusdt", 5);
        assert_eq!(snap.trades.len(), MAX_TAPE_LEN);
        assert_eq!(
            snap.trades.last().unwrap().price,
            100.0 + (MAX_TAPE_LEN + 9) as f64
        );
        assert_eq!(snap.timestamp_ns, (MAX_TAPE_LEN + 9) as i64);
    }

    #[test]
    fn snapshot_field_names_camel_case() {
        let st = SymbolState::new("binance-futures");
        let snap = st.snapshot("btcusdt", 5);
        let v = serde_json::to_value(&snap).unwrap();
        for key in [
            "symbol",
            "exchange",
            "timestampNs",
            "sequence",
            "bids",
            "asks",
            "trades",
            "ticker",
        ] {
            assert!(v.get(key).is_some(), "missing {key}");
        }
    }

    #[test]
    fn funding_events_do_not_pollute_snapshot() {
        let mut st = SymbolState::new("binance-futures");
        let mut ev = trade(1, 100.0, 0.01, Side::Ask);
        ev.event_type = MarketEventType::Funding;
        ev.funding_rate = Some(0.0001);
        assert!(!st.apply(&ev));
        assert_eq!(st.snapshot("btcusdt", 5).trades.len(), 0);
    }
}
