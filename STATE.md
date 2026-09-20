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

### [2.6] DONE — Strategy Parameter Schema and Templates (session closure)
Timestamp: 2026-09-19T14:38:06Z
Agent: opencode/big-pickle (executor-4)
Status: DONE
Files touched:
  - backend/experiments/app/tests/test_template_acceptance.py (new)
Spec files read:
  - docs/16-implementation-roadmap.md §Block 2.6
  - docs/08-secondary-monitor-components.md §8.4–§8.6
  - docs/03-tech-stack-and-repo-structure.md (service layout)
  - AGENTS.md §9 (multi-instance coordination)
Summary: Assigned Block 2.6. Prior executor-4 sessions had already implemented and
merged Task A (parameter schema, backend/experiments/app/parameter_schema.py) and
Task B (all 8 templates in backend/experiments/app/templates/) into main; the
coordination DB still showed 2.6 as claimed, so this session verified the merged
work against the Block acceptance criteria and closed it out. Re-ran VALIDATE +
fixture BACKTEST for all 8 templates (market_making, mean_reversion, momentum,
order_book_imbalance, statistical_arbitrage, execution, arbitrage, custom): every
template imports cleanly, exports STRATEGY_NAME/STRATEGY_DESCRIPTION/PARAMETER_SCHEMA,
every parameter carries all 9 minimum fields per §8.6 with unique keys and
JSON-serializable defaults matching the class defaults, and each strategy completed a
5000-bar deterministic random-walk fixture backtest without modification or error
(8/8). Added a durable pytest acceptance test at
backend/experiments/app/tests/test_template_acceptance.py (16 checks, 16 passed),
following executor-3's colocated-test convention (backend/data/app/tests).
Deviations from spec: none.
Open questions for Planner: pre-existing bug outside this Block's owned directories —
root() and health() in backend/experiments/app/main.py:61,65 build dict literals
without `return`, so GET / and /health respond with a null body.
Next step: human merges branch exec/executor-4 (this session only adds the acceptance
test plus this STATE.md folding); no remaining 2.6 work.

---

### [2.5] IN_PROGRESS — Extended Event/Fill Recording (implementation complete, pending merge)
Timestamp: 2026-09-20T14:30:00Z
Agent: executor-4 (Muse Spark, ws-executor-4, branch exec/executor-4)
Status: IN_PROGRESS
Files touched:
  - engine/abstraction/src/extended_events.rs (new)
  - engine/abstraction/src/extended_recorder.rs (new)
  - engine/abstraction/src/event_analytics.rs (new)
  - engine/abstraction/tests/extended_events.rs (new)
  - engine/abstraction/src/lib.rs
  - engine/abstraction/src/hftbacktest_impl.rs
  - engine/abstraction/src/error.rs
  - engine/abstraction/src/grpc_service.rs
  - engine/abstraction/Cargo.toml
  - engine/abstraction/build.rs
  - engine/abstraction/rustfmt.toml
  - engine/abstraction/clippy.toml
Spec files read:
  - docs/16-implementation-roadmap.md §Phase 2 Block 2.5
  - docs/05-engine-abstraction-and-data-pipeline.md §5.5
  - docs/04-hftbacktest-engine-analysis.md §4.3, §4.6, §4.10
  - docs/09-analytics-and-investigation-suite.md §9.5, §9.6, §9.7, §9.8, §9.9
  - docs/03-tech-stack-and-repo-structure.md §3.1, §3.5
Summary: Implemented Block 2.5 Tasks A-C entirely inside engine/abstraction/.
Task A: hook-point map (H1-H8) documented in extended_events.rs from direct
reads of the vendored 0.9.4 source (Bot trait order/time methods, Local
submit/modify/cancel + USE_HANDLER response path, LocalToExch::request /
ExchToLocal::respond bus boundary, NoPartialFill/PartialFillExchange +
queue/latency models, BacktestRecorder); all hooks are observation-only and
nothing under engine/vendor/ was modified. Task B: ExtendedEvent schema with
the exact §5.5 field list plus validation, ExtendedRecorder capture buffer
keyed by experiment_id with monotonic-timestamp enforcement, std-only CSV
persistence, and a canonical Parquet message schema + column list for the
Python/Polars writer (no new Rust dependency per AGENTS.md §5.5). Task C:
fill_stats + markout/slippage primitives (§9.5/§9.6/§9.7), queue progression
+ fill-rate calibration buckets (§9.8), latency p50/p90/p99 + component
reconciliation gap (§9.9), every formula cited to its doc section.
Acceptance test tests/extended_events.rs drives a 13-row lifecycle fixture
(submit/queue/partial/fill/cancel/reject/expire/decision-tick) plus a
Recorder-shaped coarse series through the same run and asserts hand-computed
fill/queue/latency results, CSV round-trip, schema coverage, engine-handle
capture, and the vendor Status/Side mapping against real vendored types.
`cargo test`: 25 passed, 0 failed (13 lib unit incl. 12 new, 7 new
acceptance, 5 pre-existing Block 2.2 roundtrip still green).
Deviations from spec: (1) Parquet bytes are written by the Python/Polars
layer from the published schema, not by a new Rust parquet crate — new
top-level dependency avoided per AGENTS.md §5.5; native Rust encoding, if
ever wanted, is a NEEDS_PLANNER_REVIEW crate addition against this schema.
(2) Full in-engine auto-feed (calling the recorder from inside
start_backtest's vendor run) awaits TODO(2.2) vendor execution wiring; the
handle-level record_extended/extended_events API is the injection surface so
no schema or test changes are needed when it lands.
Open questions for Planner: none for 2.5 scope. Environment note (outside
owned dirs, FYI only): this machine had no C linker (rust-gnu toolchain
without MinGW/MSVC), so cargo could never link; provisioned a user-local
w64devkit GCC (no admin, outside all clones) to run the suite — other Rust
blocks (2.3/2.4/2.8) can reuse PATH=$HOME/.local-tools/w64devkit/w64devkit/bin.
Pre-existing repairs logged here (all inside engine/abstraction/): Cargo.toml
hftbacktest path pointed at the workspace root (virtual manifest, broke ALL
cargo invocations — now points at vendor/hftbacktest/hftbacktest with
backtest-only features); build.rs used a nonexistent tonic-build API
(compile_protos → compile); rustfmt.toml and clippy.toml were invalid TOML
breaking cargo fmt/clippy (rewritten minimally).
Next step: human merges branch exec/executor-4 into main per AGENTS.md §9.6
(merger note: 2.3 also edits hftbacktest_impl.rs/lib.rs — my hunks there are
append-only and delimited by Block 2.5 comments); then coordination done 2.5.

---
