//! Extended-stream capture and serialization (Block 2.5, Task B).
//!
//! [`ExtendedRecorder`] is the observation-side buffer fed from the hook
//! points documented in [`crate::extended_events`] (Task A). It validates
//! every row on capture (`ExtendedEvent::validate`), enforces non-decreasing
//! timestamps (the engine's event loop is strictly ordered, `docs/04` §4.3),
//! and persists the stream keyed by `experiment_id` (`docs/05` §5.5: "written
//! to Parquet alongside the standard `Recorder` npz output, keyed by
//! `experiment_id`").
//!
//! # Parquet note (no new dependency, `AGENTS.md` §5.5)
//!
//! The approved stack lists "Apache Parquet (via Polars)" (`docs/03` §3.1)
//! for the Python services — there is deliberately **no** Rust `parquet` /
//! `arrow` crate in this crate's dependency tree. This module therefore
//! provides:
//! - [`ExtendedRecorder::to_csv`] / [`write_csv`] — lossless std-only
//!   persistence of the full §5.5 field set (used by the acceptance test);
//! - [`ExtendedRecorder::parquet_schema`] — the canonical Parquet
//!   `message` schema plus [`PARQUET_COLUMNS`] so the Python data layer
//!   (Polars, Block 2.7) writes byte-identical Parquet without schema drift.
//! If the Planner later wants native Rust Parquet encoding, that is a
//! `NEEDS_PLANNER_REVIEW` crate addition — the schema below is the contract
//! it must implement.

use std::fmt::Write as _;
use std::path::Path;

use crate::error::EngineError;
use crate::extended_events::{
    ExtendedEvent, ExtendedEventType, LatencyBreakdown, MarketStateSnapshot,
};
use crate::types::Side;

/// CSV header — column order is part of the persistence contract.
pub const CSV_HEADER: &str = "timestamp_ns,event_type,order_id,side,price,size,\
queue_ahead_estimate,fill_probability_estimate,\
best_bid,best_ask,spread,mid_price,volatility,\
decision_ns,order_creation_ns,exchange_arrival_ns,fill_ns";

/// Canonical Parquet column list: `(name, parquet-type)`.
/// Mirrors [`CSV_HEADER`] 1:1 so CSV and Parquet never drift.
pub const PARQUET_COLUMNS: &[(&str, &str)] = &[
    ("timestamp_ns", "INT64"),
    ("event_type", "BYTE_ARRAY UTF8"),
    ("order_id", "INT64"),
    ("side", "BYTE_ARRAY UTF8 (OPTIONAL)"),
    ("price", "DOUBLE (OPTIONAL)"),
    ("size", "DOUBLE (OPTIONAL)"),
    ("queue_ahead_estimate", "DOUBLE (OPTIONAL)"),
    ("fill_probability_estimate", "DOUBLE (OPTIONAL)"),
    ("best_bid", "DOUBLE"),
    ("best_ask", "DOUBLE"),
    ("spread", "DOUBLE"),
    ("mid_price", "DOUBLE"),
    ("volatility", "DOUBLE (OPTIONAL)"),
    ("decision_ns", "INT64"),
    ("order_creation_ns", "INT64"),
    ("exchange_arrival_ns", "INT64"),
    ("fill_ns", "INT64"),
];

/// Capture buffer for one backtest's extended stream (Task B).
///
/// Keyed by `experiment_id`; the Parquet/CSV artifact for the run is
/// addressed as `{experiment_id}/extended_events.{parquet,csv}` next to the
/// standard `Recorder` npz (`docs/05` §5.5).
#[derive(Clone, Debug)]
pub struct ExtendedRecorder {
    experiment_id: String,
    events: Vec<ExtendedEvent>,
}

impl ExtendedRecorder {
    /// Create an empty recorder for a run; empty ids are rejected.
    pub fn new(experiment_id: impl Into<String>) -> Result<Self, EngineError> {
        let experiment_id = experiment_id.into();
        if experiment_id.trim().is_empty() {
            return Err(EngineError::InvalidEvent(
                "experiment_id must not be empty".to_string(),
            ));
        }
        Ok(Self {
            experiment_id,
            events: Vec::new(),
        })
    }

