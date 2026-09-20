//! `SimulatorContract` over the vendored `hftbacktest` crate.
//!
//! Per `docs/05-engine-abstraction-and-data-pipeline.md` §5.1, this is the
//! ONLY file allowed to translate between our normalized types and
//! `hftbacktest`'s native `Asset`/`Event`/builder types.
//!
//! Market-depth default (Task 2.2 decision, `docs/04` §4.4): default to
//! `ROIVectorMarketDepth` — the fastest book, restricted to a configured range
//! of interest, which suits BTC/USDT whose price range is well-bounded — and
//! fall back to `BTreeMarketDepth` for correctness-first / arbitrary-range
//! scenarios. Each [`BacktestRequest`] builds a fresh depth instance from its
//! execution-model tick/lot size.
//!
//! Block 2.2 acceptance is proven end-to-end against a deterministic in-repo
//! fixture dataset (`FIXTURE_DATASET_ID`) driven through a real
//! `Backtest<MD>` run — no fabricated fills or metrics (AGENTS.md §5.3).
//! The fixture feeds dual EXCH+LOCAL depth events so the local and exchange
//! books are initialized identically (bid 99 × 10, ask 101 × 10), the feed is
//! fully drained, then two marketable taker orders (buy 1 @ 101, sell 1 @ 99)
//! are executed. Result metrics are mapped per
//! `docs/09-analytics-and-investigation-suite.md` §9.1.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use hftbacktest::backtest::assettype::LinearAsset;
use hftbacktest::backtest::data::Data;
use hftbacktest::backtest::models::{
    CommonFees, ConstantLatency, RiskAdverseQueueModel, TradingValueFeeModel,
};
use hftbacktest::backtest::{Backtest, BacktestError, DataSource, ExchangeKind, L2AssetBuilder};
use hftbacktest::depth::{BTreeMarketDepth, L2MarketDepth, MarketDepth, ROIVectorMarketDepth};
use hftbacktest::prelude::{
    Bot, ElapseResult, Event, OrdType, TimeInForce, BUY_EVENT, DEPTH_EVENT, EXCH_EVENT,
    LOCAL_EVENT, SELL_EVENT,
};

use crate::contract::SimulatorContract;
use crate::error::EngineError;
use crate::execution_model::{resolve_execution_model, ResolvedExecutionModel};
use crate::metrics::RecorderSample;
use crate::types::{
    BacktestHandle, BacktestProgress, BacktestRequest, BacktestResult, BacktestStatus,
    DataQualityReport, DatasetRef, EventStream, EventType, HeadlineMetrics, PreparedDataset,
    Side as NormSide,
};

/// Engine-internal market-depth implementation choice (`docs/04` §4.4).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum MarketDepthKind {
    /// `depth::roivectormarketdepth::ROIVectorMarketDepth`: vector-backed L2
    /// book restricted to a range of interest — fastest. Default for
    /// well-bounded markets such as BTC/USDT (`docs/04` §4.4).
    #[default]
    RoiVector,
    /// `depth::btreemarketdepth::BTreeMarketDepth`: general-purpose
    /// BTreeMap-backed L2 book. Fallback for correctness-first /
    /// arbitrary-range scenarios (`docs/04` §4.4).
    BTree,
}

/// Simulator-specific config, constructed from [`BacktestRequest`].
#[derive(Clone, Debug)]
pub struct HftbacktestConfig {
    /// Engine-internal depth choice; defaults to [`MarketDepthKind::RoiVector`].
    pub market_depth: MarketDepthKind,
    /// Engine version string recorded on results (`docs/10` §10.3).
    pub engine_version: String,
    /// Block 2.3: the §8.7 execution model resolved to vendor selections
    /// (`docs/04` §4.4; see `execution_model.rs`). Applied to the vendor
    /// `Asset` builders when the execution path (`TODO(2.2)` below) lands.
    pub execution: ResolvedExecutionModel,
}

impl Default for HftbacktestConfig {
    fn default() -> Self {
        Self {
            market_depth: MarketDepthKind::default(),
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
            execution: ResolvedExecutionModel::default(),
        }
    }
}

impl HftbacktestConfig {
    /// Build simulator config from a normalized request.
    ///
    /// Validates request shape AND resolves the §8.7 execution model
    /// (fee/queue/latency/exchange/order-type selections per `docs/04` §4.4,
    /// wired in Block 2.3; presets beyond `Fixed`/supported queues are rejected
    /// as unsupported at run time, not silently approximated).
    pub fn from_request(req: &BacktestRequest) -> Result<Self, EngineError> {
        validate_request(req)?;
        Ok(Self {
            market_depth: MarketDepthKind::default(),
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
            execution: resolve_execution_model(&req.execution_model, &req.parameters)?,
        })
    }

    /// The resolved §8.7 execution model for this config.
    pub fn execution_model(&self) -> &ResolvedExecutionModel {
        &self.execution
    }
}

/// A running or completed backtest handle.
pub struct HftbacktestHandle {
    inner: BacktestHandle,
    progress: Mutex<BacktestProgress>,
    events: Mutex<EventStream>,
    result: Mutex<Option<BacktestResult>>,
    err: Mutex<Option<String>>,
}

