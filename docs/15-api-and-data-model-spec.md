# 15 — API and Data Model Specification

## 15.1 API Design Principles

- REST/JSON for CRUD and job submission (strategies, experiments, datasets).
  GraphQL is **not** used in Phase 1–3 despite being mentioned as an option in
  `docs/01-architecture-overview.md`'s diagram label ("REST/GraphQL") — that label
  covers the possibility, but the concrete Phase 1–3 implementation is REST only;
  revisit only if the frontend's data-fetching patterns concretely justify GraphQL's
  complexity (a `NEEDS_PLANNER_REVIEW` decision, not a default).
- WebSocket for anything server-push: live market data, job progress, Sync Bus
  replication, alerts.
- All endpoints versioned under `/api/v1/`.
- All timestamps in API payloads are **nanosecond-precision epoch integers**
  (matching the engine's native time representation,
  `docs/04-hftbacktest-engine-analysis.md` §4.2) — never ISO strings on the hot data
  path (order book updates, trades), to avoid parsing overhead; ISO-8601 strings are
  acceptable for lower-frequency metadata (experiment `createdAt`, etc.).

## 15.2 REST API (selected endpoints — full OpenAPI spec generated from
`backend/gateway/src/routes/` during implementation, this table is the contract
Executors build against)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/market/{symbol}/snapshot` | Current order book + ticker snapshot |
| `POST` | `/api/v1/strategies` | Create a new strategy (draft) |
| `GET` | `/api/v1/strategies/{id}` | Fetch strategy metadata + code |
| `POST` | `/api/v1/strategies/{id}/validate` | Synchronous validate (`docs/08` §8.4) |
| `POST` | `/api/v1/jobs/backtest` | Submit a backtest job → `{jobId}` |
| `POST` | `/api/v1/jobs/sweep` | Submit a parameter sweep → `{jobId, cellJobIds[]}` |
| `POST` | `/api/v1/jobs/walkforward` | Submit a walk-forward job |
| `POST` | `/api/v1/jobs/robustness` | Submit a robustness-test job |
| `GET` | `/api/v1/jobs/{jobId}` | Poll job status (fallback if WS unavailable) |
| `DELETE` | `/api/v1/jobs/{jobId}` | Cancel a running job |
| `GET` | `/api/v1/experiments` | List/query experiments (filters: strategy, date, status) |
| `GET` | `/api/v1/experiments/{id}` | Fetch full experiment record (`docs/10` §10.1) |
| `POST` | `/api/v1/experiments/{id}/reproduce` | Reproduce (`docs/10` §10.3) |
| `POST` | `/api/v1/experiments/compare` | `{experimentIds[]}` → comparison payload (`docs/09` §9.16) |
| `GET` | `/api/v1/experiments/{id}/analytics/{view}` | One of the analytics views, §9.2–§9.13, e.g. `equity-curve`, `drawdown`, `pnl-attribution`, `fill-analysis`, `adverse-selection`, `slippage`, `queue-analysis`, `latency-analysis`, `obi-analysis`, `volatility`, `liquidity`, `time-analysis` |
| `GET` | `/api/v1/datasets` | List datasets (Data Center, `docs/13` §13.2) |
| `POST` | `/api/v1/datasets/prepare` | Trigger pipeline run for a selection (`docs/08` §8.8) → `{jobId}` |
| `GET` | `/api/v1/datasets/{id}/quality` | `DataQualityReport` (§15.5) |
| `POST` | `/api/v1/ai/query` | AI Research Assistant query (`docs/10` §10.5), returns text + evidence refs + optional `DraftExperimentConfig` |
| `POST` | `/api/v1/environment/switch` | Change session `Environment` (`docs/12` §12.1) |
| `POST` | `/api/v1/risk/kill-switch` | Kill switch actions (`docs/12` §12.8) — always audit-logged |
| `POST` | `/api/v1/export` | `{type, targetId, format}` → async job or direct file for small payloads |

## 15.3 WebSocket API

Single connection per client session (`wss://.../api/v1/ws?session={token}`),
topic-based subscribe/unsubscribe:

```json
{ "action": "subscribe", "topic": "market.BTCUSDT.depth" }
{ "action": "subscribe", "topic": "job.{jobId}.progress" }
{ "action": "subscribe", "topic": "workspace.sync" }
```

Core topics:

- `market.{symbol}.depth` — order book delta stream (`docs/07` §7.3/§7.4).
- `market.{symbol}.trades` — trade tape stream (`docs/07` §7.6).
- `market.{symbol}.ticker` — top-of-book/24h stats (Global Header, `docs/07` §7.1).
- `strategy.{sessionId}.state` — Strategy Monitor / Inventory / Risk live state
  (`docs/07` §7.11/§7.13/§7.14).
- `job.{jobId}.progress` — backtest/sweep/walkforward/robustness job progress
  (`docs/08` §8.14).
- `alerts.{sessionId}` — Alert Center push (`docs/14` §14.3).
- **`workspace.sync`** (§15.3.4) — Sync Bus replication
  (`docs/02-two-monitor-workspace-spec.md` §2.3), the topic both monitor windows
  subscribe to for the shared `WorkspaceContext`.

### 15.3.4 `workspace.sync`

Payload is a partial `WorkspaceContext` patch (`docs/02` §2.3.1) plus an
originating-window identifier, so a window never re-applies its own just-sent
update:

