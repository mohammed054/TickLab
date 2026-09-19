# 16 — Implementation Roadmap

This is the Planner-owned breakdown of all work into Phases → Blocks → Tasks. Every
`STATE.md` entry references a `Phase.Block.Task` ID from this document
(`AGENTS.md` §3). Tasks are intentionally left slightly open at the leaf level (an
Executor may need to split a Task into sub-steps) but never at the Block level —
every Block's scope and acceptance bar is fully determined by the spec files it
references.

## §0 — Open Decisions (project owner must answer before the referenced phase)

These are real decisions this document cannot make unilaterally. Each is logged
here rather than guessed at in the specs above.

| # | Decision | Needed before | Referenced in |
|---|---|---|---|
| OD-1 | Target exchange for the first live connector (Binance Futures vs. Bybit vs. both in parallel) | Phase 5 | `docs/06-realtime-live-data-architecture.md` §6.6 |
| OD-2 | Colocation/infrastructure approach for Live-mode latency (cloud region near exchange vs. bare-metal/colocation provider vs. accept standard cloud latency initially) | Phase 5 | `docs/06` §6.6 |
| OD-3 | Cloud provider / hosting target for the Phase 5+ scale-out Kubernetes deployment | Phase 5 | `docs/03-tech-stack-and-repo-structure.md` §3.8 |
| OD-4 | Minimum Paper-trading track record (duration and/or fill count) required before a strategy is Live-eligible | Phase 5 | `docs/12-execution-modes-and-risk.md` §12.4 |
| OD-5 | Initial LLM provider/model for the AI Research Assistant (the client is provider-agnostic by design, but an initial choice is needed to build against) | Phase 4, Block 4.7 | `docs/10-experiment-management-and-ai-research.md` §10.5.2 |
| OD-6 | License for `/frontend`, `/backend`, `/docs` (separate from the inherited MIT license on vendored `/engine`) | Before any public repo visibility | `README.md` |
| OD-7 | Whether Phase 1–4 development targets a single local developer machine only, or a small shared dev server, for resource planning (affects worker-pool sizing defaults, `docs/05-engine-abstraction-and-data-pipeline.md` §5.6) | Phase 1 | `docs/03-tech-stack-and-repo-structure.md` §3.7 |

An Executor reaching a point that depends on an unanswered OD-# logs a `BLOCKED`
`STATE.md` entry citing the exact OD number rather than guessing.

## Phase 0 — Specification

Status: **DONE** (see `STATE.md` entry `[0.0.A]`). All of `docs/00`–`docs/15` plus
this document. Any future spec change is a new dated addendum to the relevant doc,
not a silent edit erasing the reasoning that produced the original — if a decision
made here turns out to be wrong, say so explicitly in the doc and explain why,
rather than quietly rewriting history.

## Phase 1 — Foundation and Scaffold

**Goal**: an empty-but-real skeleton matching `docs/03-tech-stack-and-repo-structure.md`
§3.5, runnable end-to-end with no features, before any real feature work starts.

### Block 1.1 — Repo Scaffold
- Task A: Create the full directory tree from `docs/03` §3.5 (empty files/`README`
  stubs where code will go). This is the exact task referenced as "Phase 1, Block 1,
  Task A" in `STATE.md`'s seed entry.
- Task B: Vendor `hftbacktest` into `engine/vendor/hftbacktest` (git subtree,
  preserving upstream history/attribution) per `docs/04-hftbacktest-engine-analysis.md`.
- Task C: Root tooling — `docker-compose.yml` skeleton (services from `docs/03` §3.7
  with placeholder healthcheck-only containers), `.gitignore` (must exclude `/data`
  per `docs/03` §3.5), formatting/lint configs per language.

**Acceptance**: `docker-compose up` starts all placeholder services and they report
healthy; repo tree matches `docs/03` §3.5 exactly (a Planner review step, not just an
Executor self-check).

### Block 1.2 — CI and Test Harness
- Task A: CI pipeline running lint + unit test placeholders for Rust, Python, and
  TypeScript packages.
- Task B: `tests/integration` and `tests/e2e` scaffolds with one trivial smoke test
  each, wired into CI, so later phases add tests into an already-working harness
  rather than bootstrapping CI mid-project.

**Acceptance**: CI is green on the scaffold; a deliberately-broken smoke test fails
CI (verifying the harness actually catches failures).

## Phase 2 — Engine, Data, and Backend Core

**Goal**: a backend that can validate a dataset, run a real backtest through the
vendored engine, and return real results — no UI yet, verified via API calls
directly (e.g., `curl`/API client scripts in `scripts/`).

