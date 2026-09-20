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

### [2.7] IN_PROGRESS — Data Pipeline (re-verified + Task G gap fixed)
Timestamp: 2026-09-19T19:05:00Z
Agent: executor-3 (claim via coordination.py; prior implementation by a previous
session, commit 635a1b2, was never marked done in coordination.db)
Status: IN_PROGRESS
Files touched:
  - backend/data/app/main.py
  - backend/data/app/tests/test_pipeline_acceptance.py
  - STATE.md
Spec files read:
  - docs/16-implementation-roadmap.md Block 2.7 (Tasks A–G + acceptance)
  - docs/05-engine-abstraction-and-data-pipeline.md §5.2, §5.3
  - docs/08-secondary-monitor-components.md §8.10
  - docs/04-hftbacktest-engine-analysis.md §4.9
  - docs/15-api-and-data-model-spec.md §15.5 (DataQualityReport)
Summary: Claimed Block 2.7. Found the pipeline stages (Validation, Normalization,
Order Book Reconstruction, Trade Alignment, Timestamp Validation, HftBacktest-
format conversion) and the 🔴-blocks-backtest gate already implemented by a prior
session and merged (commit 635a1b2), but that block was never closed out in
coordination.db. Installed the docs/03 stack deps locally (fastapi, polars, httpx,
pytest) and ran the acceptance suite: all 6 pre-existing tests pass. Reviewed Task
G against the spec and found one real safety gap in my lane: POST /quality-report
was a TODO stub returning a hardcoded all-green DataQualityReport for any
dataset_id (and it read request.datasetId while the model field is dataset_id, so
it would 500). Fixed it: added _events_quality() sharing the same check thresholds
as /validate, and rewrote /quality-report to load the stored canonical events.json
(content-addressed under ticklab_{dataset_id}, as written by Task F) and compute a
real report; unknown/prepared-never dataset → 404. Added 3 tests: good dataset →
real green report, corrupted stored dataset → report is not green and
/validate-for-backtest blocks it, unknown id → 404. Full suite now 9/9 passing.
Deviations from spec: none. Assumption (from prior session, unchanged): tick/lot
sizes come from a built-in table for BTC/ETH/SOL pending Block 2.1's
instrument_metadata DB lookup; HftBacktest-format writes a documented interim
binary layout pending the vendor submodule checkout.
Open questions for Planner: none.
Next step: none — this work is complete; commit on exec/executor-3 and mark Block
2.7 done in coordination.py.

---

### [2.7] DONE — Data Pipeline
Timestamp: 2026-09-19T19:20:00Z
Agent: executor-3
Status: DONE
Files touched:
  - backend/data/app/main.py
  - backend/data/app/tests/test_pipeline_acceptance.py
  - STATE.md
Spec files read:
  - docs/16-implementation-roadmap.md Block 2.7 (Tasks A–G + acceptance)
  - docs/05-engine-abstraction-and-data-pipeline.md §5.2, §5.3
  - docs/08-secondary-monitor-components.md §8.10
Summary: Block 2.7 closed out. All six stages (Validation → Normalization → Order
Book Reconstruction → Trade Alignment → Timestamp Validation → HftBacktest-format
conversion) plus Task G's DataQualityReport generator and 🔴-blocks-backtest gate
were already implemented and merged (commit 635a1b2) but never marked done in
coordination.db. This session re-ran the full acceptance suite (6/6 pre-existing
tests pass) and closed the one remaining Task G gap: POST /quality-report was a
stub returning a hardcoded all-green report for any dataset_id (and 500'd via
request.datasetId). Rewrote it to compute a real report from the prepared
dataset's stored canonical events.json (content-addressed ticklab_{dataset_id}),
404 on unknown datasets, sharing _events_quality()'s check thresholds with
/validate. Added three acceptance tests; suite is now 9/9. Committed as 3b293df on
exec/executor-3 and pushed (1ce6f28..3b293df) for the human merge.
Deviations from spec: none. Carried-over assumptions from the earlier session
stand: built-in tick/lot table pending Block 2.1's instrument_metadata; interim
binary layout pending vendor submodule checkout.
Open questions for Planner: none.
Next step: human merges exec/executor-3 into main per AGENTS.md §9.6; then Block
2.7 is fully closed.

