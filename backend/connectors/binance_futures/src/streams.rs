//! Binance Futures public-stream parsing → normalized [`MarketEvent`].
//!
//! Mirrors the upstream `hftbacktest` `connector/` message shapes for the
//! market-data streams we reuse (`depthUpdate`, `trade`; see
//! `engine/vendor/hftbacktest/connector/src/binancefutures/msg/stream.rs`).
//! Order/private streams (`ORDER_TRADE_UPDATE`, `ACCOUNT_UPDATE`, user-data)
//! are rejected: this process is read-only (Block 5.1).
//!
//! Trade side follows upstream: `m == true` means the buyer was the market
//! maker, i.e. the aggressor sold → `ask`.

use serde::Deserialize;
use ticklab_connectors_common::{
    events::{MarketEvent, MarketEventType, Side},
    normalize_symbol,
};

use crate::{config::EXCHANGE, error::ConnectorError};

/// Combined-stream envelope: `{"stream":"…","data":{…}}`.
#[derive(Debug, Deserialize)]
struct Envelope {
    data: Payload,
}

/// Public market-data payloads only.
#[derive(Debug, Deserialize)]
#[serde(tag = "e")]
enum Payload {
    #[serde(rename = "depthUpdate")]
    DepthUpdate(DepthUpdate),
    #[serde(rename = "trade")]
    Trade(Trade),
    #[serde(rename = "24hrTicker")]
    Ticker(Ticker),
}

#[derive(Debug, Deserialize)]
struct DepthUpdate {
    #[serde(rename = "T")]
    transaction_ms: i64,
    #[serde(rename = "s")]
    symbol: String,
    #[serde(rename = "u")]
    last_update_id: i64,
    #[serde(rename = "b")]
    bids: Vec<[String; 2]>,
    #[serde(rename = "a")]
    asks: Vec<[String; 2]>,
}

#[derive(Debug, Deserialize)]
struct Trade {
    #[serde(rename = "T")]
    transaction_ms: i64,
    #[serde(rename = "s")]
    symbol: String,
    #[serde(rename = "t")]
    trade_id: i64,
    #[serde(rename = "p")]
    price: String,
    #[serde(rename = "q")]
    qty: String,
    #[serde(rename = "m")]
    buyer_is_maker: bool,
    #[serde(rename = "X", default)]
    kind: String,
}

#[derive(Debug, Deserialize)]
struct Ticker {
    #[serde(rename = "E")]
    event_ms: i64,
    #[serde(rename = "s")]
    symbol: String,
    #[serde(rename = "c")]
    last_price: String,
}

/// One parsed frame: normalized events plus the book deltas to apply.
/// Deltas are `(is_bid, price, qty)`; `qty == 0.0` removes the level.
pub struct Frame {
    pub symbol: String,
    pub events: Vec<MarketEvent>,
    pub deltas: Vec<(bool, f64, f64)>,
    pub sequence: Option<i64>,
}

fn parse_px_qty(raw: &[String; 2]) -> Result<(f64, f64), ConnectorError> {
    let px: f64 = raw[0]
        .parse()
        .map_err(|_| ConnectorError::Decode(format!("bad price {:?}", raw[0])))?;
    let qty: f64 = raw[1]
        .parse()
        .map_err(|_| ConnectorError::Decode(format!("bad qty {:?}", raw[1])))?;
    Ok((px, qty))
}

