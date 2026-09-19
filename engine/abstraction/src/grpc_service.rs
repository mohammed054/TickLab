/// gRPC service for the engine abstraction layer.
/// 
/// This service exposes the SimulatorContract via gRPC, allowing the backend
/// (Python FastAPI) to interact with the backtest engine over a local process
/// boundary (Unix socket or TCP).
use ticklab_engine::contract::SimulatorContract;
use ticklab_engine::types::{MarketState, BacktestResult, OrderFlow};
use ticklab_engine::error::EngineError;

// Generated protobuf definitions for the engine gRPC service.
// 
// This file should be regenerated from engine.proto when the API changes.
// Currently it contains stub definitions for the core RPC methods.

/// Request to run a single backtest step.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct RunStepRequest {
    /// Current market state
    pub state: ticklab_engine::types::MarketState,
    /// Incoming order flow to process
    pub flow: ticklab_engine::types::OrderFlow,
}

/// Response from running a single backtest step.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct RunStepResponse {
    /// Updated market state after processing the flow
    pub new_state: ticklab_engine::types::MarketState,
    /// Backtest result containing fills, metrics, etc.
    pub result: ticklab_engine::types::BacktestResult,
}

/// Request to validate a dataset.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ValidateDatasetRequest {
    /// The dataset to validate
    pub dataset: ticklab_engine::types::Dataset,
}

/// Response from validating a dataset.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ValidateDatasetResponse {
    /// Whether the dataset is valid
    pub valid: bool,
    /// Reasons if the dataset is invalid (empty if valid)
    pub reasons: Vec<String>,
}

/// Request to get engine metadata.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct MetadataRequest {}

/// Response from getting engine metadata.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct MetadataResponse {
    /// Engine name
    pub name: String,
    /// Engine version
    pub version: String,
    /// Whether the engine supports Level-2 market data
    pub supports_l2: bool,
    /// Maximum number of concurrent backtests supported
    pub max_concurrent_backtests: usize,
}

/// gRPC service implementation that implements the SimulatorContract interface.
pub struct EngineGrpcService {
    /// The underlying simulator contract implementation.
    simulator: ticklab_engine::abstraction::hftbacktest_impl::HftbacktestEngine,
}

impl EngineGrpcService {
    /// Create a new EngineGrpcService.
    pub fn new(simulator: ticklab_engine::abstraction::hftbacktest_impl::HftbacktestEngine) -> Self {
        Self { simulator }
    }
}

impl ticklab_engine::grpc_service::EngineGrpcServiceApi for EngineGrpcService {
    fn run_step(
        &self,
        request: ticklab_engine::engine::RunStepRequest,
    ) -> Result<ticklab_engine::engine::RunStepResponse, ticklab_engine::error::EngineError> {
        let result = self.simulator.step(&request.state, &request.flow)?;
        Ok(ticklab_engine::engine::RunStepResponse {
            new_state: result.new_state,
            result: result.result,
        })
    }

    fn validate_dataset(
        &self,
        request: ticklab_engine::engine::ValidateDatasetRequest,
    ) -> Result<ticklab_engine::engine::ValidateDatasetResponse, ticklab_engine::error::EngineError> {
        self.simulator.validate_dataset(&request.dataset)
            .map(|()| ticklab_engine::engine::ValidateDatasetResponse { valid: true, reasons: vec![] })
    }

    fn metadata(
        &self,
        _request: ticklab_engine::engine::MetadataRequest,
    ) -> Result<ticklab_engine::engine::MetadataResponse, ticklab_engine::error::EngineError> {
        Ok(self.simulator.metadata())
    }
}