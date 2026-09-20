//! Shared connector types (`docs/03` §3.5 `backend/connectors/common/`,
//! `docs/06` §6.2–§6.4, `docs/15` §15.3/§15.5).
//!
//! This crate is the single source of truth for the normalized market event
//! schema on the live path and for the NATS subject contract between the Live
//! Exchange Connector(s), the Market Data Service (`backend/market`), and the
//! Gateway fan-out. It contains **no order-entry types by design**: Block 5.1
//! is read-only market-data ingestion, so there is no code path here (or in
//! any crate depending on this one) that can send an order to an exchange
//! (`docs/12` isolation; `docs/06` §6.2 hot-path separation).

pub mod book;
pub mod events;
pub mod publish;
pub mod snapshot;
pub mod subjects;

/// Canonical exchange id for the Block 5.1 connector (OD-1 default).
/// Lowercase, matching upstream `hftbacktest`'s `connector/` convention that
/// Binance Futures symbols are lowercase (see its `connector/README.md`).
pub const EXCHANGE_BINANCE_FUTURES: &str = "binance-futures";

/// Lowercase-normalize an exchange-native symbol (`BTCUSDT` → `btcusdt`).
///
/// Assumption flagged for Planner review: NATS subjects and `MarketEvent.symbol`
/// use the lowercase exchange-native form, while `docs/15` §15.3's topic
/// example shows `market.BTCUSDT.depth`. The Market Data Service matches
/// symbols case-insensitively, so either form resolves; if the Planner wants
/// uppercase subjects on the wire, this one function is the only change.
pub fn normalize_symbol(raw: &str) -> String {
    raw.to_lowercase()
}
