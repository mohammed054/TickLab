//! Read-only connector configuration (Block 5.1).
//!
//! Public market-data streams only. There are deliberately **no** credential
//! fields (`api_key`/`secret`), no REST order endpoints, and no user-data
//! stream: order entry cannot be enabled from this process by construction
//! (`docs/06` §6.2, `docs/12` isolation).

use crate::error::ConnectorError;

/// Exchange id published on every event (`docs/15` §15.5 `exchange`).
pub const EXCHANGE: &str = ticklab_connectors_common::EXCHANGE_BINANCE_FUTURES;

/// Defaults: Binance Futures mainnet public streams (no auth).
pub const DEFAULT_STREAM_URL: &str = "wss://fstream.binance.com/stream";
pub const DEFAULT_SYMBOLS: &str = "btcusdt";
pub const DEFAULT_NATS_URL: &str = "nats://127.0.0.1:4222";
pub const DEFAULT_BOOK_DEPTH: usize = 25;
pub const DEFAULT_HEALTH_ADDR: &str = "127.0.0.1:50054";

#[derive(Clone, Debug)]
pub struct Config {
    pub stream_url: String,
    pub symbols: Vec<String>,
    pub nats_url: String,
    pub book_depth: usize,
    pub health_addr: String,
}

impl Config {
    pub fn from_env() -> Result<Self, ConnectorError> {
        let stream_url = env_or("TICKLAB_STREAM_URL", DEFAULT_STREAM_URL);
        let symbols = env_or("TICKLAB_SYMBOLS", DEFAULT_SYMBOLS)
            .split(',')
            .map(|s| ticklab_connectors_common::normalize_symbol(s.trim()))
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();
        if symbols.is_empty() {
            return Err(ConnectorError::Config(
                "TICKLAB_SYMBOLS must list at least one symbol".to_string(),
            ));
        }
        Ok(Self {
            stream_url,
            symbols,
            nats_url: env_or("TICKLAB_NATS_URL", DEFAULT_NATS_URL),
            book_depth: env_or("TICKLAB_BOOK_DEPTH", &DEFAULT_BOOK_DEPTH.to_string())
                .parse()
                .map_err(|_| {
                    ConnectorError::Config("TICKLAB_BOOK_DEPTH must be a number".to_string())
                })?,
            health_addr: env_or("TICKLAB_HEALTH_ADDR", DEFAULT_HEALTH_ADDR),
        })
    }

    /// Combined-stream URL, e.g.
    /// `wss://fstream.binance.com/stream?streams=btcusdt@depth@100ms/…`.
    pub fn combined_url(&self) -> String {
        let streams = self
            .symbols
            .iter()
            .flat_map(|s| {
                [
                    format!("{s}@depth@100ms"),
                    format!("{s}@trade"),
                    format!("{s}@ticker"),
                ]
            })
            .collect::<Vec<_>>()
            .join("/");
        format!("{}?streams={streams}", self.stream_url_trimmed())
    }

    fn stream_url_trimmed(&self) -> String {
        let base = self.stream_url.trim_end_matches('/').to_string();
        if base.ends_with("/stream") {
            base
        } else {
            format!("{base}/stream")
        }
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combined_url_subscribes_depth_trade_ticker_per_symbol() {
        let cfg = Config {
            stream_url: DEFAULT_STREAM_URL.to_string(),
            symbols: vec!["btcusdt".to_string(), "ethusdt".to_string()],
            nats_url: DEFAULT_NATS_URL.to_string(),
            book_depth: 25,
            health_addr: DEFAULT_HEALTH_ADDR.to_string(),
        };
        let url = cfg.combined_url();
        assert!(url.starts_with("wss://fstream.binance.com/stream?streams="));
        for s in [
            "btcusdt@depth@100ms",
            "btcusdt@trade",
            "btcusdt@ticker",
            "ethusdt@depth@100ms",
            "ethusdt@trade",
            "ethusdt@ticker",
        ] {
            assert!(url.contains(s), "missing {s} in {url}");
        }
    }

    #[test]
    fn config_has_no_credential_fields_by_construction() {
        // Read-only bar: the Config struct must never gain api_key/secret.
        let dbg = format!(
            "{:?}",
            Config {
                stream_url: String::new(),
                symbols: vec![],
                nats_url: String::new(),
                book_depth: 0,
                health_addr: String::new(),
            }
        )
        .to_lowercase();
        for word in ["api_key", "apikey", "secret", "listenkey"] {
            assert!(!dbg.contains(word), "credential field leaked: {word}");
        }
    }
}
