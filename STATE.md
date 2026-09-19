# STATE.md — Append-Only Session Log

**Read `AGENTS.md` before reading this file if you have not already.**

Rules:
- Never edit or delete a past entry. Only append new ones.
- Every entry follows the exact format in `AGENTS.md` §3.1.
- To find where to resume, read from the bottom up until you find the most recent
  `IN_PROGRESS` or `BLOCKED` entry, or the most recent `DONE` entry if none are open.
- Phase/Block/Task IDs reference `docs/16-implementation-roadmap.md`.

---

### [0.0.A] DONE — Full specification authored
Timestamp: 2026-09-18T00:00:00Z
Agent: claude-planner (Claude, Sonnet 5)
Status: DONE
Files touched:
  - AGENTS.md
  - README.md
  - STATE.md
  - docs/00-vision-and-principles.md
  - docs/01-architecture-overview.md
  - docs/02-two-monitor-workspace-spec.md
  - docs/03-tech-stack-and-repo-structure.md
  - docs/04-hftbacktest-engine-analysis.md
  - docs/05-engine-abstraction-and-data-pipeline.md
  - docs/06-realtime-live-data-architecture.md
  - docs/07-main-monitor-components.md
  - docs/08-secondary-monitor-components.md
  - docs/09-analytics-and-investigation-suite.md
  - docs/10-experiment-management-and-ai-research.md
  - docs/11-design-system.md
  - docs/12-execution-modes-and-risk.md
  - docs/13-data-management-and-monitoring.md
  - docs/14-cross-cutting-systems.md
  - docs/15-api-and-data-model-spec.md
  - docs/16-implementation-roadmap.md
Spec files read:
  - N/A (this entry created the specs)
Summary: Initial full specification for the BTC Quant Workstation authored from
scratch, grounded in a direct clone and source-level analysis of
github.com/nkaz001/hftbacktest (Rust core engine, Python/Numba strategy bindings,
L2/L3 market depth reconstruction, pluggable latency/queue/fee models, Rust-only
live connectors for Binance Futures/Spot and Bybit using iceoryx2 IPC, Polars-based
stats module). Covers vision, architecture, two-monitor UX spec, tech stack, engine
analysis, data pipeline, live low-latency architecture, every UI panel on both
monitors, the full analytics/investigation suite, experiment management + AI
research assistant, design system, execution-mode isolation and risk controls,
data management, cross-cutting systems (search/shortcuts/alerts/logging/states),
API and data model contracts, and a phased implementation roadmap with granular
tasks.
Deviations from spec: none (this is the spec).
Open questions for Planner: none yet — see "Open Decisions" register in
docs/16-implementation-roadmap.md §0 for decisions the Planner flagged for the
project owner (e.g. hosting/cloud provider, whether to target Binance Futures or
Bybit first for the live connector, exact GPU budget if any).
Next step: Project owner reviews docs/16-implementation-roadmap.md §0 "Open
Decisions," answers them (even briefly), then an Executor begins Phase 1, Block 1,
Task A ("Repo scaffold") as defined in docs/16-implementation-roadmap.md.

---

### [2.2.A] DONE — Define SimulatorContract trait and normalized types
Timestamp: 2026-09-19T15:56:17Z
Agent: executor-2 / big-pickle (opencode)
Status: DONE
Files touched:
  - engine/abstraction/src/contract.rs
  - engine/abstraction/src/types.rs
  - engine/abstraction/src/error.rs
  - engine/abstraction/src/lib.rs
Spec files read:
  - docs/05-engine-abstraction-and-data-pipeline.md §5.1
  - docs/15-api-and-data-model-spec.md §15.4, §15.5
Summary: Implemented the SimulatorContract trait (validate_dataset,
prepare_dataset, start_backtest, poll_progress, stream_events, collect_results,
cancel) over typed Result/EngineError, plus the full set of normalized types
(committed scaffold on this branch): BacktestRequest strategy/execution-model/
risk-limit sub-configs, BacktestHandle, BacktestProgress, BacktestStatus lifecycle,
BacktestResult with a HeadlineMetrics substruct, MarketEvent + EventStream,
DatasetRef/PreparedDataset/DataQualityReport and the pipeline progress type. Field
names match docs/15 §15.5 exactly (snake_case in Rust, camelCase over gRPC) so the
API boundary stays 1:1 with the spec.
Deviations from spec: none. DatasetRef/PreparedDataset/PipelineProgress shapes are
flagged as Planner-review assumptions in doc comments (docs/15 does not spell them
out); kept minimal and honest.
Open questions for Planner: none.
Next step: hftbacktest_impl.rs real run over vendored hftbacktest (Task B).