### Block 2.1 — Data Models and Persistence
- Task A: Postgres DDL for every table implied by `docs/15-api-and-data-model-spec.md`
  §15.5 (`strategies, experiments, datasets, notes, alert_history,
  workspace_presets, instrument_metadata, user_chart_prefs, audit_log`).
- Task B: Migration tooling setup.

**Spec files**: `docs/15` §15.5. **Acceptance**: migrations apply cleanly; every
field name matches §15.5 exactly (a literal diff-check against the doc).

### Block 2.2 — Engine Abstraction Layer Core
- Task A: Define the `SimulatorContract` trait and normalized types
  (`docs/05-engine-abstraction-and-data-pipeline.md` §5.1).
- Task B: Implement `hftbacktest_impl.rs` over vendored `hftbacktest`, including the
  `MarketDepth` default decision referenced as **Task 2.2**
  (`docs/04-hftbacktest-engine-analysis.md` §4.4) — document the chosen default
  (`ROIVectorMarketDepth` vs. `BTreeMarketDepth`) and why, in the `STATE.md` entry.
- Task C: Stand up the gRPC service (`engine.proto`, `docs/15` §15.4).

**Spec files**: `docs/04`, `docs/05` §5.1, `docs/15` §15.4. **Acceptance**: a
round-trip gRPC call runs a minimal real backtest against a tiny fixture dataset and
returns a `BacktestResult`.

### Block 2.3 — Execution Model Wiring
- Task A: Wire `FeeModel`, `AssetType`, `ExchangeKind` through the contract exactly
  per `docs/04` §4.4's mapping table.
- Task B (**Task 2.3.B**): Finalize the exact `QueueModel` preset list
  ("risk-averse," "probabilistic," "power," "custom") against the real model names
  present in `hftbacktest`'s `models/` source, per `docs/04` §4.4 — this requires
  reading the vendored source directly, not assuming the preset names in the doc are
  final; correct the doc if the real model names differ.
- Task C: Wire the `LatencyModel` options (fixed / empirical / custom) per `docs/04`
  §4.4.

**Acceptance**: all `docs/08-secondary-monitor-components.md` §8.7 Execution Model
fields are settable via the API and demonstrably affect backtest output (e.g.,
changing the queue model preset changes fill timing in a fixture backtest).

### Block 2.4 — Metrics and Stats Integration
- Task A (**Task 2.4**): Decide and implement the placement of the metrics engine
  extension point (`engine/abstraction/metrics/` vs.
  `backend/experiments/app/metrics/`) — log the decision in `STATE.md`.
- Task B: Wrap upstream's Polars-based `Metric` classes (`docs/04` §4.7) for the
  headline metrics (`docs/09-analytics-and-investigation-suite.md` §9.1).

**Acceptance**: headline metrics on a fixture backtest match hand-computed expected
values (unit test, per `AGENTS.md` §5.7).

### Block 2.5 — Extended Event/Fill Recording
Referenced throughout as **Phase 2, Block 2.5** — the non-trivial engineering task
of hooking into the engine's Local/Exchange processor boundary to capture the
fine-grained event stream defined in `docs/05-engine-abstraction-and-data-pipeline.md`
§5.5, beyond upstream's coarse `Recorder`.
- Task A: Identify the exact hook points in `hftbacktest`'s Local/Exchange processor
  code (`docs/04` §4.3) where order lifecycle events and strategy decision ticks can
  be observed without altering upstream's own simulation semantics.
- Task B: Implement capture and Parquet serialization of the extended stream
  (schema per `docs/05` §5.5).
- Task C: Validate that Fill Analysis, Queue Analysis, and Latency Analysis
  (`docs/09` §9.5, §9.8, §9.9) can be computed end-to-end from this stream on a
  fixture backtest.

**Acceptance**: a fixture backtest produces both the standard `Recorder` output and
the extended stream; §9.5/§9.8/§9.9's computations run against real captured data,
not mocked data.

### Block 2.6 — Strategy Parameter Schema and Templates
- Task A (**Task 2.6**): Finalize the parameter schema format referenced in
  `docs/08-secondary-monitor-components.md` §8.6 (key, label, type, min, max, step,
  default, description, group, at minimum).
- Task B: Implement the strategy templates listed in `docs/08` §8.5
  (`market_making, mean_reversion, momentum, order_book_imbalance,
  statistical_arbitrage, execution, arbitrage, custom`) as real, runnable starter
  strategies against the engine, not just scaffolding text.

**Acceptance**: each template produces a strategy that passes `VALIDATE` and
completes a fixture `BACKTEST` without modification.