/// Parse one raw WS text frame. Unknown/private event types are rejected
/// (read-only bar), never silently swallowed into the book.
pub fn parse_frame(text: &str) -> Result<Frame, ConnectorError> {
    let env: Envelope =
        serde_json::from_str(text).map_err(|e| ConnectorError::Decode(e.to_string()))?;
    match env.data {
        Payload::DepthUpdate(d) => {
            let symbol = normalize_symbol(&d.symbol);
            let ts = MarketEvent::ms_to_ns(d.transaction_ms);
            let mut events = Vec::with_capacity(d.bids.len() + d.asks.len());
            let mut deltas = Vec::with_capacity(d.bids.len() + d.asks.len());
            for (raw, is_bid) in d
                .bids
                .iter()
                .map(|r| (r, true))
                .chain(d.asks.iter().map(|r| (r, false)))
            {
                let (px, qty) = parse_px_qty(raw)?;
                deltas.push((is_bid, px, qty));
                events.push(MarketEvent {
                    timestamp_ns: ts,
                    symbol: symbol.clone(),
                    exchange: EXCHANGE.to_string(),
                    event_type: MarketEventType::BookUpdate,
                    side: Some(if is_bid { Side::Bid } else { Side::Ask }),
                    price: Some(px),
                    size: Some(qty),
                    sequence: Some(d.last_update_id),
                    funding_rate: None,
                    next_funding_time: None,
                    open_interest: None,
                    mark_price: None,
                    index_price: None,
                    basis: None,
                });
            }
            Ok(Frame {
                symbol,
                events,
                deltas,
                sequence: Some(d.last_update_id),
            })
        }
        Payload::Trade(t) => {
            // Upstream skips non-MARKET trade types (see
            // `market_data_stream.rs`); mirror that here.
            if !t.kind.is_empty() && t.kind != "MARKET" {
                return Err(ConnectorError::Decode(format!(
                    "unsupported trade kind {}",
                    t.kind
                )));
            }
            let price: f64 = t
                .price
                .parse()
                .map_err(|_| ConnectorError::Decode("bad trade price".to_string()))?;
            let qty: f64 = t
                .qty
                .parse()
                .map_err(|_| ConnectorError::Decode("bad trade qty".to_string()))?;
            let symbol = normalize_symbol(&t.symbol);
            let side = if t.buyer_is_maker {
                Side::Ask
            } else {
                Side::Bid
            };
            let ev = MarketEvent {
                timestamp_ns: MarketEvent::ms_to_ns(t.transaction_ms),
                symbol: symbol.clone(),
                exchange: EXCHANGE.to_string(),
                event_type: MarketEventType::Trade,
                side: Some(side),
                price: Some(price),
                size: Some(qty),
                sequence: Some(t.trade_id),
                funding_rate: None,
                next_funding_time: None,
                open_interest: None,
                mark_price: None,
                index_price: None,
                basis: None,
            };
            Ok(Frame {
                symbol,
                events: vec![ev],
                deltas: vec![],
                sequence: Some(t.trade_id),
            })
        }
        Payload::Ticker(t) => {
            let price: f64 = t
                .last_price
                .parse()
                .map_err(|_| ConnectorError::Decode("bad ticker price".to_string()))?;
            let symbol = normalize_symbol(&t.symbol);
            let ev = MarketEvent {
                timestamp_ns: MarketEvent::ms_to_ns(t.event_ms),
                symbol: symbol.clone(),
                exchange: EXCHANGE.to_string(),
                event_type: MarketEventType::Ticker,
                side: None,
                price: Some(price),
                size: None,
                sequence: None,
                funding_rate: None,
                next_funding_time: None,
                open_interest: None,
                mark_price: None,
                index_price: None,
                basis: None,
            };
            Ok(Frame {
                symbol,
                events: vec![ev],
                deltas: vec![],
                sequence: None,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depth_update_maps_to_book_updates_with_ns_timestamps() {
        let text = r#"{"stream":"btcusdt@depth@100ms","data":{"e":"depthUpdate","E":1737400000000,"T":1737400000001,"s":"BTCUSDT","U":1,"u":2,"pu":0,"b":[["97500.5","0.01"]],"a":[["97501.0","0.02"]]}}"#;
        let frame = parse_frame(text).unwrap();
        assert_eq!(frame.symbol, "btcusdt");
        assert_eq!(frame.sequence, Some(2));
        assert_eq!(frame.events.len(), 2);
        assert_eq!(frame.deltas.len(), 2);
        let bid = &frame.events[0];
        assert_eq!(bid.event_type, MarketEventType::BookUpdate);
        assert_eq!(bid.side, Some(Side::Bid));
        assert_eq!(bid.price, Some(97500.5));
        assert_eq!(bid.timestamp_ns, 1_737_400_000_001_000_000);
        let v = serde_json::to_value(bid).unwrap();
        assert_eq!(v["exchange"], "binance-futures");
        assert_eq!(v["type"], "book_update");
    }

    #[test]
    fn trade_side_follows_buyer_is_maker() {
        let maker_buy = r#"{"stream":"btcusdt@trade","data":{"e":"trade","E":1,"T":2,"s":"BTCUSDT","t":7,"p":"97500.0","q":"0.01","m":true,"X":"MARKET"}}"#;
        let f = parse_frame(maker_buy).unwrap();
        assert_eq!(f.events[0].side, Some(Side::Ask));
        assert_eq!(f.events[0].sequence, Some(7));

        let taker_buy = r#"{"stream":"btcusdt@trade","data":{"e":"trade","E":1,"T":2,"s":"BTCUSDT","t":8,"p":"97501.0","q":"0.02","m":false,"X":"MARKET"}}"#;
        let f = parse_frame(taker_buy).unwrap();
        assert_eq!(f.events[0].side, Some(Side::Bid));
    }

    #[test]
    fn ticker_maps_last_price() {
        let text = r#"{"stream":"btcusdt@ticker","data":{"e":"24hrTicker","E":1737400000000,"s":"BTCUSDT","c":"97500.5"}}"#;
        let f = parse_frame(text).unwrap();
        assert_eq!(f.events.len(), 1);
        assert_eq!(f.events[0].event_type, MarketEventType::Ticker);
        assert_eq!(f.events[0].price, Some(97500.5));
        assert!(f.deltas.is_empty());
    }

    #[test]
    fn private_streams_rejected_not_swallowed() {
        // ORDER_TRADE_UPDATE / ACCOUNT_UPDATE must never reach the book.
        let text = r#"{"stream":"listenKey","data":{"e":"ORDER_TRADE_UPDATE","E":1,"T":2,"o":{"s":"BTCUSDT"}}}"#;
        assert!(parse_frame(text).is_err());
    }

    #[test]
    fn malformed_frames_rejected_with_typed_error() {
        assert!(parse_frame("not json").is_err());
        assert!(parse_frame(r#"{"stream":"x","data":{"e":"depthUpdate"}}"#).is_err());
    }
}
