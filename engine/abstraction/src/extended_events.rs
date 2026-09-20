//! Extended order/fill event stream — schema and hook-point documentation.
//!
//! Schema source: `docs/05-engine-abstraction-and-data-pipeline.md` §5.5. One
//! entry per order lifecycle event (submit, queue-position-estimate-updated,
//! partial fill, fill, cancel, reject, expire) and one entry per strategy
//! decision tick, each carrying exactly the fields §5.5 lists:
//! `timestamp_ns, event_type, order_id, side, price, size,
//! queue_ahead_estimate, fill_probability_estimate,
//! market_state_snapshot_ref, latency_breakdown`.
//!
//! # Task A — hook points (Phase 2, Block 2.5, Task A)
//!
//! Identified by reading the vendored source directly
//! (`engine/vendor/hftbacktest/hftbacktest/src/`, crate version 0.9.4).
//! All hooks are **observation-only**: they read the order/bus state crossing
//! the Local/Exchange processor boundary without altering upstream's
//! simulation semantics (no changes under `engine/vendor/`).
//!
//! | # | Hook | Vendored location | What is observed |
//! |---|---|---|
//! | H1 | Strategy decision ticks | `types.rs` `Bot` trait: `submit_buy_order`, `submit_sell_order`, `submit_order`, `modify`, `cancel`, plus time-advance `elapse`, `elapse_bt`, `wait_next_feed`, `wait_order_response` | every strategy-side call becomes a `DecisionTick` entry (carrying the decision-latency component) and/or a `Submit` entry |
//! | H2 | Local order entry | `backtest/proc/local.rs` `Local::submit_order` / `modify` / `cancel` (trait `backtest/proc/mod.rs` `LocalProcessor`) | `Submit` entries with `local_timestamp` (= decision instant) before the request crosses the bus |
//! | H3 | Local→Exchange bus | `backtest/order.rs` `LocalToExch::request` | `Reject` entries when `order_entry_latency < 0` (pre-matching-engine reject path); otherwise the exchange-receipt timestamp (`local + entry latency`) feeding `exchange_arrival_ns` |
//! | H4 | Exchange fill simulation | `backtest/proc/nopartialfillexchange.rs` `NoPartialFillExchange` and `backtest/proc/partialfillexchange.rs` `PartialFillExchange` (`process` + `process_recv_order`), L3 variants `l3_local.rs` / `l3_nopartialfillexchange.rs` | `PartialFill` / `Fill` / `Cancel` outcomes plus the queue-model state (`QueueModel`, `backtest/models/queue.rs`) feeding `queue_ahead_estimate` / `fill_probability_estimate` |
//! | H5 | Exchange→Local bus | `backtest/order.rs` `ExchToLocal::respond` | `Fill` / `Cancel` / `Reject` / `Expire` responses with the response latency feeding the fill-latency component |
//! | H6 | Local order-response intake (primary capture hook) | `backtest/proc/local.rs` `Local::process_recv_order_<USE_HANDLER=true>` handler (`FnMut(&Order)`) and `Processor::process_recv_order` | every responded `Order` (`types.rs` `Order` with `Status::{Filled, PartiallyFilled, Canceled, Rejected, Expired}`) is mapped to its `ExtendedEventType` **without** touching local state — the `false` path used by the engine stays byte-identical |
//! | H7 | Latency components | `backtest/models/latency.rs` `LatencyModel::entry` / `response`, surfaced via `Local::feed_latency` / `order_latency` (`proc/local.rs`) | `LatencyBreakdown` fields `order_creation_ns` (entry) and `exchange_arrival_ns`/`fill_ns` (response) |
//! | H8 | Coarse Recorder (sibling stream) | `backtest/recorder.rs` `BacktestRecorder::record` (per-asset `timestamp, price, position, balance, fee, num_trades, trading_volume, trading_value`; see `docs/04` §4.6) | the standard output our stream runs **alongside** — Task C joins the two by timestamp |
//!
//! The vendor→normalized mapping (`Order`/`Status`/`Side` to the types below)
//! lives in `hftbacktest_impl.rs` — the only file allowed to touch
//! `hftbacktest` native types (`docs/05` §5.1). Everything downstream consumes
//! only the normalized types in this module.

use crate::error::EngineError;
use crate::types::Side;

/// Order lifecycle event kind (`docs/05` §5.5).
///
/// The wire strings (`as_str`) are the stable Parquet/CSV dictionary values;
/// they never change once persisted.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ExtendedEventType {
    /// Order submitted by the strategy (hooks H1–H2).
    Submit,
    /// Queue-position estimate revised while the order rests (hook H4).
    QueueUpdate,
    /// Order partially filled (hook H4/H6, `Status::PartiallyFilled`).
    PartialFill,
    /// Order filled (hooks H4–H6, `Status::Filled`).
    Fill,
    /// Order cancelled (hooks H4–H6, `Status::Canceled`).
    Cancel,
    /// Order rejected before/at the matching engine (hooks H3/H5–H6).
    Reject,
    /// Order expired (hooks H5–H6, `Status::Expired`).
    Expire,
    /// Strategy decision tick with no order action (hook H1).
    DecisionTick,
}

