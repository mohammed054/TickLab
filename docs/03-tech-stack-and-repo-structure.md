# 03 — Tech Stack and Repository Structure

This document is the single source of truth for **which technology to use where**.
An Executor must not introduce a dependency that isn't listed here without logging a
`NEEDS_PLANNER_REVIEW` entry per `AGENTS.md` §5.5.

## 3.1 Language/runtime choices, by layer

| Layer | Technology | Why |
|---|---|---|
| Engine core | Rust (vendored `hftbacktest` crate + our extensions) | Matches the upstream engine; only realistic choice for tick-level simulation speed and for reusing the existing live connectors (`docs/04-hftbacktest-engine-analysis.md`) |
| Engine abstraction layer | Rust, exposed to the rest of the backend via a thin process boundary (gRPC or a local Unix socket JSON-RPC — see §3.4) | Keeps the simulator-agnostic contract in a typed, memory-safe layer close to the engine |
| Backend services (Gateway, Data Pipeline, Experiment Store, AI Research) | Python (FastAPI) for Data Pipeline/Experiment Store/AI Research; Rust (Axum) for the Gateway and Job Runner | Python for the services that lean on the existing `py-hftbacktest`/Polars/pandas ecosystem for stats and dataset tooling; Rust for the two services on the latency/throughput-critical path (Gateway WS fan-out, Job Runner driving the Rust engine directly with no FFI-per-tick overhead) |
| Live exchange connectors | Rust (reuses/extends `hftbacktest`'s existing `connector/` crate for Binance Futures/Spot and Bybit) | Already implemented upstream; do not reimplement in another language |
| Frontend | TypeScript + React 18, Vite build | Team default; matches component-driven spec structure in docs 07/08 |
| Frontend charts | `lightweight-charts` (TradingView) for the primary candlestick/price chart; custom Canvas/WebGL renderer for the order book ladder and heatmaps (via a small internal `OrderBookCanvas` component); `visx`/`d3` for analytics charts (equity curve, drawdown, heatmaps, distributions) | `lightweight-charts` is purpose-built for exactly this chart type and handles large series efficiently; order book needs custom rendering for liquidity bars and depth-heatmap modes that no off-the-shelf chart library does well; `visx` gives full control for the bespoke analytics visuals in doc 09 |
| Frontend state | Zustand for the Workspace Context/Sync Bus (`docs/02`), TanStack Query for server data fetching/caching | Minimal boilerplate, plays well with WebSocket-driven updates |
| Frontend code editor (Strategy Editor) | Monaco Editor | Industry-standard in-browser code editor; supports the syntax highlighting/autocomplete/diagnostics required in `docs/08-secondary-monitor-components.md` §8.4 |
| Inter-window communication | Shared WebSocket session to Gateway (see `docs/02` §2.3) — **not** `BroadcastChannel`/`localStorage` | Must work across physically separate windows/devices, not just same-browser tabs |
| Message/event bus (backend-internal) | NATS (JetStream) for job progress, market data fan-out, and alerts between backend services | Lightweight, supports both pub/sub and durable streams (needed for "replay this experiment's event stream" reproducibility) |
| Relational store | PostgreSQL 16 | Strategies metadata, experiments, parameters, notes, users/settings, alerts, audit log |
| Object storage | Local filesystem (dev) / S3-compatible (prod) | Raw+normalized datasets, per-event backtest result blobs, exported reports |
| Cache / live state | Redis | Live order book snapshot, recent trade tape, latency rollups for the status bar, rate limiting |
| Data interchange for large tabular data | Apache Parquet (via Polars) | Analytics queries over large result sets (fills, events) without loading everything into memory |
| Job orchestration | A lightweight internal job queue (Postgres-backed job table + NATS for progress push) — **not** a heavyweight scheduler like Airflow for Phase 1–3 | Backtest jobs are triggered interactively by a user, not on a cron; a full workflow scheduler is unnecessary complexity until Phase 5+ (multi-user, scheduled walk-forward runs) |
| AI Research Assistant | Provider-agnostic LLM client behind an internal interface (`backend/ai/llm_client.py`), configured via environment variable, tool-calling for evidence retrieval | Must not hardcode a single vendor; the interface is the important part, not any specific model choice |
| Packaging/deployment (Phase 1–3) | Docker Compose for local multi-service dev; each service also runnable standalone for debugging | Matches the "runs on one machine" requirement in `docs/01-architecture-overview.md` §1.4 |
| Packaging/deployment (Phase 5+, scale-out) | Kubernetes manifests per service, with the Live Exchange Connector pinned to a dedicated, low-latency-network-tier node pool | See `docs/06-realtime-live-data-architecture.md` §6.6 |

## 3.2 Why not GPU for the core backtest loop

`hftbacktest`'s core simulation is an inherently **sequential, event-driven**
tick-by-tick replay per asset (each event's order-book effect depends on the
exact-order processing of the previous event). This is not a vectorizable/
data-parallel workload, so a GPU does not accelerate a single backtest run. See
`docs/05-engine-abstraction-and-data-pipeline.md` §5.6 for the full explanation and
for where CPU-parallelism (multiple independent runs) and, optionally, GPU (only
for downstream ML/analytics, never the core sim loop) do apply.

## 3.3 Frontend multi-window architecture

- The frontend is a single Vite/React application (`frontend/`) that renders one of
  two "shells" depending on which window it's loaded in: `MainMonitorShell` or
  `SecondaryMonitorShell`.
- On desktop, this is packaged as a Tauri app (Rust-backed, lightweight, avoids
  shipping a full Chromium-per-window like Electron) that opens two native windows,
  each loading the same web bundle with a `?shell=main` / `?shell=secondary` query
  param that selects the shell at boot.
- Both shells connect to the same Gateway WebSocket session (identified by a shared
  session token issued at login/launch) so the Workspace Context (`docs/02` §2.3)
  stays in sync regardless of process boundaries.
- A `SingleDisplayShell` (see `docs/02` §2.6) wraps both shells in a tab switcher for
  single-monitor development/testing; it is the default in local dev unless
  `--dual-window` is passed to the dev script.

## 3.4 Engine ↔ backend boundary

- The Rust Engine Abstraction Layer (`engine/src/`) exposes a local gRPC service
  (`engine.proto`, defined in `docs/15-api-and-data-model-spec.md` §15.4) with
  methods like `RunBacktest`, `StreamBacktestProgress`, `RunParameterSweep`,
  `ValidateDataset`, `GetDatasetMetadata`.
- The Python Job Runner (actually thin in this split — see below) and Data Pipeline
  call this gRPC service rather than shelling out to a CLI or using FFI bindings
  directly, so the engine process can be scaled, restarted, and versioned
  independently of the Python services.
- Correction to §3.1's simplification: the **Job Runner is a Rust service**
  (`backend/jobs`, Axum) that owns job lifecycle/queueing and calls the Engine
  Abstraction Layer's gRPC methods directly in-process or over localhost gRPC
  (implementation detail left to Phase 2 — both are acceptable; document the choice
  actually made in that task's `STATE.md` entry). Python is used for
  Data Pipeline/Experiment Store/AI Research specifically because those benefit from
  the Python data-science ecosystem (Polars, pandas, the LLM SDKs), not because they
  need to be fast on the hot path.

## 3.5 Full repository file tree (target — build incrementally per roadmap)

```
/AGENTS.md
/README.md
/STATE.md
/docs/
  00-vision-and-principles.md
  01-architecture-overview.md
  02-two-monitor-workspace-spec.md
  03-tech-stack-and-repo-structure.md
  04-hftbacktest-engine-analysis.md
  05-engine-abstraction-and-data-pipeline.md
  06-realtime-live-data-architecture.md
  07-main-monitor-components.md
  08-secondary-monitor-components.md
  09-analytics-and-investigation-suite.md
  10-experiment-management-and-ai-research.md
  11-design-system.md
  12-execution-modes-and-risk.md
  13-data-management-and-monitoring.md
  14-cross-cutting-systems.md
  15-api-and-data-model-spec.md
  16-implementation-roadmap.md

/engine/
  vendor/hftbacktest/            # git subtree/submodule of nkaz001/hftbacktest, unmodified upstream code
  abstraction/                   # our Rust crate wrapping vendor/hftbacktest
    src/
      lib.rs
      contract.rs                # SimulatorContract trait (docs/05 §5.1)
      hftbacktest_impl.rs        # implementation of the contract over vendor/hftbacktest
      grpc_service.rs
      dataset_pipeline.rs        # calls into data prep stages (docs/05 §5.2-5.4)
    proto/
      engine.proto
    Cargo.toml

/backend/
  gateway/                       # Rust (Axum) — WS fan-out, REST/GraphQL routing, auth
    src/
      main.rs
      ws/
      routes/
      auth/
  jobs/                          # Rust (Axum) — job queue, engine gRPC client, progress streaming
    src/
      main.rs
      queue.rs
      runner.rs
      sweep.rs
      walkforward.rs
      robustness.rs
  experiments/                   # Python (FastAPI) — experiment tree, reproducibility, comparisons
    app/
      main.py
      models.py
      routes/
      repro.py
  data/                          # Python (FastAPI) — ingestion, validation, normalization
    app/
      main.py
      collectors/                # thin wrappers around hftbacktest's collector/ crate outputs
      validators/
      normalizers/
      quality.py
  market/                        # Rust (Axum) — live/replay normalized market stream
    src/
      main.rs
      live_source.rs
      replay_source.rs
      normalize.rs
  ai/                            # Python (FastAPI) — AI research assistant
    app/
      main.py
      llm_client.py
      tools/                     # evidence-retrieval tool functions exposed to the LLM
      prompts/
  connectors/                    # Rust — live exchange connectivity (extends hftbacktest connector/)
    binance_futures/
    bybit/
    common/

/frontend/
  src/
    app/
      main-monitor/
        MainMonitorShell.tsx
      secondary-monitor/
        SecondaryMonitorShell.tsx
      single-display/
        SingleDisplayShell.tsx
    features/
      header/
      price-chart/
      order-book/
      trade-tape/
      order-flow/
      microstructure/
      market-regime/
      strategy-monitor/
      inventory/
      risk/
      execution-monitor/
      bottom-bar/
      strategy-editor/
      parameters/
      dataset-selector/
      data-quality/
      backtest-config/
      backtest-progress/
      results/
      analytics/            # equity, drawdown, attribution, fill/queue/latency/adverse-selection/etc.
      strategy-comparison/
      parameter-sweeps/
      walkforward/
      robustness/
      replay/
      event-inspector/
      why-investigation/
      experiments/
      research-notes/
      ai-research/
      paper-live/
      risk-controls/
      data-center/
      realtime-monitor/
      search/
      command-palette/
      alerts/
      logs/
      export/
      workspace-presets/
    shared/
      sync-bus/                # Workspace Context store (docs/02 §2.3)
      design-system/           # tokens, primitives (docs/11)
      hooks/
      utils/
    api/
      client.ts
      ws.ts
      types.ts                 # generated/mirrored from docs/15 schemas
  index.html
  vite.config.ts
  package.json

/data/                          # gitignored — local dataset cache
/scripts/
  collectors/                   # CLI wrappers to run hftbacktest's collector/ binaries on a schedule
  migration/
/tests/
  integration/
  e2e/
docker-compose.yml
```

## 3.6 Performance budgets (must be respected by every Executor)

| Scenario | Budget |
|---|---|
| UI frame render while live data streaming | 60fps sustained; never drop below 30fps |
| Chart update on new tick | < 16ms per update, batched if updates arrive faster than 60Hz |
| Order book ladder update | < 8ms per update; use a canvas/WebGL renderer, not per-row React re-render |
| Table of fills/events | Virtualized (render only visible rows); must handle 10M+ row datasets without full-table load |
| Backtest of ~50M events | Must not block the UI at any point; progress must update at least every 500ms |
| Time from "click losing equity point" to "both monitors show that timestamp" | < 300ms perceived latency |
| WebSocket reconnect after drop | Automatic, exponential backoff, resumes without full page reload |

## 3.7 Local development topology (Phase 1–3)

All services run as containers via `docker-compose.yml` on a single developer
machine: `gateway`, `jobs`, `experiments`, `data`, `market`, `ai`, `postgres`,
`redis`, `nats`, plus the `engine` abstraction-layer gRPC process. The frontend runs
via `vite dev` outside the compose stack for fast iteration, pointed at the
gateway's local port. No Kubernetes, no cloud dependency required to develop or run
the full product end-to-end, including backtests. Live connectors are **not**
started in default local dev (Live mode is feature-flagged off by default — see
`docs/12-execution-modes-and-risk.md` §12.7).

## 3.8 Scale-out path (Phase 5+, only after Paper mode is validated)

- Each backend service becomes an independently deployed Kubernetes deployment.
- The Live Exchange Connector is pinned to a node pool provisioned in a
  low-latency-appropriate region/provider relative to the target exchange's
  matching engine (see `docs/06-realtime-live-data-architecture.md` §6.6 for the
  colocation discussion) — this is an infrastructure decision to make explicitly
  when Live mode is scoped, not before.
- NATS and Redis move to managed/clustered deployments.
- Postgres moves to a managed instance with read replicas for the Experiment Store's
  comparison queries once experiment volume justifies it.
- This section is intentionally not more specific than this yet — see
  `docs/16-implementation-roadmap.md` §0 "Open Decisions" for the cloud-provider
  decision this depends on.