---

### [2.8] IN_PROGRESS — Gateway & Job Runner
Timestamp: 2026-09-20T10:00:00Z
Agent: executor-3
Status: IN_PROGRESS
Files touched:
  - backend/gateway/Cargo.toml
  - backend/gateway/src/main.rs
  - backend/jobs/Cargo.toml
  - backend/jobs/src/main.rs
  - STATE.md
Spec files read:
  - docs/16-implementation-roadmap.md Block 2.8 (Tasks A–C + acceptance)
  - docs/01-architecture-overview.md §1.5 (async-job pattern)
  - docs/05-engine-abstraction-and-data-pipeline.md §5.6 (worker pool, default nproc-1)
  - docs/15-api-and-data-model-spec.md §15.1 (ns timestamps), §15.2 (REST table), §15.3 + §15.3.4 (WS topics, workspace.sync fan-out), §15.5 (BacktestRequest/Progress/Result shapes)
  - docs/02-two-monitor-workspace-spec.md §2.3 (Sync Bus, session sharing, origin field)
  - docs/08-secondary-monitor-components.md §8.14 (progress panel fields, >=500ms), §8.15 (RUNNING = real worker occupancy)
  - docs/03-tech-stack-and-repo-structure.md §3.1/§3.4/§3.5/§3.7 (Axum gateway+jobs, NATS subjects, file tree, local topology)
  - docs/12-execution-modes-and-risk.md (isolation property), docs/14-cross-cutting-systems.md §14.9 (typed actionable errors)
Summary: Claim returned NONE for new tasks (all unblocked Blocks already claimed); coordination status shows Block 2.8 already claimed by executor-3 with no STATE.md entry, so resuming it as owned work. Inspected the lane: backend/gateway/src and backend/jobs/src each contain only a non-compiling scaffold main.rs (references missing ws/routes/auth/queue/runner modules and undeclared deps tower_http/serde_json); engine/vendor/hftbacktest is empty with no .gitmodules, so ticklab-engine-abstraction (and hence both scaffold crates) cannot resolve or compile — vendor init belongs to another lane (Blocks 1.1/2.2/2.3), which this task must not touch per AGENTS.md §9.4. Plan: implement Tasks A–C with REST/WS surface exactly per docs/15 §15.2/§15.3 (camelCase §15.5 field names, ns timestamps), worker pool default nproc-1 per §5.6, workspace.sync fan-out-to-others-in-session per §15.3.4, mirroring engine.proto message shapes locally until the vendor checkout lands and the tonic client cutover is possible.
Deviations from spec: none yet; forced transport/decoupling decisions (drop uncompilable engine path-dep, localhost HTTP gateway→jobs, in-process progress bus with NATS subject names) will be documented here on completion.
Open questions for Planner: none yet.
Next step: write the gateway (ws hub + routes + proxy) and jobs (queue + runner + sweep/walkforward/robustness + REST) modules, then run cargo test acceptance (two WS clients fan-out; submit → progress stream → complete).

---

### [2.8] DONE — Gateway & Job Runner
Timestamp: 2026-09-20T12:00:00Z
Agent: executor-3
Status: DONE
Files touched:
  - backend/jobs/Cargo.toml
  - backend/jobs/src/lib.rs
  - backend/jobs/src/main.rs
  - backend/jobs/src/types.rs
  - backend/jobs/src/bus.rs
  - backend/jobs/src/queue.rs
  - backend/jobs/src/runner.rs
  - backend/jobs/src/sweep.rs
  - backend/jobs/src/walkforward.rs
  - backend/jobs/src/robustness.rs
  - backend/jobs/src/api.rs
  - backend/gateway/Cargo.toml
  - backend/gateway/src/lib.rs
  - backend/gateway/src/main.rs
  - backend/gateway/src/protocol.rs
  - backend/gateway/src/hub.rs
  - backend/gateway/src/auth.rs
  - backend/gateway/src/progress.rs
  - backend/gateway/src/routes.rs
  - backend/gateway/src/ws.rs
  - backend/gateway/tests/acceptance.rs
  - STATE.md
