# 01 — System Architecture Overview

## 1.1 Component map

```
┌───────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (frontend/)                          │
│   Monitor 1 App Shell         Monitor 2 App Shell        Shared Sync Bus   │
│   (Market Command Center)     (Research Lab)              (see doc 02)     │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │ WebSocket (live data, job progress, sync events)
                                 │ REST/GraphQL (CRUD: strategies, experiments, data)
┌────────────────────────────────▼──────────────────────────────────────────┐
│                          GATEWAY API (backend/gateway)                     │
│  Auth · Request routing · WS fan-out · Rate limiting · Schema validation   │
└───┬───────────────┬───────────────┬───────────────┬────────────┬──────────┘
    │               │               │               │            │
┌───▼───┐   ┌───────▼──────┐  ┌─────▼──────┐  ┌─────▼─────┐ ┌────▼─────────┐
│ Market │   │ Backtest/Job │  │ Experiment │  │  Data      │ │ AI Research  │
│ Data   │   │ Runner       │  │ Store      │  │  Pipeline  │ │ Assistant    │
│ Service│   │ (backend/    │  │ (backend/  │  │  (backend/ │ │ Service      │
│(backend│   │  jobs)       │  │  experi-   │  │  data)     │ │(backend/ai)  │
│/market)│   │              │  │  ments)    │  │            │ │              │
└───┬────┘   └──────┬───────┘  └─────┬──────┘  └─────┬──────┘ └──────┬───────┘
    │               │                │               │               │
    │        ┌──────▼─────────────────────────────────▼───────┐      │
    │        │         ENGINE ABSTRACTION LAYER (engine/)       │      │
    │        │   wraps hftbacktest; simulator-agnostic contract │      │
    │        │            (see doc 05)                          │      │
    │        └──────┬────────────────────────────────┬─────────┘      │
    │                │                                │                │
┌───▼────────┐  ┌────▼─────────────┐        ┌─────────▼───────┐        │
│ Live        │  │ hftbacktest      │        │ Postgres +       │        │
│ Exchange    │  │ (vendored Rust   │        │ object storage   │        │
│ Connectors  │  │ engine)          │        │ (experiments,    │◄───────┘
│ (Binance,   │  └──────────────────┘        │ datasets, notes, │
│  Bybit)     │                               │ report exports)  │
└─────────────┘                               └───────────────────┘
```

## 1.2 Services and their responsibilities

### Gateway API (`backend/gateway`)
Single entry point for the frontend. Responsibilities:
- Terminates the frontend's WebSocket connection and REST/GraphQL calls.
- Authenticates requests (even in a single-user local deployment, this boundary
  exists so Live-mode actions always pass through an explicit authorization check —
  see `docs/12-execution-modes-and-risk.md`).
- Routes to the correct internal service.
- Fans out server-push events (price ticks, job progress, alerts) to subscribed
  frontend clients over WebSocket topics (see `docs/15-api-and-data-model-spec.md`
  §15.3).
- Never contains business logic itself — it is a thin, well-tested router.

### Market Data Service (`backend/market`)
- Owns the live/replay market data stream: order book, trades, ticker, funding.
- In **live** mode, sources data from the Real-Time Data Layer (see
  `docs/06-realtime-live-data-architecture.md`).
- In **replay** mode, sources data from a prepared dataset via the Data Pipeline,
  played back at the user-selected speed (0.01x–1000x, per
  `docs/08-secondary-monitor-components.md` §8.17).
- Publishes a single normalized event stream regardless of source, so the frontend
  never needs to know whether it's looking at live or replayed data structurally
  (only a visually unmistakable environment badge differs — see
  `docs/12-execution-modes-and-risk.md` §12.1).

### Backtest / Job Runner (`backend/jobs`)
- Accepts backtest, parameter-sweep, walk-forward, and robustness-test job
  requests.
- Runs each job in an isolated worker process (never on the API request thread —
  see §1.5).
- Streams progress (events processed, events/sec, orders, fills, elapsed/remaining
  time) back through the Gateway over WebSocket.
- On completion, writes results to the Experiment Store.
- Supports **process-parallel execution** of independent jobs (multiple backtests,
  sweep cells) across CPU cores — see `docs/05-engine-abstraction-and-data-pipeline.md`
  §5.6 for why this, not GPU, is the correct scaling axis for this specific engine.

### Experiment Store (`backend/experiments`)
- Owns the experiment tree, versioning, reproducibility metadata, notes, and
  comparison queries.
- Every completed job becomes an immutable experiment record (see
  `docs/10-experiment-management-and-ai-research.md`).

