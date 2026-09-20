//! Normalized market event (`docs/15` §15.5 `MarketEvent`, shared by the live,
//! paper, and replay sources per `docs/06` §6.4).
//!
//! Field names match the spec interface literally (camelCase, `AGENTS.md` §2).
//! All timestamps are nanosecond-precision epoch integers (`docs/15` §15.1).

use serde::{Deserialize, Serialize};

/// `MarketEvent.type` (`docs/15` §15.5).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MarketEventType {
    BookUpdate,
    Trade,
    Snapshot,
    Ticker,
    Funding,
    Liquidation,
}

/// `MarketEvent.side` (`docs/15` §15.5).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Bid,
    Ask,
}

/// Normalized market event, shared by live, paper, and replay sources
/// (`docs/06` §6.4). Verbatim field set from `docs/15` §15.5 — no more, no
/// less. In particular there is deliberately **no** order-entry content here.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketEvent {
    /// Nanosecond-precision epoch (`docs/15` §15.1).
    pub timestamp_ns: i64,
    /// Exchange-native symbol, lowercase-normalized (`normalize_symbol`).
    pub symbol: String,
    /// Exchange id, e.g. `binance-futures`.
    pub exchange: String,
    /// Event kind (`docs/15` §15.5).
    #[serde(rename = "type")]
    pub event_type: MarketEventType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side: Option<Side>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence: Option<i64>,
    // Derivatives-only fields (docs/14 §14.12, via docs/15 §15.5).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub funding_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_funding_time: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open_interest: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mark_price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index_price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub basis: Option<f64>,
}

impl MarketEvent {
    /// Millisecond epoch (exchange-native, e.g. Binance `T`/`E`) → ns.
    pub fn ms_to_ns(ms: i64) -> i64 {
        ms.saturating_mul(1_000_000)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_names_match_spec_literally() {
        let ev = MarketEvent {
            timestamp_ns: 1_737_400_000_123_456_789,
            symbol: "btcusdt".to_string(),
            exchange: "binance-futures".to_string(),
            event_type: MarketEventType::Trade,
            side: Some(Side::Ask),
            price: Some(97_500.5),
            size: Some(0.01),
            sequence: Some(42),
            funding_rate: None,
            next_funding_time: None,
            open_interest: None,
            mark_price: None,
            index_price: None,
            basis: None,
        };
        let v = serde_json::to_value(&ev).unwrap();
        // Exact §15.5 names present…
        for key in [
            "timestampNs",
            "symbol",
            "exchange",
            "type",
            "side",
            "price",
            "size",
            "sequence",
        ] {
            assert!(v.get(key).is_some(), "missing field {key}");
        }
        // …with exact §15.5 values, and absent optionals omitted.
        assert_eq!(v["type"], "trade");
        assert_eq!(v["side"], "ask");
        assert!(v.get("fundingRate").is_none());
        assert!(v.get("markPrice").is_none());
    }

    #[test]
    fn event_type_strings_match_spec() {
        let cases = [
            (MarketEventType::BookUpdate, "book_update"),
            (MarketEventType::Trade, "trade"),
            (MarketEventType::Snapshot, "snapshot"),
            (MarketEventType::Ticker, "ticker"),
            (MarketEventType::Funding, "funding"),
            (MarketEventType::Liquidation, "liquidation"),
        ];
        for (ty, s) in cases {
            let v = serde_json::to_value(ty).unwrap();
            assert_eq!(v, s);
        }
    }

    #[test]
    fn derivatives_fields_round_trip() {
        let json = serde_json::json!({
            "timestampNs": 1_700_000_000_000_000_000_i64,
            "symbol": "btcusdt",
            "exchange": "binance-futures",
            "type": "ticker",
            "price": 97500.0,
            "fundingRate": 0.0001,
            "nextFundingTime": 1_700_002_800_000_000_000_i64,
            "openInterest": 12345.5,
            "markPrice": 97501.0,
            "indexPrice": 97499.0,
            "basis": 2.0
        });
        let ev: MarketEvent = serde_json::from_value(json).unwrap();
        assert_eq!(ev.funding_rate, Some(0.0001));
        assert_eq!(ev.next_funding_time, Some(1_700_002_800_000_000_000));
        assert_eq!(ev.open_interest, Some(12345.5));
        assert_eq!(ev.mark_price, Some(97501.0));
        assert_eq!(ev.index_price, Some(97499.0));
        assert_eq!(ev.basis, Some(2.0));
    }

    #[test]
    fn ms_to_ns_saturates() {
        assert_eq!(
            MarketEvent::ms_to_ns(1_737_400_000_123),
            1_737_400_000_123_000_000
        );
        assert!(MarketEvent::ms_to_ns(i64::MAX) > 0);
    }
}