Spec files read:
  - docs/16-implementation-roadmap.md Block 2.8 (Tasks A–C + acceptance)
  - docs/01-architecture-overview.md §1.5
  - docs/05-engine-abstraction-and-data-pipeline.md §5.6
  - docs/15-api-and-data-model-spec.md §15.1, §15.2, §15.3, §15.3.4, §15.5
  - docs/02-two-monitor-workspace-spec.md §2.3
  - docs/08-secondary-monitor-components.md §8.14, §8.15
  - docs/03-tech-stack-and-repo-structure.md §3.1, §3.4, §3.5, §3.7
  - docs/12-execution-modes-and-risk.md (isolation), docs/14-cross-cutting-systems.md §14.9
Summary: Implemented all of Block 2.8. Gateway (Task A/C): WS endpoint /api/v1/ws?session= with subscribe/unsubscribe/publish frames, session-scoped hub, workspace.sync fan-out to every other connection in-session with sender exclusion (origin main|secondary enforced, patch forwarded opaquely per §15.3.4), per-job progress forwarding polled from the jobs service every 200ms (≥500ms budget per §8.14), and REST proxy of the full §15.2 job table plus /healthz. Jobs (Task B): worker pool default nproc-1 via TICKLAB_WORKERS override (docs/05 §5.6); status becomes running only under a held permit so GET /api/v1/jobs reflects real occupancy (§8.15); backtest/sweep/walkforward/robustness fan-out with parent aggregation; progress in the exact §15.5 shape; results carry headline=null with a machine-readable metricsPending marker (no fabricated finance). Acceptance verified by execution: 23 jobs tests + 7 gateway unit tests + 3 gateway integration tests pass (33/33), including the two verbatim criteria — two concurrent WS clients see each other's patches with self- and session-exclusion, and a gateway-submitted job streams monotonic progress to complete. cargo fmt applied; cargo clippy clean on both crates. Toolchain note: this machine has only the gnu Rust toolchain and its MinGW linker lives at C:\msys64\mingw64\bin, which is not on PATH — cargo invocations here need that prefix (executor-2's 2.2 "toolchain" block is the same root cause).
Deviations from spec: (1) Dropped the ticklab-engine-abstraction path-dep from both crates — engine/vendor/hftbacktest is empty with no .gitmodules so the crate cannot resolve; vendor init belongs to Blocks 1.1/2.2/2.3 (other lanes, untouched). Wire shapes mirror docs/15 §15.5 and engine.proto field-for-field; the tonic EngineService client attaches behind runner.rs when the vendor lands. (2) Gateway→jobs over localhost HTTP (reqwest, same hyper/tower stack as Axum) via JOBS_BASE_URL, default http://127.0.0.1:50052 — the docs/03 §3.4 in-process-vs-localhost choice, localhost chosen to preserve independent deployability. (3) Progress bus is in-process using the exact future NATS subject strings (job.{id}.progress, workspace.sync); NATS JetStream binding and the Postgres job table (docs/03 §3.1) are transport/persistence swaps that do not change this contract. (4) Progress counts are runner-stage pipeline telemetry (iterations×20 pacing units, simulated clock interpolated over dateRange); ordersSubmitted/fills stay 0 until Block 2.5 and headlines stay pending until Block 2.4. (5) Smallest additions, flagged: GET /api/v1/jobs list (needed by §8.15, absent from the §15.2 table) and WS subscribed/unsubscribed acks (deterministic test/client ordering). (6) Deps: added serde_json, reqwest, tower-http, futures (all implied by the REST/JSON + Axum stack in docs/03 §3.1); replaced the nonexistent tower-cors with tower-http; tokio-tungstenite and the ticklab-jobs path dep are gateway dev-dependencies only; enabled tower 0.4's util feature for tests. (7) No order-entry code exists anywhere in this task — Research/Paper traffic cannot reach a live endpoint by construction (docs/12 §12.2). (8) docker-compose.yml untouched (out of lane): for compose deploys set JOBS_BASE_URL=http://jobs:<port> on gateway and publish the jobs port.
Open questions for Planner: confirm (a) the localhost-HTTP gateway→jobs choice, (b) the GET /api/v1/jobs list shape, (c) WS ack frames staying in the contract, before Phase 3/4 builds on them.
Next step: human merges exec/executor-3 into main per AGENTS.md §9.6 (changes uncommitted on this branch; includes new Cargo.lock files for both crates and local target/ build dirs).