impl HftbacktestHandle {
    fn new(handle_id: &str, total_events: u64) -> Self {
        let progress = BacktestProgress {
            job_id: handle_id.to_string(),
            events_processed: total_events,
            total_events,
            events_per_sec: 0.0,
            orders_submitted: 0,
            fills: 0,
            simulated_time_ns: 0,
            wall_clock_elapsed_ms: 0,
            status: BacktestStatus::Queued,
        };
        Self {
            inner: BacktestHandle {
                handle_id: handle_id.to_string(),
            },
            progress: Mutex::new(progress),
            events: Mutex::new(Vec::new()),
            result: Mutex::new(None),
            err: Mutex::new(None),
        }
    }

    /// Opaque handle id, for resolving API-level [`BacktestHandle`] ids.
    pub fn id(&self) -> &str {
        &self.inner.handle_id
    }

    /// NOTE: lock poisoning indicates a panicking holder thread; surfacing it
    /// as an engine error keeps the `Result` contract (`AGENTS.md` §5.1).
    fn lock_progress(&self) -> Result<std::sync::MutexGuard<'_, BacktestProgress>, EngineError> {
        self.progress
            .lock()
            .map_err(|_| EngineError::Engine("progress lock poisoned".to_string()))
    }
}

/// Implementation of [`SimulatorContract`] over vendored `hftbacktest`.
pub struct HftbacktestEngine {
    config: HftbacktestConfig,
    next_handle: Mutex<u64>,
    handles: Mutex<HashMap<String, Arc<HftbacktestHandle>>>,
}

impl HftbacktestEngine {
    pub fn new(config: HftbacktestConfig) -> Self {
        Self {
            config,
            next_handle: Mutex::new(0),
            handles: Mutex::new(HashMap::new()),
        }
    }

    /// The engine-version string recorded on results.
    pub fn engine_version(&self) -> &str {
        &self.config.engine_version
    }

    pub(crate) fn lookup(&self, id: &str) -> Result<Arc<HftbacktestHandle>, EngineError> {
        self.handles
            .lock()
            .map_err(|_| EngineError::Engine("handle store lock poisoned".to_string()))?
            .get(id)
            .cloned()
            .ok_or_else(|| EngineError::UnknownHandle(id.to_string()))
    }
}

impl SimulatorContract for HftbacktestEngine {
    type Config = HftbacktestConfig;
    type Handle = Arc<HftbacktestHandle>;

    fn validate_dataset(&self, dataset: &DatasetRef) -> Result<DataQualityReport, EngineError> {
        if dataset.dataset_id.trim().is_empty() {
            return Err(EngineError::InvalidDataset(
                "dataset_id must not be empty".to_string(),
            ));
        }
        // Quality computation (counts, gaps, ranges per `docs/05` §5.2) is the
        // Data Pipeline's job (Block 2.7); the abstraction must not invent
        // quality figures. Honest stub until that wiring lands.
        Err(EngineError::Unsupported(
            "dataset quality computation lives in Block 2.7 (backend/data/app/); \
             no fabricated DataQualityReport is returned"
                .to_string(),
        ))
    }

    fn prepare_dataset(&self, dataset: &DatasetRef) -> Result<PreparedDataset, EngineError> {
        if dataset.dataset_id.trim().is_empty() {
            return Err(EngineError::InvalidDataset(
                "dataset_id must not be empty".to_string(),
            ));
        }
        // Preparation stages (`docs/05` §5.2) land in Block 2.7.
        Err(EngineError::Unsupported(
            "dataset preparation stages land in Block 2.7 (backend/data/app/)".to_string(),
        ))
    }

    fn start_backtest(&self, req: BacktestRequest) -> Result<Self::Handle, EngineError> {
        let _config = HftbacktestConfig::from_request(&req)?;

        // The engine can currently execute only the bundled deterministic
        // fixture. Real datasets go through the pipeline (Block 2.7) and will
        // be executable once the fixture proof is merged; refusing loudly here
        // keeps us from ever inventing a dataset.
        if req.dataset_id != FIXTURE_DATASET_ID {
            return Err(EngineError::Unsupported(format!(
                "only {FIXTURE_DATASET_ID} can run in the abstraction today; \
                 prepared-dataset execution lands in Block 2.7 (backend/data/app/)"
            )));
        }
        // Latency-model presets are resolved in Block 2.3 Task C
        // (`docs/04` §4.4, `docs/12` §12.4); a non-Fixed request cannot be
        // executed honestly here.
        if !matches!(
            req.execution_model.latency_model,
            crate::types::LatencyModelKind::Fixed
        ) {
            return Err(EngineError::Unsupported(
                "only the Fixed latency model is wired in Block 2.2; Empirical/Custom \
                 resolve in Block 2.3 Task C"
                    .to_string(),
            ));
        }

        let mut next = self
            .next_handle
            .lock()
            .map_err(|_| EngineError::Engine("handle counter lock poisoned".to_string()))?;
        *next += 1;
        let handle_id = format!("bt-{}", *next);
        drop(next);

        let handle = Arc::new(HftbacktestHandle::new(&handle_id, TOTAL_FIXTURE_EVENTS));
        self.handles
            .lock()
            .map_err(|_| EngineError::Engine("handle store lock poisoned".to_string()))?
            .insert(handle_id, Arc::clone(&handle));

        {
            let mut progress = handle.lock_progress()?;
            progress.status = BacktestStatus::Running;
        }

        let started = Instant::now();
        match self.run(req, &handle) {
            Ok((result, last_feed_ts)) => {
                let mut progress = handle.lock_progress()?;
                progress.events_processed = TOTAL_FIXTURE_EVENTS;
                progress.orders_submitted = FIXTURE_ORDERS;
                progress.fills = result.headline.trades;
                progress.simulated_time_ns = last_feed_ts;
                progress.wall_clock_elapsed_ms = started.elapsed().as_millis() as u64;
                progress.events_per_sec = if started.elapsed().as_secs_f64() > 0.0 {
                    TOTAL_FIXTURE_EVENTS as f64 / started.elapsed().as_secs_f64()
                } else {
                    0.0
                };
                progress.status = BacktestStatus::Complete;
                *handle
                    .result
                    .lock()
                    .map_err(|_| EngineError::Engine("result lock poisoned".to_string()))? =
                    Some(result);
                *handle
                    .events
                    .lock()
                    .map_err(|_| EngineError::Engine("events lock poisoned".to_string()))? =
                    fixture_market_events();
            }
            Err(err) => {
                let mut progress = handle.lock_progress()?;
                progress.status = BacktestStatus::Failed;
                *handle
                    .err
                    .lock()
                    .map_err(|_| EngineError::Engine("error lock poisoned".to_string()))? =
                    Some(err.to_string());
            }
        }

        // Block 2.2 executes synchronously because the fixture run completes in
        // microseconds; the gateway/job-runner (Block 2.8) owns the async job
        // system that will surface long backtests through `poll_progress`.
        Ok(handle)
    }

