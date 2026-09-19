//! The `SimulatorContract` — the simulator-agnostic engine interface.
//!
//! Verbatim from `docs/05-engine-abstraction-and-data-pipeline.md` §5.1: the
//! Job Runner, Experiment Store, and every UI panel talk to this contract, not
//! to `hftbacktest` types directly. `hftbacktest_impl.rs` is the only file
//! allowed to translate between these normalized types and `hftbacktest`'s
//! native `Asset`/`Event`/builder types.
//!
//! The `Send + Sync + 'static` bounds (an addition to the doc's sketch) are
//! required to host implementations behind the gRPC service (`docs/03` §3.4,
//! `docs/15` §15.4).

use crate::error::EngineError;
use crate::types::{
    BacktestProgress, BacktestRequest, BacktestResult, DataQualityReport, DatasetRef, EventStream,
    PreparedDataset,
};

/// Simulator-agnostic backtest engine contract (`docs/05` §5.1).
pub trait SimulatorContract: Send + Sync + 'static {
    /// Simulator-specific config, constructed from our normalized
    /// [`BacktestRequest`].
    type Config: Clone + Send + Sync + 'static;

    /// A running or completed backtest handle.
    type Handle: Send + Sync + 'static;

    /// Validate a dataset, returning its quality report (`docs/05` §5.2).
    fn validate_dataset(&self, dataset: &DatasetRef) -> Result<DataQualityReport, EngineError>;

    /// Prepare a dataset into the engine's native input layout.
    fn prepare_dataset(&self, dataset: &DatasetRef) -> Result<PreparedDataset, EngineError>;

    /// Start a backtest, returning its handle.
    fn start_backtest(&self, req: BacktestRequest) -> Result<Self::Handle, EngineError>;

    /// Poll the latest progress snapshot for a handle.
    fn poll_progress(&self, handle: &Self::Handle) -> BacktestProgress;

    /// Full event stream for replay and investigation.
    fn stream_events(&self, handle: &Self::Handle) -> EventStream;

    /// Collect the final result for a handle.
    fn collect_results(&self, handle: &Self::Handle) -> Result<BacktestResult, EngineError>;

    /// Cancel a running backtest.
    fn cancel(&self, handle: &Self::Handle) -> Result<(), EngineError>;
}
