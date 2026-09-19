/// hftbacktest_impl — Implementation of SimulatorContract over vendored hftbacktest.
/// 
/// This module wraps the vendored hftbacktest crate to provide the
/// SimulatorContract interface. It translates between the abstract types
/// defined in the contract and the concrete types used by hftbacktest.
use crate::contract::SimulatorContract;
use crate::error::EngineError;
use crate::types::{MarketState, BacktestResult, OrderFlow};
use hftbacktest::engine::{self, Engine};
use hftbacktest::types as hft_types;

/// Concrete implementation of SimulatorContract over the vendored hftbacktest engine.
pub struct HftbacktestEngine {
    /// The underlying hftbacktest engine instance.
    engine: Engine,
}

impl HftbacktestEngine {
    /// Create a new HftbacktestEngine from the given initial state.
    pub fn new(initial_state: hft_types::MarketState) -> Self {
        Self {
            engine: Engine::new(initial_state),
        }
    }
}

impl SimulatorContract for HftbacktestEngine {
    fn step(
        &self,
        state: &MarketState,
        flow: &OrderFlow,
    ) -> Result<BacktestResult, EngineError> {
        // Translate abstract types to hftbacktest types
        let hft_state = hft_types::MarketState {
            bids: state.bids.clone(),
            asks: state.asks.clone(),
            timestamp: state.timestamp,
        };

        let hft_flow = hft_types::OrderFlow {
            side: flow.side.into(),
            price: flow.price,
            size: flow.size,
            order_id: flow.order_id.clone(),
        };

        // Process the flow through the hftbacktest engine
        let result = self.engine.process(hft_flow);

        // Translate back to abstract types
        Ok(BacktestResult {
            fills: result.fills,
            latency_ms: result.latency_ms,
            status: result.status,
        })
    }

    fn validate_dataset(&self, dataset: &crate::types::Dataset) -> Result<(), crate::error::EngineError> {
        // Basic validation - check that the dataset has required fields
        if dataset.trades.is_empty() {
            return Err(EngineError::InvalidDataset("Dataset has no trades".into()));
        }
        if dataset.price_precision < 1 {
            return Err(EngineError::InvalidDataset("Invalid price precision".into()));
        }
        Ok(())
    }

    fn metadata(&self) -> crate::types::EngineMetadata {
        crate::types::EngineMetadata {
            name: "hftbacktest".into(),
            version: "1.0.0".into(),
            supports_l2: true,
            max_concurrent_backtests: 4,
        }
    }
}

impl From<hftbacktest::error::Error> for EngineError {
    fn from(err: hftbacktest::error::Error) -> Self {
        EngineError::Engine(format!("hftbacktest error: {}", err))
    }
}