    /// Owning experiment/run id (the Parquet key prefix).
    pub fn experiment_id(&self) -> &str {
        &self.experiment_id
    }

    /// Captured rows in capture order.
    pub fn events(&self) -> &[ExtendedEvent] {
        &self.events
    }

    /// Number of captured rows.
    pub fn len(&self) -> usize {
        self.events.len()
    }

    /// `true` when nothing has been captured yet.
    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    /// Capture one validated row.
    ///
    /// Enforces non-decreasing `timestamp_ns` (out-of-order rows are a data
    /// correctness issue per `AGENTS.md` §4, never silently reordered).
    pub fn record(&mut self, event: ExtendedEvent) -> Result<(), EngineError> {
        event.validate()?;
        if let Some(last) = self.events.last() {
            if event.timestamp_ns < last.timestamp_ns {
                return Err(EngineError::InvalidEvent(format!(
                    "out-of-order event: {} < last {}",
                    event.timestamp_ns, last.timestamp_ns
                )));
            }
        }
        self.events.push(event);
        Ok(())
    }

    /// Observe a strategy decision tick (hook H1).
    #[allow(clippy::too_many_arguments)]
    pub fn observe_decision_tick(
        &mut self,
        timestamp_ns: i64,
        market_state: MarketStateSnapshot,
        decision_ns: i64,
    ) -> Result<(), EngineError> {
        self.record(ExtendedEvent {
            timestamp_ns,
            event_type: ExtendedEventType::DecisionTick,
            order_id: 0,
            side: None,
            price: None,
            size: None,
            queue_ahead_estimate: None,
            fill_probability_estimate: None,
            market_state,
            latency: LatencyBreakdown {
                decision_ns,
                order_creation_ns: 0,
                exchange_arrival_ns: 0,
                fill_ns: 0,
            },
        })
    }

    /// Observe an order submission (hooks H1–H3).
    #[allow(clippy::too_many_arguments)]
    pub fn observe_submit(
        &mut self,
        timestamp_ns: i64,
        order_id: u64,
        side: Side,
        price: f64,
        size: f64,
        queue_ahead_estimate: Option<f64>,
        fill_probability_estimate: Option<f64>,
        market_state: MarketStateSnapshot,
        latency: LatencyBreakdown,
    ) -> Result<(), EngineError> {
        self.record(ExtendedEvent {
            timestamp_ns,
            event_type: ExtendedEventType::Submit,
            order_id,
            side: Some(side),
            price: Some(price),
            size: Some(size),
            queue_ahead_estimate,
            fill_probability_estimate,
            market_state,
            latency,
        })
    }

    /// Observe a queue-estimate revision while resting (hook H4).
    pub fn observe_queue_update(
        &mut self,
        timestamp_ns: i64,
        order_id: u64,
        side: Side,
        price: f64,
        size: f64,
        queue_ahead_estimate: f64,
        fill_probability_estimate: Option<f64>,
        market_state: MarketStateSnapshot,
        latency: LatencyBreakdown,
    ) -> Result<(), EngineError> {
        self.record(ExtendedEvent {
            timestamp_ns,
            event_type: ExtendedEventType::QueueUpdate,
            order_id,
            side: Some(side),
            price: Some(price),
            size: Some(size),
            queue_ahead_estimate: Some(queue_ahead_estimate),
            fill_probability_estimate,
            market_state,
            latency,
        })
    }

    /// Observe a partial or full fill (hooks H4–H6).
    #[allow(clippy::too_many_arguments)]
    pub fn observe_fill(
        &mut self,
        timestamp_ns: i64,
        order_id: u64,
        side: Side,
        fill_price: f64,
        fill_size: f64,
        partial: bool,
        market_state: MarketStateSnapshot,
        latency: LatencyBreakdown,
    ) -> Result<(), EngineError> {
        self.record(ExtendedEvent {
            timestamp_ns,
            event_type: if partial {
                ExtendedEventType::PartialFill
            } else {
                ExtendedEventType::Fill
            },
            order_id,
            side: Some(side),
            price: Some(fill_price),
            size: Some(fill_size),
            queue_ahead_estimate: Some(0.0),
            fill_probability_estimate: None,
            market_state,
            latency,
        })
    }