### Block 2.7 — Data Pipeline
- Task A–F: Implement each stage from `docs/05` §5.2 in order (Validation,
  Normalization, Order Book Reconstruction, Trade Alignment, Timestamp Validation,
  HftBacktest-format conversion), reusing upstream utilities per `docs/04` §4.9
  wherever they exist.
- Task G: Implement `DataQualityReport` generation and the 🔴-blocks-backtest rule
  (`docs/05` §5.2, `docs/08` §8.10).

**Acceptance**: a known-good historical dataset and a deliberately-corrupted fixture
dataset both pass through the pipeline, producing correct 🟢 and 🔴 outcomes
respectively; the corrupted one is confirmed to block `BACKTEST` via the API.

### Block 2.8 — Gateway and Job Runner
- Task A: Gateway WS/REST skeleton with the async-job pattern
  (`docs/01-architecture-overview.md` §1.5): submit → job ID → progress stream →
  result.
- Task B: Job Runner worker pool (`docs/05` §5.6), sized per OD-7's resource
  assumption.
- Task C: `workspace.sync` topic fan-out (`docs/15` §15.3.4) — implementable and
  testable even before any real frontend exists, via a WS test client.

**Acceptance**: two concurrent WS test clients see each other's `workspace.sync`
patches; a submitted backtest job streams real progress and completes.

## Phase 3 — Frontend Core: Main Monitor

**Goal**: `docs/07-main-monitor-components.md` fully implemented against the Phase 2
backend, viewable via the `SingleDisplayShell` fallback (`docs/02` §2.6) for
single-screen development.

### Block 3.1 — Sync Bus and Shell
- Task A: `WorkspaceContext` store (`docs/02` §2.3.1) wired to `workspace.sync`.
- Task B: `MainMonitorShell`, `SecondaryMonitorShell`, `SingleDisplayShell` skeletons
  (`docs/03` §3.3).

### Block 3.2 — Header and Chart
- Task A: `GlobalHeader` (`docs/07` §7.1).
- Task B: `PriceChart` with candle mode + hover tooltip (`docs/07` §7.2.1–§7.2.3).
- Task C: Remaining chart modes, overlays, and interactions (§7.2.4–§7.2.7).

### Block 3.3 — Order Book
- Task A: `OrderBookLadder` canvas renderer (`docs/07` §7.3).
- Task B: Depth/aggregation controls, including the **Task 3.3** decision
  (`docs/07` §7.5) of client-side vs. server-side re-aggregation — log the choice
  made in `STATE.md`.
- Task C: Remaining book modes (`docs/07` §7.4).

### Block 3.4 — Flow, Microstructure, Regime
`OrderFlowPanel`, `MicrostructurePanel`, `MarketRegimePanel` (`docs/07` §7.8–§7.10),
depending on Phase 2's volatility/OBI/regime computations
(`docs/09-analytics-and-investigation-suite.md` §9.10, §9.11, §9.15) being available
via API.

### Block 3.5 — Strategy, Inventory, Risk, Execution, Bottom Bar
`StrategyMonitorPanel`, strategy-quote ladder highlighting, `InventoryPanel`,
`RiskPanel`, `ExecutionMonitorPanel`, `BottomBar` (`docs/07` §7.11–§7.16), plus all
empty/loading states (`docs/14-cross-cutting-systems.md` §14.7–§14.8).

**Phase 3 acceptance**: a user can point the frontend at a Phase-2 backend running a
replay of a fixture dataset and watch the full Main Monitor update live and
correctly, including a manual crosshair-lock → timestamp-commit interaction
(`docs/07` §7.2.5–§7.2.6) even with no Secondary Monitor yet built.

## Phase 4 — Frontend Core: Secondary Monitor, Analytics, and Research Tools

**Goal**: the full research loop end-to-end — write/edit a strategy, configure a
backtest, run it, investigate results down to individual events, manage
experiments — plus the AI Research Assistant.

### Block 4.1 — Strategy Editor and Parameters
`docs/08-secondary-monitor-components.md` §8.3–§8.6, Monaco integration, parameter
form generation from the Block 2.6 schema.

### Block 4.2 — Dataset Selector and Data Quality
`docs/08` §8.8–§8.11, wired to Phase 2's Data Pipeline (Block 2.7).

### Block 4.3 — Backtest Configuration, Progress, Results
`docs/08` §8.7, §8.12–§8.16, wired to Phase 2's Job Runner (Block 2.8) and Metrics
(Block 2.4).

