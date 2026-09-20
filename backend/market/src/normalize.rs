//! Normalization gate for inbound market events (`docs/06` §6.3–§6.4).
//!
//! Every event the Market Data Service folds into snapshot state — whether
//! from the live NATS feed or (later) historical replay — passes through
//! [`normalize_event`]: symbol case-folding, timestamp sanity, and per-type
//! field validation. Invalid events are rejected with a reason string and
//! never touch the store, so a corrupt publisher cannot poison snapshots.

use ticklab_connectors_common::{
    events::{MarketEvent, MarketEventType},
    normalize_symbol,
};

/// Validate + normalize one event in place. Returns the normalized symbol on
/// success, or a human-readable reason on rejection.
pub fn normalize_event(ev: &mut MarketEvent) -> Result<String, String> {
    if ev.symbol.trim().is_empty() {
        return Err("empty symbol".to_string());
    }
    if ev.exchange.trim().is_empty() {
        return Err("empty exchange".to_string());
    }
    if ev.timestamp_ns <= 0 {
        return Err(format!("non-positive timestampNs {}", ev.timestamp_ns));
    }
    ev.symbol = normalize_symbol(&ev.symbol);
    match ev.event_type {
        MarketEventType::BookUpdate | MarketEventType::Trade => {
            let (side, price, size) = match (ev.side, ev.price, ev.size) {
                (Some(s), Some(p), Some(q)) => (s, p, q),
                _ => return Err(format!("{:?} requires side+price+size", ev.event_type)),
            };
            let _ = side;
            if !price.is_finite() || price <= 0.0 {
                return Err(format!("bad price {price}"));
            }
            // size == 0.0 is a level removal, not corruption.
            if !size.is_finite() || size < 0.0 {
                return Err(format!("bad size {size}"));
            }
        }
        MarketEventType::Ticker => {
            if let Some(price) = ev.price {
                if !price.is_finite() || price <= 0.0 {
                    return Err(format!("bad ticker price {price}"));
                }
            }
        }
        MarketEventType::Snapshot | MarketEventType::Funding | MarketEventType::Liquidation => {}
    }
    Ok(ev.symbol.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ticklab_connectors_common::events::Side;

    fn trade() -> MarketEvent {
        MarketEvent {
            timestamp_ns: 1_700_000_000_000_000_000,
            symbol: "BTCUSDT".to_string(),
            exchange: "binance-futures".to_string(),
            event_type: MarketEventType::Trade,
            side: Some(Side::Bid),
            price: Some(100.0),
            size: Some(0.5),
            sequence: Some(1),
            funding_rate: None,
            next_funding_time: None,
            open_interest: None,
            mark_price: None,
            index_price: None,
            basis: None,
        }
    }

    #[test]
    fn valid_event_normalizes_symbol_case() {
        let mut ev = trade();
        assert_eq!(normalize_event(&mut ev).unwrap(), "btcusdt");
        assert_eq!(ev.symbol, "btcusdt");
    }

    #[test]
    fn invalid_events_rejected_with_reasons() {
        let mut ev = trade();
        ev.symbol = "  ".to_string();
        assert!(normalize_event(&mut ev).is_err());

        let mut ev = trade();
        ev.timestamp_ns = 0;
        assert!(normalize_event(&mut ev).is_err());

        let mut ev = trade();
        ev.price = Some(-1.0);
        assert!(normalize_event(&mut ev).is_err());

        let mut ev = trade();
        ev.side = None;
        assert!(normalize_event(&mut ev).is_err());

        // Zero-size book removal is legal.
        let mut ev = trade();
        ev.event_type = MarketEventType::BookUpdate;
        ev.size = Some(0.0);
        assert!(normalize_event(&mut ev).is_ok());
    }
}