    fn poll_progress(&self, handle: &Self::Handle) -> BacktestProgress {
        handle
            .lock_progress()
            .map(|p| p.clone())
            .unwrap_or_else(|_| BacktestProgress {
                job_id: handle.inner.handle_id.clone(),
                events_processed: 0,
                total_events: 0,
                events_per_sec: 0.0,
                orders_submitted: 0,
                fills: 0,
                simulated_time_ns: 0,
                wall_clock_elapsed_ms: 0,
                status: BacktestStatus::Failed,
            })
    }

    fn stream_events(&self, handle: &Self::Handle) -> EventStream {
        handle.events.lock().map(|e| e.clone()).unwrap_or_default()
    }

    fn collect_results(&self, handle: &Self::Handle) -> Result<BacktestResult, EngineError> {
        if let Some(msg) = handle
            .err
            .lock()
            .map_err(|_| EngineError::Engine("error lock poisoned".to_string()))?
            .clone()
        {
            return Err(EngineError::Engine(format!(
                "backtest failed before results were produced: {msg}"
            )));
        }
        handle
            .result
            .lock()
            .map_err(|_| EngineError::Engine("result lock poisoned".to_string()))?
            .clone()
            .ok_or_else(|| {
                EngineError::Unsupported("no completed result for this handle yet".to_string())
            })
    }

    fn cancel(&self, handle: &Self::Handle) -> Result<(), EngineError> {
        // Ensure the handle belongs to this engine instance.
        let _ = self.lookup(&handle.inner.handle_id)?;
        let mut progress = handle.lock_progress()?;
        // Sticky: an already-finished handle cannot be "un-finished".
        match progress.status {
            BacktestStatus::Queued | BacktestStatus::Running => {
                progress.status = BacktestStatus::Cancelled;
            }
            _ => {}
        }
        Ok(())
    }
}

impl HftbacktestEngine {
    /// Execute `req` against the bundled fixture dataset and map the real
    /// `hftbacktest` run into a [`BacktestResult`] plus the simulated time
    /// covered by the fixture feed.
    fn run(
        &self,
        req: BacktestRequest,
        handle: &HftbacktestHandle,
    ) -> Result<(BacktestResult, i64), EngineError> {
        let outcome = match self.config.market_depth {
            MarketDepthKind::RoiVector => {
                let (depth_min, depth_max) = fixture_roi_bounds();
                let depth = move || {
                    ROIVectorMarketDepth::new(
                        req.execution_model.tick_size,
                        req.execution_model.lot_size,
                        depth_min,
                        depth_max,
                    )
                };
                run_fixture_backtest::<ROIVectorMarketDepth>(&req, depth)?
            }
            MarketDepthKind::BTree => {
                let depth = move || {
                    BTreeMarketDepth::new(
                        req.execution_model.tick_size,
                        req.execution_model.lot_size,
                    )
                };
                run_fixture_backtest::<BTreeMarketDepth>(&req, depth)?
            }
        };
        let last_feed_ts = outcome.last_feed_ts;
        let result = headline_metrics(handle.id(), &self.config.engine_version, &req, &outcome);
        Ok((result, last_feed_ts))
    }
}

/// Everything re-derived from one deterministic run of the fixture.
///
/// The per-step Recorder series (`docs/04` §4.6) sampled at the reference
/// driver's observation points: post-feed-drain, post-each-fill, terminal.
/// Block 2.4 computes every headline metric from this series
/// (`crate::metrics`, `docs/09` §9.1) instead of terminal state alone.
struct RunOutcome {
    /// Recorder samples in time order (post-drain, post-buy-fill, terminal).
    samples: Vec<RecorderSample>,
    /// Timestamp of the last fixture feed event (simulated time span).
    last_feed_ts: i64,
}