### Data Pipeline (`backend/data`)
- Owns dataset ingestion, validation, normalization, and conversion into
  hftbacktest-compatible format (see `docs/05-engine-abstraction-and-data-pipeline.md`
  §5.2–5.4).
- Owns the Data Quality checks shown in `docs/08-secondary-monitor-components.md`
  §8.10.

### AI Research Assistant Service (`backend/ai`)
- Wraps calls to an LLM (model-agnostic; configured, not hardcoded) with tools that
  can query the Experiment Store, Market Data Service, and Data Pipeline for
  evidence.
- Never has write access to strategy code, order submission, or risk limits. It can
  only **propose** an experiment configuration; a human always clicks "Create
  Experiment" to actually queue it. See
  `docs/10-experiment-management-and-ai-research.md` §10.5.

### Engine Abstraction Layer (`engine/`)
- The contract between the product and any underlying simulator. Wraps the vendored
  `hftbacktest` Rust crate today; designed so a second/alternate simulator could be
  added later without rewriting the Backtest Runner, Experiment Store, or any UI.
  See `docs/05-engine-abstraction-and-data-pipeline.md` §5.1.

### Live Exchange Connectors
- Rust processes, one per exchange, based on hftbacktest's existing Binance
  Futures/Spot and Bybit connectors (see `docs/04-hftbacktest-engine-analysis.md`
  §4.5). Only reachable from Live mode. See
  `docs/06-realtime-live-data-architecture.md` for the full low-latency path.

## 1.3 Data stores

| Store | Technology | Owns |
|---|---|---|
| Relational store | Postgres | Strategies (metadata), experiments, parameters, notes, users/settings, alert history, audit log |
| Object storage | Local filesystem in dev; S3-compatible in production | Raw and normalized datasets, backtest result blobs (per-event records), exported reports |
| Time-series cache | In-memory (per service) + Redis in multi-instance deployments | Live order book state, recent trade tape, latency metrics for the status bar |
| Experiment artifact format | Apache Parquet / npz (engine-native) | Per-event backtest output records (see `docs/04-hftbacktest-engine-analysis.md` §4.6 for the native record schema) |

Full schema definitions: `docs/15-api-and-data-model-spec.md` §15.5.

## 1.4 Why a services split instead of a monolith

- The Job Runner must be able to run CPU-heavy, long-lived (minutes) backtest jobs
  without ever blocking the Gateway's ability to serve live market data to the UI.
- The Live Exchange Connector must run in a process with the tightest possible
  latency budget and the smallest blast radius if it crashes — it must not share a
  process, GC, or thread pool with anything else. See
  `docs/06-realtime-live-data-architecture.md` §6.2.
- The AI Research Assistant makes outbound LLM API calls with unpredictable latency;
  isolating it means a slow AI response never affects chart responsiveness.

This is a **modular services architecture that can run as a single-machine
deployment** (all services as local processes/containers on one dev machine,
communicating over localhost) — it does not require a distributed cluster to run
Phase 1–3. See `docs/03-tech-stack-and-repo-structure.md` §3.7 for the local dev
topology and §3.8 for how it scales out later.

## 1.5 The golden rule: nothing blocks the UI thread

No user interaction in the frontend may be blocked on a synchronous backend call
longer than ~50ms. Anything longer:

1. Is submitted as an async job (`POST /jobs`, see
   `docs/15-api-and-data-model-spec.md` §15.2).
2. Returns a job ID immediately.
3. The frontend subscribes to that job's WebSocket progress topic.
4. Progress and completion are rendered incrementally (see
   `docs/08-secondary-monitor-components.md` §8.14 "Backtest Progress").

This applies to: running a backtest, running a parameter sweep, loading/validating a
dataset, generating a report, and any AI Research Assistant query.

## 1.6 Environments (Research / Paper / Live)

Covered fully in `docs/12-execution-modes-and-risk.md`. At the architecture level,
the critical property is: **Research and Paper never have a code path that can reach
a real exchange order-entry endpoint.** The Live Exchange Connector is a physically
separate process that only the Live environment's execution path can address, gated
by an explicit, confirmed, logged user action (`docs/12-execution-modes-and-risk.md`
§12.6).

## 1.7 Cross-references

- Two-monitor UI architecture and the sync bus: `docs/02-two-monitor-workspace-spec.md`
- Full tech stack and repo file tree: `docs/03-tech-stack-and-repo-structure.md`
- Engine internals: `docs/04-hftbacktest-engine-analysis.md`
- Abstraction layer + data pipeline: `docs/05-engine-abstraction-and-data-pipeline.md`
- Live low-latency path: `docs/06-realtime-live-data-architecture.md`
- API contracts: `docs/15-api-and-data-model-spec.md`