impl ExtendedEventType {
    /// Stable wire string for persistence (CSV/Parquet dictionary).
    pub fn as_str(self) -> &'static str {
        match self {
            ExtendedEventType::Submit => "submit",
            ExtendedEventType::QueueUpdate => "queue_update",
            ExtendedEventType::PartialFill => "partial_fill",
            ExtendedEventType::Fill => "fill",
            ExtendedEventType::Cancel => "cancel",
            ExtendedEventType::Reject => "reject",
            ExtendedEventType::Expire => "expire",
            ExtendedEventType::DecisionTick => "decision_tick",
        }
    }

    /// Parse a wire string back; `None` on unknown input (never panics).
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "submit" => Some(ExtendedEventType::Submit),
            "queue_update" => Some(ExtendedEventType::QueueUpdate),
            "partial_fill" => Some(ExtendedEventType::PartialFill),
            "fill" => Some(ExtendedEventType::Fill),
            "cancel" => Some(ExtendedEventType::Cancel),
            "reject" => Some(ExtendedEventType::Reject),
            "expire" => Some(ExtendedEventType::Expire),
            "decision_tick" => Some(ExtendedEventType::DecisionTick),
            _ => None,
        }
    }
}

/// Latency breakdown carried per event (`docs/05` §5.5).
///
/// Component sources (hooks H1/H3/H5/H7): `decision_ns` is strategy compute
/// time before the order call; `order_creation_ns` is the entry latency
/// (`LatencyModel::entry`); `exchange_arrival_ns` is exchange processing up to
/// the fill/cancel decision; `fill_ns` is the response latency
/// (`LatencyModel::response`) back to the local. Visualized per
/// `docs/09` §9.9; the components must reconcile to the total there.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LatencyBreakdown {
    pub decision_ns: i64,
    pub order_creation_ns: i64,
    pub exchange_arrival_ns: i64,
    pub fill_ns: i64,
}

impl LatencyBreakdown {
    /// Total latency (`docs/09` §9.9: components sum to the total).
    pub fn total_ns(self) -> i64 {
        self.decision_ns + self.order_creation_ns + self.exchange_arrival_ns + self.fill_ns
    }
}

/// Market snapshot at the event instant (`docs/05` §5.5
/// `market_state_snapshot_ref`).
///
/// Persisted denormalized per row (the "ref" is the event's timestamp join key
/// against the book history); `volatility` is `None` until the volatility
/// estimator of `docs/09` §9.11 is selected. Mid price follows `docs/04` §4.6:
/// `mid = (best_bid + best_ask) / 2`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MarketStateSnapshot {
    pub best_bid: f64,
    pub best_ask: f64,
    pub spread: f64,
    pub mid_price: f64,
    pub volatility: Option<f64>,
}

impl MarketStateSnapshot {
    /// Build from the top of book; spread/mid derived, never caller-supplied.
    pub fn from_top_of_book(best_bid: f64, best_ask: f64, volatility: Option<f64>) -> Self {
        Self {
            best_bid,
            best_ask,
            spread: best_ask - best_bid,
            mid_price: (best_bid + best_ask) / 2.0,
            volatility,
        }
    }
}

/// One extended-stream entry (`docs/05` §5.5, exact field list).
#[derive(Clone, Debug, PartialEq)]
pub struct ExtendedEvent {
    /// Nanosecond-precision epoch integer (`docs/15` §15.1).
    pub timestamp_ns: i64,
    pub event_type: ExtendedEventType,
    pub order_id: u64,
    pub side: Option<Side>,
    pub price: Option<f64>,
    pub size: Option<f64>,
    /// Modeled queue-ahead estimate at this instant — an estimate, not ground
    /// truth (`docs/04` §4.10 honesty requirement; surfaced labeled as such).
    pub queue_ahead_estimate: Option<f64>,
    /// Modeled fill-probability estimate at submission (same honesty rule).
    pub fill_probability_estimate: Option<f64>,
    pub market_state: MarketStateSnapshot,
    pub latency: LatencyBreakdown,
}

