//! TickLab Job Runner (`docs/16` Block 2.8 Task B, `docs/03` §3.5 `backend/jobs`).
//!
//! Owns job lifecycle/queueing over a CPU worker pool (`docs/05` §5.6) and
//! streams [`types::BacktestProgress`] per job. REST surface in [`api`];
//! the EngineService gRPC client (`docs/15` §15.4) attaches behind
//! [`runner`] once `engine/vendor/hftbacktest` lands — until then execution
//! is the deterministic runner-stage pipeline documented there, with no
//! fabricated financial figures (`AGENTS.md` §5.3).
//!
//! Module map (per `docs/03` §3.5, plus `api`/`types`/`bus` carrying the
//! §15.2/§15.5 contract):
//! - [`api`]: REST handlers + router.
//! - [`bus`]: progress topic names (== future NATS subjects, `docs/03` §3.1).
//! - [`queue`]: lifecycle store + worker pool.
//! - [`runner`]: execution loop + parent aggregation.
//! - [`sweep`], [`walkforward`], [`robustness`]: composite job fan-out.
//! - [`types`]: wire shapes mirroring `docs/15` §15.5.

pub mod api;
pub mod bus;
pub mod queue;
pub mod robustness;
pub mod runner;
pub mod sweep;
pub mod types;
pub mod walkforward;