/// Capture one Recorder observation from a live `Backtest`.
///
/// Takes exactly the fields upstream's `BacktestRecorder::record` takes
/// (`engine/vendor/hftbacktest/hftbacktest/src/backtest/recorder.rs`:
/// timestamp, mid price, balance, position, fee, num_trades, trading_volume,
/// trading_value) at the instant it is called. An empty book (no touch) is an
/// engine error, never a NaN sample — the driver only samples where the book
/// is populated.
///
/// The observation timestamp is passed in rather than read from
/// `current_timestamp()`: upstream only advances `cur_ts` when a pending event
/// exceeds the elapse target (`goto`, `backtest/mod.rs`), so once the event
/// queue is exhausted `cur_ts` goes stale — verified empirically, it still
/// reads the FIRST feed ts after the whole drain + both fills. The driver
/// instead books true simulated time: the last feed row's local ts for the
/// post-drain observation, plus one order-entry + order-response latency per
/// subsequent fill (`ConstantLatency`, `models/latency.rs`; the `wait = true`
/// submit path elapses exactly that far before the local state applies the
/// fill). This timestamp bookkeeping retires with the reference driver when
/// the strategy host (Block 2.6) and extended stream (Block 2.5) provide real
/// decision ticks.
fn sample<MD>(
    backtester: &Backtest<MD>,
    samples: &mut Vec<RecorderSample>,
    timestamp_ns: i64,
) -> Result<(), EngineError>
where
    MD: MarketDepth + L2MarketDepth + 'static,
{
    let depth = backtester.depth(0);
    let best_bid = depth.best_bid();
    let best_ask = depth.best_ask();
    if best_bid.is_nan() || best_ask.is_nan() {
        return Err(EngineError::Engine(
            "fixture backtest produced an empty book; no best bid/ask".to_string(),
        ));
    }
    let state = backtester.state_values(0).clone();
    samples.push(RecorderSample {
        timestamp_ns,
        price: f64::midpoint(best_bid, best_ask),
        position: state.position,
        balance: state.balance,
        fee: state.fee,
        num_trades: state.num_trades,
        trading_volume: state.trading_volume,
        trading_value: state.trading_value,
    });
    Ok(())
}

/// Run the bundled fixture through a real `Backtest<MD>`.
///
/// The fixture book is populated by dual EXCH+LOCAL depth feed events, so both
/// the exchange and local books end up with the same best bid/ask *before* any
/// order is submitted. Two deterministic marketable taker orders then fill at
/// 101 and 99 respectively.
fn run_fixture_backtest<MD>(
    req: &BacktestRequest,
    depth_fn: impl Fn() -> MD + 'static,
) -> Result<RunOutcome, EngineError>
where
    MD: MarketDepth + L2MarketDepth + 'static,
{
    let tick_size = req.execution_model.tick_size;
    let lot_size = req.execution_model.lot_size;
    if tick_size <= 0.0 || lot_size <= 0.0 {
        return Err(EngineError::InvalidRequest(
            "execution_model.tick_size and lot_size must be positive".to_string(),
        ));
    }

    // docs/09 §9.1 fees are value fractions; the request stores them in
    // percent, so divide by 100 here.
    let maker_frac = req.execution_model.maker_fee_pct / 100.0;
    let taker_frac = req.execution_model.taker_fee_pct / 100.0;

    let events = fixture_events();

    let asset = L2AssetBuilder::<
        ConstantLatency,
        LinearAsset,
        RiskAdverseQueueModel<MD>,
        MD,
        TradingValueFeeModel<CommonFees>,
    >::new()
    .data(vec![DataSource::Data(Data::from_data(&events))])
    .latency_model(ConstantLatency::new(
        FIXTURE_ORDER_ENTRY_NS,
        FIXTURE_ORDER_RESPONSE_NS,
    ))
    .asset_type(LinearAsset::new(1.0))
    .fee_model(TradingValueFeeModel::new(CommonFees::new(
        maker_frac, taker_frac,
    )))
    .queue_model(RiskAdverseQueueModel::<MD>::new())
    .depth(depth_fn)
    .exchange(if req.execution_model.allow_partial_fills {
        ExchangeKind::PartialFillExchange
    } else {
        ExchangeKind::NoPartialFillExchange
    })
    .build()
    .map_err(|e| EngineError::Engine(format!("asset build failed: {e}")))?;

    let mut backtester: Backtest<MD> = Backtest::builder()
        .add_asset(asset)
        .build()
        .map_err(|e| EngineError::Engine(format!("backtest build failed: {e}")))?;

    // Drain both feed processors completely. `UNTIL_END_OF_DATA` (= i64::MAX)
    // cannot be used as `wait_next_feed`'s timeout because that computes
    // `cur_ts + timeout` internally, which overflows; use a safe end-of-data
    // timeout derived from the current timestamp instead.
    loop {
        let timeout = i64::MAX - backtester.current_timestamp();
        let outcome = backtester
            .wait_next_feed(true, timeout)
            .map_err(backtest_error)?;
        if outcome == ElapseResult::EndOfData {
            break;
        }
    }

    // Recorder observation points (Block 2.4, `docs/04` §4.6): the reference
    // driver stands in for the future strategy host, so it samples explicitly
    // at post-drain (flat, fee-free baseline), after each fill response is
    // applied locally, and at the terminal state. Timestamps are booked by the
    // driver (see `sample`): last feed ts, then +entry+response per fill.
    let mut samples = Vec::with_capacity(3);
    let per_order_ns = FIXTURE_ORDER_ENTRY_NS + FIXTURE_ORDER_RESPONSE_NS;
    let t0 = FIXTURE_T0_NS + FIXTURE_FEED_STEP_NS;
    sample(&backtester, &mut samples, t0)?;

    // Marketable taker orders that fill immediately at the far touch. `wait =
    // true` runs until the fill response has been applied to the LOCAL state,
    // which is exactly what `state_values(0)` reads; its
    // `ElapseResult::EndOfData` return is the success signal, not an error.
    backtester
        .submit_buy_order(
            0,
            1,
            FIXTURE_ASK_PRICE,
            FIXTURE_BUY_QTY,
            TimeInForce::GTC,
            OrdType::Limit,
            true,
        )
        .map_err(backtest_error)?;
    sample(&backtester, &mut samples, t0 + per_order_ns)?;
    backtester
        .submit_sell_order(
            0,
            2,
            FIXTURE_BID_PRICE,
            FIXTURE_SELL_QTY,
            TimeInForce::GTC,
            OrdType::Limit,
            true,
        )
        .map_err(backtest_error)?;
    let _ = backtester.goto_end().map_err(backtest_error)?;
    sample(&backtester, &mut samples, t0 + 2 * per_order_ns)?;

    Ok(RunOutcome {
        samples,
        last_feed_ts: FIXTURE_T0_NS + FIXTURE_FEED_STEP_NS,
    })
}

