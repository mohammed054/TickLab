//! TickLab engine abstraction layer.
//!
//! The simulator-agnostic contract (`docs/05-engine-abstraction-and-data-pipeline.md`
//! §5.1) over the vendored `hftbacktest` engine (`docs/04`), exposed to the
//! backend via gRPC (`docs/15-api-and-data-model-spec.md` §15.4).
//!
//! Module map (per `docs/03-tech-stack-and-repo-structure.md` §3.5):
//! - [`contract`]: the `SimulatorContract` trait — the only interface downstream
//!   services program against.
//! - [`types`]: normalized types mirroring `docs/15` §15.5.
//! - [`error`]: typed errors; no panics on fallible paths (`AGENTS.md` §5.1).
//! - [`hftbacktest_impl`]: the sole translator between normalized types and
//!   `hftbacktest` native types.
//! - [`grpc_service`]: the `EngineService` gRPC host; `backend/jobs` is the
//!   primary client.

pub mod contract;
pub mod error;
pub mod grpc_service;
pub mod hftbacktest_impl;
pub mod types;