### Block 4.4 — Full Analytics Suite
Implement every view in `docs/09-analytics-and-investigation-suite.md` §9.2–§9.13 as
a sub-view of the Analytics Tab (`docs/08` §8.25), each backed by its Phase 2 data
source (`Recorder` stream or extended event stream, Block 2.5).

### Block 4.5 — Replay, Event Inspector, Why Investigation
`docs/08` §8.17–§8.22, including full Main↔Secondary synchronization
(`docs/02-two-monitor-workspace-spec.md` §2.3.2, §2.4).

### Block 4.6 — Experiment Management and Research Notes
`docs/10-experiment-management-and-ai-research.md` §10.1–§10.4, §10.6–§10.7
(Experiment Tree, Reproduce, Notes, Export, Report Builder), `docs/08` §8.23–§8.24.

### Block 4.7 — AI Research Assistant
`docs/10` §10.5, using **OD-5**'s chosen initial LLM provider. Must pass a
deliberate test: ask it a question from `docs/09` §9.14's table and verify its
answer cites the correct underlying evidence query, not a freeform explanation.

### Block 4.8 — Logs, Alerts, Search, Command Palette
`docs/14-cross-cutting-systems.md` §14.1–§14.4, §14.6.

### Block 4.9 — L3 (Market-By-Order) Backtest Support
Per `docs/05-engine-abstraction-and-data-pipeline.md` §5.4's "Later ✅ Phase 4" row:
extend the Data Pipeline and Dataset Selector for L3 data, clearly labeled as
backtest-only per the live limitation in `docs/04-hftbacktest-engine-analysis.md`
§4.10/§4.5.

**Phase 4 acceptance**: the full "wow experience" sequence in
`docs/00-vision-and-principles.md` §0.7, items 1–9, is achievable end-to-end by a
real user without any mocked data.

## Phase 5 — Paper and Live Trading

**Goal**: Paper trading validated in real use, then Live trading enabled, gated
exactly per `docs/12-execution-modes-and-risk.md`.

### Block 5.1 — Live Market Data Ingestion (read-only)
`docs/06-realtime-live-data-architecture.md` §6.2–§6.4: stand up the Live Exchange
Connector (extending `hftbacktest`'s `connector/` crate) for **OD-1**'s chosen
exchange, feeding the Market Data Service and, via NATS, the frontend — with no
order-entry capability enabled yet.

### Block 5.2 — Paper Fill Simulation
`docs/12` §12.2's Paper isolation mechanism: reuse the backtest engine's
Local/Exchange fill-simulation logic against the live book. Includes evaluating the
exchange's WebSocket order-entry API as a lower-latency alternative to REST for the
eventual Live path — this is the item referenced as a **"Phase 4 task"** in
`docs/06` §6.5's latency table footnote; if not completed by Phase 4, it is
completed here at the latest, before Live order entry is built.

### Block 5.3 — Paper Mode Rollout
`docs/12` §12.3, Strategy status-gate enforcement (`docs/12` §12.6), full
Main/Secondary Monitor operation in `PAPER` environment.

**Block 5.3 acceptance / gate**: a real strategy runs in Paper for **OD-4**'s
minimum track record before Block 5.4 may begin — this is a hard process gate, not
just a technical one.

### Block 5.4 — Live Trading Enablement
`docs/12` §12.4 (Live entry gate), §12.7 (feature flags), §12.8 (kill switch, fully
enforced with audit logging per `docs/14` §14.5). Requires **OD-2**'s
colocation/infra decision executed for the connector's deployment.

### Block 5.5 — Initial Scale-Out
`docs/03-tech-stack-and-repo-structure.md` §3.8 and
`docs/06-realtime-live-data-architecture.md` §6.2's "Phase 5+" multi-bot-per-
connector IPC scaling, using **OD-3**'s chosen cloud provider.

## Phase 6 — Multi-Symbol, Derivatives, and Broader Scale-Out

`docs/14-cross-cutting-systems.md` §14.12: extend Global Header, Dataset Selector,
and a new Market Overview panel to ETH/SOL/etc.; surface derivatives fields already
present in the `MarketEvent` schema (`docs/15` §15.5); complete the Kubernetes
migration for any remaining single-machine services from Phase 1–4's local topology.

## How new work gets added to this roadmap

The Planner (not an Executor) adds new Blocks/Tasks here as Phases progress and
unknowns become known — this document is expected to grow more detailed over time,
especially Phases 5–6, which are intentionally left less granular than Phases 1–4
since they depend on the Open Decisions in §0. When the Planner adds detail, it
appends a dated note at the bottom of the relevant Phase section explaining what
changed and why, rather than silently rewriting a Block that an Executor may already
be mid-task on.