/// Map the fixture Recorder series to result headline metrics.
///
/// All formulas cited (`docs/09` §9.1, computed in `crate::metrics` as ports
/// of upstream `py-hftbacktest/.../stats/metrics.py`, verified by the Python
/// parity test in `backend/experiments/app/metrics/`):
/// - Return = equity[-1] − equity[0] with equity = balance + position·mid − fee
///   (`LinearAsset`, contract size 1); the fixture starts flat, so
///   Return = equity_final = −2.10.
/// - Return% = Return / initial_capital × 100; final_capital = initial + Return.
/// - MaxDrawdown% = |min(equity − cummax(equity))| / initial × 100 (`docs/09` §9.3).
/// - Sharpe/Sortino over equity diffs, annualized with 365 trading days and 0%
///   risk-free (`docs/09` §9.1).
/// - Trades = fills observed; fill_rate = fills / orders_submitted; fees = fee[-1].
///
/// Slippage and per-event fills belong to the extended recording in Block 2.5
/// (`docs/09` §9.7) — left `NaN` here, never faked.
fn headline_metrics(
    job_id: &str,
    engine_version: &str,
    req: &BacktestRequest,
    outcome: &RunOutcome,
) -> BacktestResult {
    let computed = crate::metrics::headline(&outcome.samples, req.initial_capital, FIXTURE_ORDERS);

    BacktestResult {
        job_id: job_id.to_string(),
        experiment_id: String::new(),
        engine_version: engine_version.to_string(),
        headline: HeadlineMetrics {
            initial_capital: computed.initial_capital,
            final_capital: computed.final_capital,
            net_pnl: computed.net_pnl,
            return_pct: computed.return_pct,
            max_drawdown_pct: computed.max_drawdown_pct,
            sharpe: computed.sharpe,
            sortino: computed.sortino,
            trades: computed.trades,
            fill_rate_pct: computed.fill_rate_pct,
            fees: computed.fees,
            slippage: computed.slippage,
        },
        recorder_series_ref: String::new(),
        fine_grained_events_ref: String::new(),
    }
}

/// The fixture dataset id the abstraction can execute in Block 2.2.
pub const FIXTURE_DATASET_ID: &str = "fixture://tiny-btcusdt";
pub const FIXTURE_SYMBOL: &str = "BTCUSDT";
pub const FIXTURE_EXCHANGE: &str = "binance";
pub const FIXTURE_TICK_SIZE: f64 = 0.1;
pub const FIXTURE_LOT_SIZE: f64 = 0.001;
pub const FIXTURE_BID_PRICE: f64 = 99.0;
pub const FIXTURE_ASK_PRICE: f64 = 101.0;
pub const FIXTURE_BID_QTY: f64 = 10.0;
pub const FIXTURE_ASK_QTY: f64 = 10.0;
pub const FIXTURE_T0_NS: i64 = 1_000_000_000;
pub const FIXTURE_FEED_STEP_NS: i64 = 1_000_000;
pub const FIXTURE_BUY_QTY: f64 = 1.0;
pub const FIXTURE_SELL_QTY: f64 = 1.0;
pub const FIXTURE_ORDER_ENTRY_NS: i64 = 30_000;
pub const FIXTURE_ORDER_RESPONSE_NS: i64 = 30_000;
pub const FIXTURE_ROI_PAD_PRICE: f64 = 10.0;
pub const FIXTURE_ORDERS: u64 = 2;
pub const TOTAL_FIXTURE_EVENTS: u64 = 2;

/// Build the two dual EXCH+LOCAL depth feed events that initialize the book.
///
/// Each row is a single even with both the exchange and the local processor
/// flags, so both books see identical depth before any order is submitted.
/// `px` values divide cleanly by `FIXTURE_TICK_SIZE` (99.0/0.1 → 990,
/// 101.0/0.1 → 1010), so the depth indexing and the resulting fill price are
/// exact.
fn fixture_events() -> Vec<Event> {
    let t1 = FIXTURE_T0_NS + FIXTURE_FEED_STEP_NS;
    vec![
        Event {
            ev: BUY_EVENT | EXCH_EVENT | LOCAL_EVENT | DEPTH_EVENT,
            exch_ts: FIXTURE_T0_NS,
            local_ts: FIXTURE_T0_NS,
            px: FIXTURE_BID_PRICE,
            qty: FIXTURE_BID_QTY,
            order_id: 0,
            ival: 0,
            fval: 0.0,
        },
        Event {
            ev: SELL_EVENT | EXCH_EVENT | LOCAL_EVENT | DEPTH_EVENT,
            exch_ts: t1,
            local_ts: t1,
            px: FIXTURE_ASK_PRICE,
            qty: FIXTURE_ASK_QTY,
            order_id: 0,
            ival: 0,
            fval: 0.0,
        },
    ]
}