impl ExtendedEvent {
    /// Structural validation; every fallible path returns `Result`
    /// (`AGENTS.md` §5.1). Called by the recorder on capture so corrupt rows
    /// can never enter the stream.
    pub fn validate(&self) -> Result<(), EngineError> {
        if self.timestamp_ns < 0 {
            return Err(EngineError::InvalidEvent(format!(
                "timestamp_ns must be non-negative, got {}",
                self.timestamp_ns
            )));
        }
        match self.event_type {
            ExtendedEventType::Submit => {
                if self.side.is_none() {
                    return Err(EngineError::InvalidEvent(
                        "submit events require a side".to_string(),
                    ));
                }
                require_positive(self.price, "submit events require a positive price")?;
                require_positive(self.size, "submit events require a positive size")?;
            }
            ExtendedEventType::Fill | ExtendedEventType::PartialFill => {
                require_positive(self.price, "fill events require a positive fill price")?;
                require_positive(self.size, "fill events require a positive fill size")?;
            }
            _ => {
                if let Some(size) = self.size {
                    if !(size > 0.0) {
                        return Err(EngineError::InvalidEvent(format!(
                            "size must be positive, got {size}"
                        )));
                    }
                }
                if let Some(price) = self.price {
                    if !(price > 0.0) {
                        return Err(EngineError::InvalidEvent(format!(
                            "price must be positive, got {price}"
                        )));
                    }
                }
            }
        }
        if let Some(q) = self.queue_ahead_estimate {
            if !(q >= 0.0) {
                return Err(EngineError::InvalidEvent(format!(
                    "queue_ahead_estimate must be >= 0, got {q}"
                )));
            }
        }
        if let Some(p) = self.fill_probability_estimate {
            if !(0.0..=1.0).contains(&p) {
                return Err(EngineError::InvalidEvent(format!(
                    "fill_probability_estimate must be in [0,1], got {p}"
                )));
            }
        }
        if self.market_state.spread < 0.0 {
            return Err(EngineError::InvalidEvent(format!(
                "market spread must be >= 0, got {}",
                self.market_state.spread
            )));
        }
        for (name, value) in [
            ("decision_ns", self.latency.decision_ns),
            ("order_creation_ns", self.latency.order_creation_ns),
            ("exchange_arrival_ns", self.latency.exchange_arrival_ns),
            ("fill_ns", self.latency.fill_ns),
        ] {
            if value < 0 {
                return Err(EngineError::InvalidEvent(format!(
                    "latency.{name} must be >= 0, got {value}"
                )));
            }
        }
        Ok(())
    }
}

fn require_positive(value: Option<f64>, msg: &str) -> Result<(), EngineError> {
    match value {
        Some(v) if v > 0.0 => Ok(()),
        _ => Err(EngineError::InvalidEvent(msg.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_snapshot() -> MarketStateSnapshot {
        MarketStateSnapshot::from_top_of_book(49_999.5, 50_000.5, None)
    }

    fn sample_latency() -> LatencyBreakdown {
        LatencyBreakdown {
            decision_ns: 800,
            order_creation_ns: 400,
            exchange_arrival_ns: 1_200,
            fill_ns: 600,
        }
    }

    #[test]
    fn wire_strings_round_trip() {
        for t in [
            ExtendedEventType::Submit,
            ExtendedEventType::QueueUpdate,
            ExtendedEventType::PartialFill,
            ExtendedEventType::Fill,
            ExtendedEventType::Cancel,
            ExtendedEventType::Reject,
            ExtendedEventType::Expire,
            ExtendedEventType::DecisionTick,
        ] {
            assert_eq!(ExtendedEventType::from_str(t.as_str()), Some(t));
        }
        assert_eq!(ExtendedEventType::from_str("bogus"), None);
    }

    #[test]
    fn valid_fill_passes_validation() {
        let e = ExtendedEvent {
            timestamp_ns: 1,
            event_type: ExtendedEventType::Fill,
            order_id: 7,
            side: Some(Side::Bid),
            price: Some(50_000.0),
            size: Some(0.1),
            queue_ahead_estimate: Some(0.0),
            fill_probability_estimate: Some(0.9),
            market_state: sample_snapshot(),
            latency: sample_latency(),
        };
        assert!(e.validate().is_ok());
        assert_eq!(e.latency.total_ns(), 3_000);
    }

    #[test]
    fn invalid_rows_are_rejected_with_typed_errors() {
        let base = ExtendedEvent {
            timestamp_ns: 1,
            event_type: ExtendedEventType::Fill,
            order_id: 7,
            side: Some(Side::Bid),
            price: Some(50_000.0),
            size: Some(0.1),
            queue_ahead_estimate: None,
            fill_probability_estimate: None,
            market_state: sample_snapshot(),
            latency: sample_latency(),
        };
        let mut bad_ts = base.clone();
        bad_ts.timestamp_ns = -1;
        assert!(matches!(
            bad_ts.validate(),
            Err(EngineError::InvalidEvent(_))
        ));

        let mut missing_price = base.clone();
        missing_price.price = None;
        assert!(matches!(
            missing_price.validate(),
            Err(EngineError::InvalidEvent(_))
        ));

        let mut bad_prob = base.clone();
        bad_prob.fill_probability_estimate = Some(1.5);
        assert!(matches!(
            bad_prob.validate(),
            Err(EngineError::InvalidEvent(_))
        ));
    }
}
