//! NATS subject contract (`docs/15` §15.3 core topics, `docs/06` §6.3).
//!
//! The connector publishes; the Market Data Service subscribes; the Gateway
//! fans out to browsers. Subjects never carry order-entry traffic — this
//! block is read-only (`docs/12` isolation).

use crate::normalize_symbol;

/// `market.{symbol}.depth` — order book delta stream (`docs/15` §15.3).
pub fn depth_subject(symbol: &str) -> String {
    format!("market.{}.depth", normalize_symbol(symbol))
}

/// `market.{symbol}.trades` — trade tape stream (`docs/15` §15.3).
pub fn trades_subject(symbol: &str) -> String {
    format!("market.{}.trades", normalize_symbol(symbol))
}

/// `market.{symbol}.ticker` — top-of-book/24h stats (`docs/15` §15.3).
pub fn ticker_subject(symbol: &str) -> String {
    format!("market.{}.ticker", normalize_symbol(symbol))
}

/// True for subjects this block publishes.
pub fn is_market_subject(subject: &str) -> bool {
    let parts: Vec<&str> = subject.split('.').collect();
    matches!(
        parts.as_slice(),
        ["market", _, "depth" | "trades" | "ticker"]
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subject_shapes_match_spec_topics() {
        assert_eq!(depth_subject("btcusdt"), "market.btcusdt.depth");
        assert_eq!(trades_subject("BTCUSDT"), "market.btcusdt.trades");
        assert_eq!(ticker_subject("BtcUsdt"), "market.btcusdt.ticker");
    }

    #[test]
    fn only_market_data_subjects_recognized() {
        assert!(is_market_subject("market.btcusdt.depth"));
        assert!(is_market_subject("market.btcusdt.trades"));
        assert!(is_market_subject("market.btcusdt.ticker"));
        assert!(!is_market_subject("workspace.sync"));
        assert!(!is_market_subject("job.x.progress"));
        assert!(!is_market_subject("market.btcusdt.orders"));
        assert!(!is_market_subject("market.btcusdt"));
    }
}