/// Range of interest for `ROIVectorMarketDepth`, padded around the fixture's
/// price extremes so the book's fixed range comfortably contains best bid/ask.
fn fixture_roi_bounds() -> (f64, f64) {
    let lo = (FIXTURE_BID_PRICE.min(FIXTURE_ASK_PRICE) - FIXTURE_ROI_PAD_PRICE).floor();
    let hi = (FIXTURE_BID_PRICE.max(FIXTURE_ASK_PRICE) + FIXTURE_ROI_PAD_PRICE).ceil();
    (lo, hi)
}

/// The event stream the engine replays for a fixture run: one `BookUpdate`
/// per fixture feed event (bid then ask), matching the input timeline.
fn fixture_market_events() -> EventStream {
    fixture_events()
        .iter()
        .map(|e| crate::types::MarketEvent {
            timestamp_ns: e.exch_ts,
            symbol: FIXTURE_SYMBOL.to_string(),
            exchange: FIXTURE_EXCHANGE.to_string(),
            event_type: EventType::BookUpdate,
            side: Some(if has_flags(e.ev, BUY_EVENT) {
                NormSide::Bid
            } else {
                NormSide::Ask
            }),
            price: Some(e.px),
            size: Some(e.qty),
            sequence: None,
            funding_rate: None,
            next_funding_time: None,
            open_interest: None,
            mark_price: None,
            index_price: None,
            basis: None,
        })
        .collect()
}

fn has_flags(event: u64, flags: u64) -> bool {
    event & flags == flags
}

fn backtest_error(err: BacktestError) -> EngineError {
    EngineError::Engine(format!("hftbacktest backtest error: {err}"))
}

