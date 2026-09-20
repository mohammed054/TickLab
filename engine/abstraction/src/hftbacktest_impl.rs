//! `SimulatorContract` over the vendored `hftbacktest` crate.
//!
//! Per `docs/05-engine-abstraction-and-data-pipeline.md` §5.1, this is the
//! ONLY file allowed to translate between our normalized types and
//! `hftbacktest`'s native `Asset`/`Event`/builder types. Everything else talks
//! to [`crate::contract::SimulatorContract`].
//!
//! Market-depth default (Task 2.2 decision, `docs/04` §4.4): default to
//! `ROIVectorMarketDepth` — the fastest book, restricted to a configured range
//! of interest, which suits BTC/USDT whose price range is well-bounded — and
//! fall back to `BTreeMarketDepth` for correctness-first / arbitrary-range
//! scenarios. This is an engine-internal performance choice, not user-facing.
//!
//! NOTE: `engine/vendor/hftbacktest` is not initialized in this checkout, so
//! the exact builder-call translation is marked `TODO(2.2)` below and must be
//! finalized against the vendored source (module paths cited here come from
//! `docs/04` §4.2's source-grounded layout). Nothing here guesses at vendor
//! call signatures.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::contract::SimulatorContract;
use crate::error::EngineError;
use crate::execution_model::{resolve_execution_model, ResolvedExecutionModel};
use crate::types::{
    BacktestHandle, BacktestProgress, BacktestRequest, BacktestResult, BacktestStatus,
    DataQualityReport, DatasetRef, EventStream, PreparedDataset,
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
    /// (fee/queue/latency/exchange/order-type selections per `docs/04` §4.4).
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
}

impl HftbacktestHandle {
    fn new(handle_id: String, total_events: u64) -> Self {
        let progress = BacktestProgress {
            job_id: handle_id.clone(),
            events_processed: 0,
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
                handle_id: handle_id.clone(),
            },
            progress: Mutex::new(progress),
            events: Mutex::new(Vec::new()),
            result: Mutex::new(None),
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

        let mut next = self
            .next_handle
            .lock()
            .map_err(|_| EngineError::Engine("handle counter lock poisoned".to_string()))?;
        *next += 1;
        let handle_id = format!("bt-{}", *next);
        drop(next);

        let handle = Arc::new(HftbacktestHandle::new(handle_id.clone(), 0));
        self.handles
            .lock()
            .map_err(|_| EngineError::Engine("handle store lock poisoned".to_string()))?
            .insert(handle_id, Arc::clone(&handle));

        // TODO(2.2): drive the vendored run here once `engine/vendor/hftbacktest`
        // is initialized — compose `Asset::l2_builder()`/`l3_builder()` with the
        // configured `MarketDepth` (`depth::roivectormarketdepth` default,
        // `depth::btreemarketdepth` fallback), `LatencyModel`, `AssetType`,
        // `QueueModel`, `FeeModel`, and `ExchangeKind` per `docs/04` §§4.3–4.4,
        // stream `BacktestProgress` into the handle, and store the
        // `BacktestResult` plus the extended event stream (`docs/05` §5.5).
        // Deliberately no fabricated fills/metrics: `collect_results` errors
        // until a real run populates the handle.
        Ok(handle)
    }

    fn poll_progress(&self, handle: &Self::Handle) -> BacktestProgress {
        handle
            .lock_progress()
            .map(|p| p.clone())
            .unwrap_or(BacktestProgress {
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
        handle
            .result
            .lock()
            .map_err(|_| EngineError::Engine("result lock poisoned".to_string()))?
            .clone()
            .ok_or_else(|| {
                EngineError::Unsupported(
                    "no completed result for this handle yet; vendor execution \
                     wiring is TODO(2.2) pending engine/vendor/hftbacktest"
                        .to_string(),
                )
            })
    }

    fn cancel(&self, handle: &Self::Handle) -> Result<(), EngineError> {
        // Ensure the handle belongs to this engine instance.
        let _ = self.lookup(&handle.inner.handle_id)?;
        let mut progress = handle.lock_progress()?;
        progress.status = BacktestStatus::Cancelled;
        Ok(())
    }
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
    if !(req.initial_capital > 0.0) {
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