    /// Observe a terminal non-fill outcome: cancel / reject / expire
    /// (hooks H3/H5–H6).
    #[allow(clippy::too_many_arguments)]
    pub fn observe_terminal(
        &mut self,
        timestamp_ns: i64,
        kind: ExtendedEventType,
        order_id: u64,
        side: Side,
        price: Option<f64>,
        size: Option<f64>,
        market_state: MarketStateSnapshot,
        latency: LatencyBreakdown,
    ) -> Result<(), EngineError> {
        match kind {
            ExtendedEventType::Cancel | ExtendedEventType::Reject | ExtendedEventType::Expire => {}
            other => {
                return Err(EngineError::InvalidEvent(format!(
                    "observe_terminal requires cancel/reject/expire, got {}",
                    other.as_str()
                )));
            }
        }
        self.record(ExtendedEvent {
            timestamp_ns,
            event_type: kind,
            order_id,
            side: Some(side),
            price,
            size,
            queue_ahead_estimate: None,
            fill_probability_estimate: None,
            market_state,
            latency,
        })
    }

    /// All rows for one order, in capture order.
    pub fn events_for_order(&self, order_id: u64) -> Vec<&ExtendedEvent> {
        self.events
            .iter()
            .filter(|e| e.order_id == order_id)
            .collect()
    }

    /// Serialize the full stream to CSV (lossless, std-only).
    pub fn to_csv(&self) -> Result<String, EngineError> {
        let mut out = String::new();
        out.push_str(CSV_HEADER);
        out.push('\n');
        for e in &self.events {
            write_csv_row(&mut out, e)
                .map_err(|_| EngineError::Engine("csv serialization failed".to_string()))?;
        }
        Ok(out)
    }

    /// Write the CSV artifact to `{dir}/{experiment_id}_extended_events.csv`.
    pub fn write_csv(&self, dir: &Path) -> Result<std::path::PathBuf, EngineError> {
        let path = dir.join(format!("{}_extended_events.csv", self.experiment_id));
        let csv = self.to_csv()?;
        std::fs::write(&path, csv)
            .map_err(|e| EngineError::Engine(format!("failed to write csv: {e}")))?;
        Ok(path)
    }

    /// Canonical Parquet `message` schema for the §5.5 field set.
    ///
    /// Consumed by the Python data layer (Polars) to write the
    /// `{experiment_id}/extended_events.parquet` artifact; the Rust side
    /// guarantees CSV and schema describe identical columns
    /// ([`PARQUET_COLUMNS`], tested below).
    pub fn parquet_schema() -> &'static str {
        "message extended_event {\n\
         \x20 REQUIRED INT64 timestamp_ns;\n\
         \x20 REQUIRED BYTE_ARRAY event_type (UTF8);\n\
         \x20 REQUIRED INT64 order_id;\n\
         \x20 OPTIONAL BYTE_ARRAY side (UTF8);\n\
         \x20 OPTIONAL DOUBLE price;\n\
         \x20 OPTIONAL DOUBLE size;\n\
         \x20 OPTIONAL DOUBLE queue_ahead_estimate;\n\
         \x20 OPTIONAL DOUBLE fill_probability_estimate;\n\
         \x20 REQUIRED DOUBLE best_bid;\n\
         \x20 REQUIRED DOUBLE best_ask;\n\
         \x20 REQUIRED DOUBLE spread;\n\
         \x20 REQUIRED DOUBLE mid_price;\n\
         \x20 OPTIONAL DOUBLE volatility;\n\
         \x20 REQUIRED INT64 decision_ns;\n\
         \x20 REQUIRED INT64 order_creation_ns;\n\
         \x20 REQUIRED INT64 exchange_arrival_ns;\n\
         \x20 REQUIRED INT64 fill_ns;\n\
         }"
    }
}