/// Structural validation of a normalized backtest request.
///
/// Checks shape only (ids, ranges, counts); semantic validation against data
/// (e.g. date coverage) belongs to the pipeline / Block 2.7 path.
fn validate_request(req: &BacktestRequest) -> Result<(), EngineError> {
    if req.strategy_ref.id.trim().is_empty() {
        return Err(EngineError::InvalidRequest(
            "strategy_ref.id must not be empty".to_string(),
        ));
    }
    if req.dataset_id.trim().is_empty() {
        return Err(EngineError::InvalidRequest(
            "dataset_id must not be empty".to_string(),
        ));
    }
    if req.date_range.end_ns <= req.date_range.start_ns {
        return Err(EngineError::InvalidRequest(
            "date_range.end_ns must be after date_range.start_ns".to_string(),
        ));
    }
    if req.initial_capital <= 0.0 {
        return Err(EngineError::InvalidRequest(
            "initial_capital must be positive".to_string(),
        ));
    }
    if req.iterations == 0 {
        return Err(EngineError::InvalidRequest(
            "iterations must be at least 1".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_request() -> BacktestRequest {
        crate::types::BacktestRequest {
            strategy_ref: crate::types::StrategyRef {
                id: "fixture-strategy".to_string(),
                version: "0.0.1".to_string(),
                code_hash: "fixture".to_string(),
            },
            parameters: Vec::new(),
            dataset_id: FIXTURE_DATASET_ID.to_string(),
            date_range: crate::types::TimestampRange {
                start_ns: FIXTURE_T0_NS,
                end_ns: FIXTURE_T0_NS + FIXTURE_FEED_STEP_NS + 1,
            },
            initial_capital: 100_000.0,
            execution_model: crate::types::ExecutionModelConfig {
                maker_fee_pct: 0.02,
                taker_fee_pct: 0.05,
                tick_size: FIXTURE_TICK_SIZE,
                lot_size: FIXTURE_LOT_SIZE,
                latency_model: crate::types::LatencyModelKind::Fixed,
                queue_model_preset: "risk_adverse".to_string(),
                allow_partial_fills: true,
                order_types_allowed: vec![crate::types::OrderType::Limit],
            },
            risk_limits: crate::types::RiskLimitsConfig {
                max_position: 1.0,
                max_order_size: 1.0,
                max_daily_loss: 100.0,
                max_drawdown_pct: 20.0,
                max_open_orders: 10,
                max_order_rate_per_sec: 10.0,
                max_notional_exposure: 10_000.0,
                emergency_stop_enabled: false,
            },
            random_seed: None,
            iterations: 1,
        }
    }

    #[test]
    fn fixture_events_are_well_formed() {
        let events = fixture_events();
        assert_eq!(events.len(), 2);

        let bid = &events[0];
        assert_eq!(bid.exch_ts, FIXTURE_T0_NS);
        assert_eq!(bid.local_ts, FIXTURE_T0_NS);
        assert!(has_flags(bid.ev, BUY_EVENT | EXCH_EVENT | LOCAL_EVENT));
        assert!(!has_flags(bid.ev, SELL_EVENT));
        assert_eq!(bid.px, FIXTURE_BID_PRICE);
        assert_eq!(bid.qty, FIXTURE_BID_QTY);
        // 99.0 / 0.1 lands cleanly on the tick grid.
        assert_eq!(bid.px / FIXTURE_TICK_SIZE, 990.0);

        let ask = &events[1];
        assert_eq!(ask.exch_ts, FIXTURE_T0_NS + FIXTURE_FEED_STEP_NS);
        assert_eq!(ask.local_ts, ask.exch_ts);
        assert!(has_flags(ask.ev, SELL_EVENT | EXCH_EVENT | LOCAL_EVENT));
        assert!(!has_flags(ask.ev, BUY_EVENT));
        assert_eq!(ask.px, FIXTURE_ASK_PRICE);
        assert_eq!(ask.qty, FIXTURE_ASK_QTY);
        assert_eq!(ask.px / FIXTURE_TICK_SIZE, 1010.0);
    }

    #[test]
    fn roi_bounds_contain_the_whole_book() {
        let (lo, hi) = fixture_roi_bounds();
        assert!(lo < FIXTURE_BID_PRICE);
        assert!(hi > FIXTURE_ASK_PRICE);
    }

    #[test]
    fn fixture_run_captures_three_recorder_samples() {
        let req = fixture_request();
        let (depth_min, depth_max) = fixture_roi_bounds();
        let depth = move || {
            ROIVectorMarketDepth::new(
                req.execution_model.tick_size,
                req.execution_model.lot_size,
                depth_min,
                depth_max,
            )
        };
        let outcome = run_fixture_backtest::<ROIVectorMarketDepth>(&req, depth)
            .expect("fixture run succeeds");

        // Observation points: post-drain, post-buy-fill, terminal. Each
        // `wait = true` order elapses exactly order-entry + response latency.
        let per_order_ns = FIXTURE_ORDER_ENTRY_NS + FIXTURE_ORDER_RESPONSE_NS;
        let t0 = FIXTURE_T0_NS + FIXTURE_FEED_STEP_NS;
        assert_eq!(outcome.samples.len(), 3);
        assert_eq!(outcome.samples[0].timestamp_ns, t0);
        assert_eq!(outcome.samples[1].timestamp_ns, t0 + per_order_ns);
        assert_eq!(outcome.samples[2].timestamp_ns, t0 + 2 * per_order_ns);

        // Both books drained to bid 99 / ask 101 before trading: mid 100.
        for s in &outcome.samples {
            assert!((s.price - 100.0).abs() < 1e-12, "mid {}", s.price);
        }
        // Equities (balance + position·mid − fee):
        // flat 0; buy 1 @ 101 → −101 + 100 − 0.0505 = −1.0505;
        // sell 1 @ 99 → −2 + 0 − 0.1 = −2.10.
        let equity = |s: &RecorderSample| s.balance + s.position * s.price - s.fee;
        assert_eq!(equity(&outcome.samples[0]), 0.0);
        assert!((equity(&outcome.samples[1]) - (-1.0505)).abs() < 1e-9);
        assert!((equity(&outcome.samples[2]) - (-2.10)).abs() < 1e-9);
    }

    #[test]
    fn roi_vector_fixture_run_matches_hand_computed_metrics() {
        let req = fixture_request();
        let (depth_min, depth_max) = fixture_roi_bounds();
        let depth = move || {
            ROIVectorMarketDepth::new(
                req.execution_model.tick_size,
                req.execution_model.lot_size,
                depth_min,
                depth_max,
            )
        };
        let outcome = run_fixture_backtest::<ROIVectorMarketDepth>(&req, depth)
            .expect("fixture run succeeds");

        // Hand-computed expected terminal LOCAL state (AGENTS.md §5.7):
        // buy 1 @ 101 (taker) → balance −101, fee +101·0.0005 = 0.0505;
        // sell 1 @ 99 (taker) → balance +99, fee +99·0.0005 = 0.0495;
        // position 0, balance −2, fees 0.1, 2 trades. Read off the terminal
        // Recorder sample (identical to the old terminal-state read).
        let last = outcome.samples.last().expect("terminal sample");
        assert_eq!(last.position, 0.0);
        assert!(
            (last.balance - (-2.0)).abs() < 1e-9,
            "balance {}",
            last.balance
        );
        assert!((last.fee - 0.1).abs() < 1e-9, "fee {}", last.fee);
        assert_eq!(last.num_trades, 2);
        assert_eq!(last.trading_volume, 2.0);
        assert!((last.trading_value - 200.0).abs() < 1e-9);
    }

    #[test]
    fn btree_fixture_run_matches_roi_vector() {
        let req = fixture_request();
        let roi_depth = move || {
            let (depth_min, depth_max) = fixture_roi_bounds();
            ROIVectorMarketDepth::new(
                req.execution_model.tick_size,
                req.execution_model.lot_size,
                depth_min,
                depth_max,
            )
        };
        let roi_outcome = run_fixture_backtest::<ROIVectorMarketDepth>(&req, roi_depth)
            .expect("roi run succeeds");

        let btree_depth = move || {
            BTreeMarketDepth::new(req.execution_model.tick_size, req.execution_model.lot_size)
        };
        let btree_outcome = run_fixture_backtest::<BTreeMarketDepth>(&req, btree_depth)
            .expect("btree run succeeds");

        assert_eq!(roi_outcome.samples.len(), btree_outcome.samples.len());
        for (a, b) in roi_outcome.samples.iter().zip(&btree_outcome.samples) {
            assert_eq!(a.timestamp_ns, b.timestamp_ns);
            assert!((a.price - b.price).abs() < 1e-12);
            assert_eq!(a.position, b.position);
            assert!((a.balance - b.balance).abs() < 1e-9);
            assert!((a.fee - b.fee).abs() < 1e-9);
            assert_eq!(a.num_trades, b.num_trades);
        }
    }

    #[test]
    fn headline_metrics_are_hand_computed() {
        let req = fixture_request();
        // Fixture Recorder series (same shape the engine captures):
        // post-drain flat, post-buy, terminal. Timestamps mirror the run:
        // last feed ts, then one order-entry+response latency per fill.
        let per_order_ns = FIXTURE_ORDER_ENTRY_NS + FIXTURE_ORDER_RESPONSE_NS;
        let t0 = FIXTURE_T0_NS + FIXTURE_FEED_STEP_NS;
        let row = |t: i64, position: f64, balance: f64, fee: f64, num_trades: i64| RecorderSample {
            timestamp_ns: t,
            price: 100.0,
            position,
            balance,
            fee,
            num_trades,
            trading_volume: num_trades as f64,
            trading_value: 200.0 * num_trades as f64 / 2.0,
        };
        let outcome = RunOutcome {
            samples: vec![
                row(t0, 0.0, 0.0, 0.0, 0),
                row(t0 + per_order_ns, 1.0, -101.0, 0.0505, 1),
                row(t0 + 2 * per_order_ns, 0.0, -2.0, 0.1, 2),
            ],
            last_feed_ts: t0,
        };
        let result = headline_metrics("ut-test", "test", &req, &outcome);

        // docs/09 §9.1: Return = (equity − fee) − 0 = (0 − 2) − 0.1 = −2.10.
        assert!(
            (result.headline.net_pnl - (-2.10)).abs() < 1e-9,
            "net_pnl {}",
            result.headline.net_pnl
        );
        assert!((result.headline.fees - 0.1).abs() < 1e-9);
        assert!((result.headline.final_capital - 99_997.9).abs() < 1e-9);
        assert!(
            (result.headline.return_pct - (-2.1e-3)).abs() < 1e-9,
            "return_pct {}",
            result.headline.return_pct
        );
        assert_eq!(result.headline.trades, 2);
        assert_eq!(result.headline.fill_rate_pct, 100.0);
        // Max drawdown: equity [0, −1.0505, −2.10] never recovers above 0, so
        // |min dd| = 2.10; as % of 100_000 capital = 0.0021 (docs/09 §9.3).
        assert!(
            (result.headline.max_drawdown_pct - 0.0021).abs() < 1e-12,
            "max_drawdown_pct {}",
            result.headline.max_drawdown_pct
        );
        // Sharpe: diffs [−1.0505, −1.0495], mean −1.05, sample std 0.0005·√2;
        // first interval 60µs → c = 86_400/6e-5 × 365 = 5.256e11;
        // −1.05/0.0007071… × √c = −1_076_544_471.91… (hand-derived; upstream
        // Python parity test asserts the same figure from the other side).
        let rel = |a: f64, e: f64| (a - e).abs() / e.abs();
        assert!(
            rel(result.headline.sharpe, -1_076_544_471.91) < 1e-9,
            "sharpe {}",
            result.headline.sharpe
        );
        // Sortino: downside dev √mean(1.0505², 1.0495²) = 1.0500001…;
        // −1.05/1.0500001… × √c = −724_982.676_2… (hand-derived, same parity).
        assert!(
            rel(result.headline.sortino, -724_982.676_2) < 1e-9,
            "sortino {}",
            result.headline.sortino
        );
        // Owned by Block 2.5 — never fabricated.
        assert!(result.headline.slippage.is_nan());
    }

    #[test]
    fn engine_runs_fixture_synchronously_and_results_are_collectable() {
        let engine = HftbacktestEngine::new(HftbacktestConfig::default());
        let handle = engine
            .start_backtest(fixture_request())
            .expect("valid handle");

        let progress = engine.poll_progress(&handle);
        assert_eq!(progress.status, BacktestStatus::Complete);
        assert_eq!(progress.events_processed, 2);
        assert_eq!(progress.orders_submitted, 2);
        assert_eq!(progress.fills, 2);

        let result = engine.collect_results(&handle).expect("result ready");
        assert!((result.headline.net_pnl - (-2.10)).abs() < 1e-9);
        assert_eq!(result.job_id, progress.job_id);
        assert!(!result.engine_version.is_empty());
        // Block 2.4: the full series-based headline is populated end to end.
        assert!((result.headline.max_drawdown_pct - 0.0021).abs() < 1e-12);
        assert!(result.headline.sharpe.is_finite() && result.headline.sharpe < 0.0);
        assert!(result.headline.sortino.is_finite() && result.headline.sortino < 0.0);
        // Block 2.5 owns slippage: still NaN, never fabricated.
        assert!(result.headline.slippage.is_nan());

        // Complete is sticky; cancelling after completion is a no-op.
        engine.cancel(&handle).expect("cancel succeeds");
        assert_eq!(
            engine.poll_progress(&handle).status,
            BacktestStatus::Complete
        );
    }

    #[test]
    fn non_fixture_dataset_is_unsupported() {
        let engine = HftbacktestEngine::new(HftbacktestConfig::default());
        let mut req = fixture_request();
        req.dataset_id = "binance/usdm/BTCUSDT/2024-01-01".to_string();
        match engine.start_backtest(req) {
            Err(EngineError::Unsupported(_)) => {}
            Err(other) => panic!("expected Unsupported, got {other:?}"),
            Ok(_) => panic!("expected start_backtest to reject a non-fixture dataset"),
        }
    }
}
