//! Typed engine errors.
//!
//! Per `AGENTS.md` §5.1, no panics or context-free unwraps in engine code:
//! every fallible path returns `Result<_, EngineError>`.

use thiserror::Error;

/// Errors from the engine abstraction layer.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum EngineError {
    /// The referenced dataset failed validation or is unusable.
    #[error("invalid dataset: {0}")]
    InvalidDataset(String),

    /// A backtest handle id is unknown to this engine instance.
    #[error("unknown backtest handle: {0}")]
    UnknownHandle(String),

    /// The request itself is malformed (empty ids, inverted date range, …).
    #[error("invalid backtest request: {0}")]
    InvalidRequest(String),

    /// An extended-stream event failed structural validation (`docs/05` §5.5;
    /// caught at capture time by `ExtendedEvent::validate`, Block 2.5).
    #[error("invalid extended event: {0}")]
    InvalidEvent(String),

    /// Wiring explicitly deferred to a later block (e.g. full execution-model
    /// application in Block 2.3, dataset preparation stages in Block 2.7).
    /// Returned instead of silently stubbing behavior.
    #[error("unsupported in this phase: {0}")]
    Unsupported(String),

    /// Anything raised by the underlying simulator.
    #[error("engine failure: {0}")]
    Engine(String),
}
