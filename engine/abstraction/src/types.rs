//! Normalized engine types.
//!
//! These are TickLab's own simulator-agnostic types, mirroring
//! `docs/15-api-and-data-model-spec.md` §15.5 exactly. They are the only types
//! the Job Runner, Experiment Store, Data Pipeline, and frontend ever see.
//! Translation to `hftbacktest`'s native types lives exclusively in
//! [`crate::hftbacktest_impl`] (`docs/05-engine-abstraction-and-data-pipeline.md`
//! §5.1). The Protobuf schema in `proto/engine.proto` is the canonical wire
//! definition of these same shapes (`docs/15` §15.4); field names here match the
//! proto fields (snake_case), which protoc maps to the camelCase JSON/TS names
//! in §15.5 automatically.

/// Reference to a prepared dataset (content-addressed id, `docs/05` §5.3).
///
/// NOTE (assumption, needs Planner sign-off): `docs/15` §15.5 does not spell
/// out `DatasetRef`; the pipeline stages in `docs/05` §5.2 identify datasets by
/// their content-addressed `dataset_id`, so this is a newtype over that id.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct DatasetRef {
    /// Content-addressed dataset id (`docs/05` §5.3).
    pub dataset_id: String,
}

/// A dataset prepared into the engine's native input layout (`docs/05` §5.2).
///
/// NOTE (assumption, needs Planner sign-off): shape not spelled out in
/// `docs/15` §15.5; kept minimal — identity plus layout metadata. The full
/// preparation stages land in Block 2.7 (`backend/data/app/`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreparedDataset {
    /// Content-addressed dataset id (`docs/05` §5.3).
    pub dataset_id: String,
    /// Pipeline version that produced this layout (`docs/05` §5.3).
    pub pipeline_version: String,
    /// Number of engine-ready events in the prepared layout.
    pub event_count: u64,
}

/// Opaque handle to a running or completed backtest.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct BacktestHandle {
    /// Server-assigned handle id (surfaced as `jobId` on the API boundary).
    pub handle_id: String,
}

/// The event stream for replay and investigation (`docs/05` §5.1).
///
/// Kept as an owned vector for the core contract; streaming transport happens
/// at the gRPC layer (`StreamEvents`).
pub type EventStream = Vec<MarketEvent>;

/// Normalized market event, shared by live, paper, and replay sources
/// (`docs/15` §15.5 `MarketEvent`, `docs/06` §6.4).
#[derive(Clone, Debug, PartialEq)]
pub struct MarketEvent {
    /// Nanosecond-precision epoch integer (`docs/15` §15.1).
    pub timestamp_ns: i64,
    pub symbol: String,
    pub exchange: String,
    /// NOTE: TS field is `type`; renamed to `event_type` here because `type`
    /// is a Rust keyword. The proto field documents the mapping.
    pub event_type: EventType,
    pub side: Option<Side>,
    pub price: Option<f64>,
    pub size: Option<f64>,
    pub sequence: Option<i64>,
    // Derivatives-only fields (docs/14 §14.12, docs/15 §15.5).
    pub funding_rate: Option<f64>,
    pub next_funding_time: Option<i64>,
    pub open_interest: Option<f64>,
    pub mark_price: Option<f64>,
    pub index_price: Option<f64>,
    pub basis: Option<f64>,
}

/// `MarketEvent` variant (`docs/15` §15.5 `type` union).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventType {
    BookUpdate,
    Trade,
    Snapshot,
    Ticker,
    Funding,
    Liquidation,
}

/// Order side.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Bid,
    Ask,
}

/// Data quality report (`docs/15` §15.5 `DataQualityReport`, `docs/05` §5.2).
#[derive(Clone, Debug, PartialEq)]
pub struct DataQualityReport {
    pub dataset_id: String,
    pub total_events: u64,
    pub trades: u64,
    pub order_book_updates: u64,
    pub snapshots: u64,
    pub missing_intervals: MissingIntervals,
    pub duplicate_events: QualityCount,
    pub sequence_gaps: QualityCount,
    pub timestamp_range: TimestampRange,
    pub file_size_bytes: u64,
    pub source: String,
    pub normalization_version: String,
    pub tick_size: f64,
    pub lot_size: f64,
}

/// Quality gate status: green / yellow / red (`docs/05` §5.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QualityStatus {
    Green,
    Yellow,
    Red,
}

/// Closed timestamp interval `[start_ns, end_ns]`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TimestampRange {
    pub start_ns: i64,
    pub end_ns: i64,
}

/// A count plus its green/yellow/red gate status.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct QualityCount {
    pub count: u64,
    pub status: QualityStatus,
}

/// Missing-interval gate: count, status, and the ranges.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MissingIntervals {
    pub count: u64,
    pub status: QualityStatus,
    pub ranges: Vec<TimestampRange>,
}

/// Backtest request (`docs/15` §15.5 `BacktestRequest`).
#[derive(Clone, Debug, PartialEq)]
pub struct BacktestRequest {
    pub strategy_ref: StrategyRef,
    pub parameters: Vec<NamedParameter>,
    pub dataset_id: String,
    pub date_range: TimestampRange,
    pub initial_capital: f64,
    pub execution_model: ExecutionModelConfig,
    pub risk_limits: RiskLimitsConfig,
    /// Null means "no fixed seed" (`docs/15` §15.5 `randomSeed: number | null`).
    pub random_seed: Option<i64>,
    pub iterations: u32,
}

/// Strategy reference (`docs/15` §15.5 `strategyRef`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StrategyRef {
    pub id: String,
    pub version: String,
    pub code_hash: String,
}