### [2.2.B] DONE — Implement hftbacktest_impl.rs over vendored hftbacktest incl. MarketDepth decision
Timestamp: 2026-09-19T15:56:17Z
Agent: executor-2 / big-pickle (opencode)
Status: DONE
Files touched:
  - engine/abstraction/src/hftbacktest_impl.rs
  - engine/abstraction/tests/roundtrip.rs
  - engine/abstraction/Cargo.toml
  - engine/abstraction/build.rs
  - engine/abstraction/rustfmt.toml
  - engine/abstraction/clippy.toml (deleted)
  - .gitignore
Spec files read:
  - docs/04-hftbacktest-engine-analysis.md §4.4 (Task 2.2 MarketDepth decision)
  - docs/05-engine-abstraction-and-data-pipeline.md §5.1
  - docs/09-analytics-and-investigation-suite.md §9.1
  - docs/15-api-and-data-model-spec.md §15.4
  - engine/vendor/hftbacktest/hftbacktest/ (types.rs, depth/, backtest/ source study)
**MarketDepth default decision (Task 2.2, docs/04 §4.4):** default =
`ROIVectorMarketDepth` for BTC/USDT because its price range is well-bounded and the
book is then vector-backed (fastest, contiguous storage restricted to a configured
range of interest); `BTreeMarketDepth` is implemented as the explicit fallback for
correctness-first / arbitrary-range scenarios. Both exposed via `MarketDepthKind`
(`#[default] RoiVector`) on `HftbacktestConfig`, request-private (one fresh instance
per run), and proven equivalent in unit test `btree_fixture_run_matches_roi_vector`.
Summary: Wrote the only legal translator between our normalized types and hftbacktest
native types (docs/05 §5.1): HftbacktestConfig::from_request with structural
validation; HftbacktestHandle + registry; synchronous fixture run path (Block 2.8 owns
async job surfacing) gated to FIXTURE_DATASET_ID = "fixture://tiny-btcusdt", with
non-fixture datasets refused loudly; latency preset restricted to Fixed (others land
Block 2.3 Task C). The run builds a real Backtest<MD> (L2AssetBuilder, ConstantLatency,
LinearAsset, TradingValueFeeModel/CommonFees, RiskAdverseQueueModel,
NoPartialFill/PartialFillExchange per allow_partial_fills), feeds dual EXCH+LOCAL
depth events (bid 99x10 at T0, ask 101x10 at T0+1ms), drains the feed, executes two
deterministic marketable taker orders (buy 1 @ 101, sell 1 @ 99), and maps real
terminal StateValues to headline metrics per docs/09 §9.1 (net_pnl -2.10,
final_capital 99_997.90, return_pct -0.0021, fees 0.10, trades 2, fill_rate 100%).
Sharpe/Sortino/max_drawdown/slippage are NaN and recorder/fine-grained refs empty —
owned by Blocks 2.4/2.5, never fabricated. Repaired the committed rustfmt.toml
(invalid TOML `<toolchain>/<edition>` broke `cargo fmt`) to edition=2021 and replaced
the contradictory clippy.toml with an equivalent [lints.clippy] table in Cargo.toml.
Acceptance: 15/15 tests pass, incl. the live-gRPC round-trip acceptance test.
Deviations from spec: none. Assumption flagged for Planner: the reference driver
(submit 2 deterministic orders, elapse to end-of-data) is a stand-in for a real
strategy host; real strategy submission arrives with Block 2.6 templates / strategy
hosting — the fixture proof is intentionally minimal and honest about it.
Open questions for Planner: none.
Next step: Task C confirms the gRPC surface and the round-trip acceptance test runs.

### [2.2.C] DONE — Stand up gRPC service, proven by round-trip acceptance test
Timestamp: 2026-09-19T15:56:17Z
Agent: executor-2 / big-pickle (opencode)
Status: DONE
Files touched:
  - engine/abstraction/proto/engine.proto
  - engine/abstraction/src/grpc_service.rs
  - engine/abstraction/build.rs
  - engine/abstraction/tests/roundtrip.rs
Spec files read:
  - docs/15-api-and-data-model-spec.md §15.4, §15.5
  - docs/16-implementation-roadmap.md Block 2.2 (acceptance text)
Summary: Confirmed the EngineService surface (start_backtest, collect_results,
stream_backtest_progress, stream_events, prepare_dataset + accessors) generated from
proto/engine.proto via tonic-build, and built the live acceptance test: an in-process
tonic server on an ephemeral 127.0.0.1 port driven by a real generated gRPC client.
grpc_round_trip_runs_real_backtest issues StartBacktest with FIXTURE_DATASET_ID,
streams progress (Complete, 2 events, 2 orders, 2 fills) and events (2 BookUpdate), and
CollectResults returns the hand-computed BacktestResult over the wire — satisfying the
Block 2.2 acceptance bar exactly ("a round-trip gRPC call runs a minimal real backtest
against a tiny fixture dataset and returns a BacktestResult").
Deviations from spec: none.
Open questions for Planner: none.
Next step: Block 2.2 complete; merge exec/executor-2 into main, then claim Block 2.3
(Execution Model Wiring), which depends on 2.2.

---