fn write_csv_row(out: &mut String, e: &ExtendedEvent) -> std::fmt::Result {
    let side = match e.side {
        Some(Side::Bid) => "bid",
        Some(Side::Ask) => "ask",
        None => "",
    };
    let opt = |v: Option<f64>| match v {
        Some(x) => x.to_string(),
        None => String::new(),
    };
    writeln!(
        out,
        "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
        e.timestamp_ns,
        e.event_type.as_str(),
        e.order_id,
        side,
        opt(e.price),
        opt(e.size),
        opt(e.queue_ahead_estimate),
        opt(e.fill_probability_estimate),
        e.market_state.best_bid,
        e.market_state.best_ask,
        e.market_state.spread,
        e.market_state.mid_price,
        opt(e.market_state.volatility),
        e.latency.decision_ns,
        e.latency.order_creation_ns,
        e.latency.exchange_arrival_ns,
        e.latency.fill_ns,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extended_events::{LatencyBreakdown, MarketStateSnapshot};

    fn snapshot() -> MarketStateSnapshot {
        MarketStateSnapshot::from_top_of_book(49_999.5, 50_000.5, None)
    }

    fn latency() -> LatencyBreakdown {
        LatencyBreakdown {
            decision_ns: 800,
            order_creation_ns: 400,
            exchange_arrival_ns: 1_200,
            fill_ns: 600,
        }
    }

    #[test]
    fn rejects_empty_experiment_id() {
        assert!(ExtendedRecorder::new("").is_err());
        assert!(ExtendedRecorder::new("  ").is_err());
    }

    #[test]
    fn rejects_out_of_order_rows() {
        let mut r = ExtendedRecorder::new("exp-1").expect("valid id");
        r.observe_submit(
            2_000,
            1,
            Side::Bid,
            50_000.0,
            0.1,
            None,
            None,
            snapshot(),
            latency(),
        )
        .expect("first row");
        let err = r
            .observe_submit(
                1_000,
                2,
                Side::Bid,
                50_000.0,
                0.1,
                None,
                None,
                snapshot(),
                latency(),
            )
            .expect_err("out-of-order must fail");
        assert!(matches!(err, EngineError::InvalidEvent(_)));
    }

    #[test]
    fn terminal_kind_is_checked() {
        let mut r = ExtendedRecorder::new("exp-1").expect("valid id");
        let err = r
            .observe_terminal(
                1_000,
                ExtendedEventType::Fill,
                1,
                Side::Bid,
                None,
                None,
                snapshot(),
                latency(),
            )
            .expect_err("fill is not terminal-via-observe_terminal");
        assert!(matches!(err, EngineError::InvalidEvent(_)));
    }

    #[test]
    fn csv_covers_every_schema_column() {
        let header_cols: Vec<&str> = CSV_HEADER.split(',').collect();
        let schema_cols: Vec<&str> = PARQUET_COLUMNS.iter().map(|(name, _)| *name).collect();
        assert_eq!(header_cols, schema_cols);
        for (name, _) in PARQUET_COLUMNS {
            assert!(
                ExtendedRecorder::parquet_schema().contains(name),
                "schema missing column {name}"
            );
        }
    }

    #[test]
    fn csv_round_trips_one_submit() {
        let mut r = ExtendedRecorder::new("exp-1").expect("valid id");
        r.observe_submit(
            1_000,
            7,
            Side::Bid,
            50_000.0,
            0.1,
            Some(2.5),
            Some(0.7),
            snapshot(),
            latency(),
        )
        .expect("submit");
        let csv = r.to_csv().expect("csv");
        let mut lines = csv.lines();
        assert_eq!(lines.next().expect("header"), CSV_HEADER);
        let row: Vec<&str> = lines.next().expect("row").split(',').collect();
        assert_eq!(row.len(), 17);
        assert_eq!(row[0], "1000");
        assert_eq!(row[1], "submit");
        assert_eq!(row[2], "7");
        assert_eq!(row[3], "bid");
        assert_eq!(row[4], "50000");
        assert_eq!(row[5], "0.1");
        assert_eq!(row[6], "2.5");
        assert_eq!(row[7], "0.7");
    }
}