/// One named strategy parameter.
///
/// `docs/15` §15.5 types this as `Record<string, number | string | boolean>`;
/// the union is made explicit here instead of string-encoding values.
#[derive(Clone, Debug, PartialEq)]
pub struct NamedParameter {
    pub name: String,
    pub value: ParameterValue,
}

/// A strategy parameter value: number, text, or flag.
#[derive(Clone, Debug, PartialEq)]
pub enum ParameterValue {
    Number(f64),
    Text(String),
    Flag(bool),
}

/// Execution model configuration (`docs/08` §8.7 panel fields).
///
/// Block 2.3 resolves this into vendor selections
/// (`execution_model::resolve_execution_model`, `docs/04` §4.4); the queue-model
/// preset list was finalized in Task 2.3.B against the vendored `models/`
/// source, so the preset travels as a string and is parsed there.
#[derive(Clone, Debug, PartialEq)]
pub struct ExecutionModelConfig {
    /// Maker fee, percent (`docs/08` §8.7).
    pub maker_fee_pct: f64,
    /// Taker fee, percent (`docs/08` §8.7).
    pub taker_fee_pct: f64,
    /// Read-only, from instrument metadata (`docs/08` §8.7).
    pub tick_size: f64,
    /// Read-only, from instrument metadata (`docs/08` §8.7).
    pub lot_size: f64,
    pub latency_model: LatencyModelKind,
    /// Preset name; finalized in Task 2.3.B (`docs/04` §4.4).
    pub queue_model_preset: String,
    /// Maps to `ExchangeKind`: `NoPartialFillExchange` / `PartialFillExchange`
    /// (`docs/04` §4.4, `docs/08` §8.7).
    pub allow_partial_fills: bool,
    /// Order types the strategy may submit; enforced by the backtest job
    /// (`docs/08` §8.7).
    pub order_types_allowed: Vec<OrderType>,
}

/// Latency model selector (`docs/04` §4.4, `docs/08` §8.7).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LatencyModelKind {
    /// Constant feed/order latency.
    Fixed,
    /// Driven by an empirical latency data file; carries the file reference.
    Empirical { data_file: String },
    /// Custom distribution; parameters travel in `BacktestRequest::parameters`.
    Custom,
}

/// Order types enforceable on a backtest (`docs/08` §8.7).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OrderType {
    Limit,
    Market,
    Ioc,
    Fok,
    Gtc,
    PostOnly,
    ReduceOnly,
}

/// Risk limits configuration (`docs/12` §12.5 `RiskLimitsConfig`, exact).
#[derive(Clone, Debug, PartialEq)]
pub struct RiskLimitsConfig {
    /// Base currency units.
    pub max_position: f64,
    pub max_order_size: f64,
    /// Quote currency.
    pub max_daily_loss: f64,
    pub max_drawdown_pct: f64,
    pub max_open_orders: u32,
    pub max_order_rate_per_sec: f64,
    pub max_notional_exposure: f64,
    pub emergency_stop_enabled: bool,
}

/// Backtest progress (`docs/15` §15.5 `BacktestProgress`, exact).
#[derive(Clone, Debug, PartialEq)]
pub struct BacktestProgress {
    pub job_id: String,
    pub events_processed: u64,
    pub total_events: u64,
    pub events_per_sec: f64,
    pub orders_submitted: u64,
    pub fills: u64,
    pub simulated_time_ns: i64,
    pub wall_clock_elapsed_ms: u64,
    pub status: BacktestStatus,
}

/// Job lifecycle status (`docs/15` §15.5 `BacktestProgress::status`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BacktestStatus {
    Queued,
    Running,
    Complete,
    Failed,
    Cancelled,
}

/// Backtest result (`docs/15` §15.5 `BacktestResult`, exact).
///
/// Headline metrics are computed in Block 2.4 by wrapping upstream's
/// Polars-based `Metric` classes (`docs/04` §4.7); this struct only carries
/// them. No financial math lives in the abstraction core (`AGENTS.md` §5.3).
#[derive(Clone, Debug, PartialEq)]
pub struct BacktestResult {
    pub job_id: String,
    pub experiment_id: String,
    /// Engine version for reproducibility (`docs/10` §10.3).
    pub engine_version: String,
    /// Headline metrics (`docs/09` §9.1).
    pub headline: HeadlineMetrics,
    /// Pointer to the Recorder npz/parquet blob (`docs/04` §4.6).
    pub recorder_series_ref: String,
    /// Pointer to the extended event/fill stream (`docs/05` §5.5).
    pub fine_grained_events_ref: String,
}

/// Headline metrics (`docs/15` §15.5 `BacktestResult::headline`, exact).
#[derive(Clone, Debug, PartialEq)]
pub struct HeadlineMetrics {
    pub initial_capital: f64,
    pub final_capital: f64,
    pub net_pnl: f64,
    pub return_pct: f64,
    pub max_drawdown_pct: f64,
    pub sharpe: f64,
    pub sortino: f64,
    pub trades: u64,
    pub fill_rate_pct: f64,
    pub fees: f64,
    pub slippage: f64,
}

/// Progress of one dataset-preparation stage (`PrepareDataset` stream item).
///
/// NOTE (assumption, needs Planner sign-off): item shape not spelled out in
/// `docs/15` §15.4; stage names follow `docs/05` §5.2.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PipelineProgress {
    pub dataset_id: String,
    /// One of `docs/05` §5.2's stages (validation, normalization, …).
    pub stage: String,
    pub stage_index: u32,
    pub stage_count: u32,
    pub complete: bool,
}
