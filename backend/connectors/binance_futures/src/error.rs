//! Typed connector errors (`docs/14` §14.9: actionable, never bare).

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConnectorError {
    #[error("config: {0}")]
    Config(String),
    #[error("websocket: {0}")]
    WebSocket(String),
    #[error("exchange message: {0}")]
    Decode(String),
    #[error("nats: {0}")]
    Nats(String),
}
