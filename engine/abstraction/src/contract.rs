/// SimulatorContract trait — the core abstraction for the backtest engine.
/// 
/// This trait defines the minimal interface needed by the backend (Python/Rust)
/// to interact with the underlying backtest engine. All financial calculations,
/// order execution, and state management must go through this contract to
/// ensure correctness and testability.
/// 
/// Key design goals:
/// - Deterministic: Same inputs → same outputs for a given state
/// - No side effects: Pure function semantics from the caller's perspective
/// - Typed: All financial quantities use precise types (not f64 where precision matters)
/// - Extensible: New features can be added without breaking existing callers
pub trait SimulatorContract: Send + Sync + 'static {
    /// Run a single backtest step with the given order flow.
    /// 
    /// # Arguments
    /// - `state`: Current market state (order book, positions, etc.)
    /// - `flow`: Incoming order flow to process
    /// 
    /// # Returns
    /// - `new_state`: Updated market state after processing the flow
    /// - `result`: Backtest result containing fills, metrics, etc.
    fn step(
        &self,
        state: &crate::types::MarketState,
        flow: &crate::types::OrderFlow,
    ) -> Result<crate::types::BacktestResult, crate::error::EngineError>;

    /// Validate that the given dataset is suitable for backtesting.
    ///
    /// # Arguments
    /// - `dataset`: The dataset to validate
    /// 
    /// # Returns
    /// - `Ok(())` if the dataset is valid
    /// - `Err` with reasons if the dataset is invalid
    fn validate_dataset(&self, dataset: &crate::types::Dataset) -> Result<(), crate::error::EngineError>;

    /// Get metadata about the engine's capabilities.
    fn metadata(&self) -> crate::types::EngineMetadata;
}