```json
{
  "topic": "workspace.sync",
  "origin": "main" | "secondary",
  "patch": { "timestamp": 1737400000123456789, "selectedTradeId": "t_abc123" }
}
```

The Gateway simply fans this out to every other connected window in the same
session — it does not interpret or validate the patch's business meaning; validation
of what a given field change should trigger lives entirely in frontend logic per
`docs/02` §2.3.2's canonical interaction list.

## 15.4 Engine gRPC Contract (`engine/abstraction/proto/engine.proto`)

Mirrors the `SimulatorContract` trait (`docs/05-engine-abstraction-and-data-pipeline.md`
§5.1) as a gRPC service:

```protobuf
service EngineService {
  rpc ValidateDataset(DatasetRef) returns (DataQualityReport);
  rpc PrepareDataset(DatasetRef) returns (stream PipelineProgress);
  rpc StartBacktest(BacktestRequest) returns (BacktestHandle);
  rpc StreamBacktestProgress(BacktestHandle) returns (stream BacktestProgress);
  rpc StreamEvents(BacktestHandle) returns (stream MarketEvent);
  rpc CollectResults(BacktestHandle) returns (BacktestResult);
  rpc Cancel(BacktestHandle) returns (Empty);
}
```

`backend/jobs` (Rust) is the primary gRPC client; message field definitions mirror
the TypeScript interfaces in §15.5 exactly (generated from a single shared schema
source — Protobuf as the canonical definition, with TS types generated from it via
`ts-proto` or equivalent, rather than hand-maintaining two parallel schemas that can
drift).

## 15.5 Core Data Models

```ts
// Normalized market event, shared by live, paper, and replay sources
// (docs/06-realtime-live-data-architecture.md §6.4)
interface MarketEvent {
  timestampNs: number;
  symbol: string;
  exchange: string;
  type: "book_update" | "trade" | "snapshot" | "ticker" | "funding" | "liquidation";
  side?: "bid" | "ask";
  price?: number;
  size?: number;
  sequence?: number;
  // derivatives-only fields (docs/14 §14.12):
  fundingRate?: number; nextFundingTime?: number; openInterest?: number;
  markPrice?: number; indexPrice?: number; basis?: number;
}

interface DataQualityReport {
  datasetId: string;
  totalEvents: number; trades: number; orderBookUpdates: number; snapshots: number;
  missingIntervals: { count: number; status: "green" | "yellow" | "red"; ranges: [number, number][] };
  duplicateEvents: { count: number; status: "green" | "yellow" | "red" };
  sequenceGaps: { count: number; status: "green" | "yellow" | "red" };
  timestampRange: [number, number];
  fileSizeBytes: number;
  source: string;
  normalizationVersion: string;
  tickSize: number; lotSize: number;
}

interface BacktestRequest {
  strategyRef: { id: string; version: string; codeHash: string };
  parameters: Record<string, number | string | boolean>;
  datasetId: string;
  dateRange: { start: number; end: number };
  initialCapital: number;
  executionModel: ExecutionModelConfig;   // docs/08 §8.7
  riskLimits: RiskLimitsConfig;            // docs/12 §12.5
  randomSeed: number | null;
  iterations: number;                       // docs/08 §8.12
}

interface BacktestProgress {
  jobId: string;
  eventsProcessed: number; totalEvents: number;
  eventsPerSec: number;
  ordersSubmitted: number; fills: number;
  simulatedTimeNs: number;
  wallClockElapsedMs: number;
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
}

interface BacktestResult {
  jobId: string; experimentId: string;
  engineVersion: string;                     // docs/10 §10.3
  headline: {                                 // docs/09 §9.1
    initialCapital: number; finalCapital: number;
    netPnl: number; returnPct: number;
    maxDrawdownPct: number; sharpe: number; sortino: number;
    trades: number; fillRatePct: number; fees: number; slippage: number;
  };
  recorderSeriesRef: string;    // pointer to the Recorder npz/parquet blob (docs/04 §4.6)
  fineGrainedEventsRef: string; // pointer to the extended event/fill stream (docs/05 §5.5)
}

interface Note {
  id: string;
  targetType: "strategy" | "experiment" | "timestamp" | "trade" | "fill" | "chart_view";
  targetId: string;
  body: string;
  authoredBy: { agentType: "human" | "ai-assistant"; id: string };
  createdAt: string;
}

interface AlertRecord {
  id: string;
  type: string;   // see docs/14 §14.3's alert-type list
  severity: "info" | "warning" | "critical";
  message: string;
  linkedView?: { path: string; params: Record<string, string> };
  createdAt: string;
  acknowledged: boolean;
}

interface WorkspacePreset {
  id: string; userId: string;
  name: "MARKET" | "RESEARCH" | "BACKTEST" | "REPLAY" | "EXECUTION" | "PAPER" | "LIVE" | string;
  mainMonitorLayout: Record<string, unknown>;
  secondaryMonitorLayout: Record<string, unknown>;
}
```

Postgres tables map close to 1:1 with the interfaces above (`strategies`,
`experiments`, `datasets`, `notes`, `alert_history`, `workspace_presets`,
`instrument_metadata`, `user_chart_prefs`, `audit_log`); exact DDL is produced in
Task 2.1 of `docs/16-implementation-roadmap.md` and must not diverge from the field
names used here without updating this document first (`AGENTS.md` §2, the Golden
Rule).
