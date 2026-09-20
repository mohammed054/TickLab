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
//! - [`execution_model`]: Block 2.3 resolution of the §8.7 execution model into
//!   vendored `hftbacktest` model types (`docs/04` §4.4).
//! - [`event_analytics`]: Block 2.5 fill/markout/slippage, queue-calibration and
//!   latency analytics over the extended stream (`docs/09` §9.5–§9.9).
//! - [`extended_events`]: Block 2.5 extended order/fill event schema (`docs/05` §5.5).
//! - [`extended_recorder`]: Block 2.5 capture buffer + CSV/Parquet-schema persistence.
//! - [`hftbacktest_impl`]: the sole translator between normalized types and
//!   `hftbacktest` native types.
//! - [`metrics`]: headline metrics over the Recorder series (`docs/09` §9.1),
//!   ported from upstream's Polars `Metric` classes (`docs/04` §4.7).
//! - [`grpc_service`]: the `EngineService` gRPC host; `backend/jobs` is the
//!   primary client.

pub mod contract;
pub mod error;
pub mod event_analytics;
pub mod execution_model;
pub mod extended_events;
pub mod extended_recorder;
pub mod grpc_service;
pub mod hftbacktest_impl;
pub mod metrics;
pub mod types;
