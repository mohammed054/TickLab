# 18 — Real Research Pipeline: Executor Contract

Status: **ACTIVE OWNER PLAN**, dated 2026-10-04. Doc 16 points here. This is the
single source of truth for current task IDs, API shapes, file ownership, sequencing,
guardrails, and acceptance. SQLite outside the repo mirrors only block IDs,
dependencies, descriptions, and directory ownership. Read this entire document and
named specs before code. The plan targets low-tier coding agents: one narrow block
per agent, exact file ownership, frozen interfaces, no inferred financial/data rules.

## 18.1 Outcome, safety, release gate

From the native app, a user can select/import genuine compatible data; inspect
provenance, coverage, integrity and capabilities; choose a compatible real preset or
AI draft; explicitly review and validate its immutable version; run the vendored
`hftbacktest`; see real async progress; reopen actual persisted results; inspect
metrics/events; reproduce or branch immutable experiments; run multiple different
strategies/configurations concurrently within a hard cap; and inspect every result.
Sweeps/walk-forward are leakage-safe. No screen auto-selects or declares a winning
strategy.

This objective excludes Paper/Live order execution and exchange order credentials.
No mock data/fill/metric/result may satisfy acceptance. AI cannot mutate code,
validate strategies, submit jobs/batches, or call order APIs. Human uses normal
review/validate/submit actions.

Release is ready only when every R-block is done and R11's packaged native journey
passes using real source and engine evidence. If source access is missing, state the
exact external blocker and keep dependent work blocked. UI/fixtures alone never
constitute real release acceptance.

## 18.2 Known data boundary

Existing local archive is Binance BTCUSDT **Spot** aggTrades, 2025-01-01 through
2026-10-03; raw, trades-only, and without historical order-book depth. One source day
has two original-order regressions. Never label it USD-M Futures, repair/sort rows,
fabricate depth, or use it for book-based fill claims.

Vendored docs describe L2/L3 builders and depth-driven queue/fill models; they do not
prove a presently accessible dataset is eligible. R1 inspects exact vendored revision,
source, repo and attributed fixtures. Outcome is verified compatible real source with
acquisition/schema/access contract, or BLOCKED with exact product, owner action,
missing evidence, and reproducible pass check. Public percentage-summary rows are not
exchange events. Trade-only execution compatibility is not assumed.

## 18.3 Rules for every executor

1. Claim exactly one block: `python C:\ticklab-coord\coordination.py claim <agent>`.
   `NONE` means stop. Missing prerequisite means mark blocked; do not start dependents.
2. Read AGENTS.md, full doc 18, the claimed section, and all listed spec files.
3. Touch only paths owned by that block. Never edit another block's files “to help.”
4. Use only existing stack/dependencies (doc 03). No invented service, DB, API,
   fallback behavior, formulas, units, defaults, capabilities or financial semantics.
5. Validate full request and eligibility before writes or execution. Unknown or
   unsupported fields yield typed error and no partial writes/jobs.
6. Persist immutable inputs before queue; persist/checksum actual output before success.
   Retry/reproduction always uses a new object ID.
7. Never fabricate progress, engine output, event, fill, metric, quality, evidence or
   provider response. Progress must derive from real job/engine state.
8. Financial code cites exact `docs/09 §x.y`; add hand-calculated fixture tests. If
   formula/source is unclear or contradictory, stop that subtask and ask Planner.
9. No secrets in repo, APIs, frontend, logs, test fixtures, prompts, experiments,
   exports or coordination notes.
10. Run exact acceptance checks; append STATE.md and heartbeat. Done only if every
    criterion passes. Commit starts `[R#]`.

## 18.4 Blocks and exclusive directory ownership

All paths repo-root-relative. SQLite enforces dependencies. R2 is the frozen-contract
barrier. Do not introduce alternate duplicated types or APIs. Blocks cannot edit other
blocks' paths.

| ID | Scope | Owned paths | Depends on |
|---|---|---|---|
| R1 | Data/engine compatibility evidence and source gate | `backend/data/app/tests/` | — |
| R2 | Freeze API, persistence and state schemas | `backend/data/app/models.py`, `backend/experiments/app/models.py`, `backend/gateway/src/`, `backend/jobs/src/`, `engine/abstraction/proto/`, `frontend/src/contracts/` | R1 |
| R3 | Acquire, normalize and quality-gate a supported real input | `backend/data/app/`, `backend/data/app/tests/`, data-only `scripts/` | R1,R2 |
| R4 | Run actual single hftbacktest job and persist reproducible output | `engine/abstraction/src/`, `engine/abstraction/tests/`, `backend/jobs/src/`, `backend/experiments/app/`, `backend/experiments/app/tests/` | R1,R2,R3 |
| R5 | Version/validate runnable strategies and compatible presets | `backend/experiments/app/templates/`, `backend/experiments/app/parameter_schema.py`, `backend/experiments/app/tests/` | R2,R4 |
| R6 | Native desktop single-run data→strategy→backtest workflow | `frontend/src/components/secondary/`, `frontend/src/components/layout/SecondaryMonitor.tsx`, `frontend/src/styles/` | R2,R3,R4,R5 |
| R7 | Formula-correct metrics, results, replay and reproduction UI | `backend/experiments/app/metrics/`, `frontend/src/components/secondary/ResultsPanel.tsx`, `AnalyticsPanel.tsx`, `ReplayPanel.tsx`, `EventInspector.tsx`, `backend/experiments/app/tests/` | R4,R5,R6 |
| R8 | Bounded multi-strategy/config batch execution | `backend/jobs/src/`, `backend/experiments/app/`, `backend/experiments/app/tests/`, `frontend/src/components/secondary/SweepsPanel.tsx`, `ExperimentsPanel.tsx` | R2,R4,R5,R6,R7 |
| R9 | Deterministic parameter sweep and leakage-safe walk-forward | `backend/jobs/src/`, `backend/experiments/app/`, `backend/experiments/app/tests/`, `frontend/src/components/secondary/SweepsPanel.tsx`, `WalkForwardPanel.tsx` | R7,R8 |
| R10 | OpenRouter strategy drafts with hard human gate | `backend/ai/app/`, `backend/ai/tests/`, `frontend/src/components/secondary/AiResearchPanel.tsx`, `StrategyPanel.tsx` | R5,R6,R7 |
| R11 | Packaged E2E, security and performance release verification | `tests/`, `frontend/src-tauri/`, release-check `scripts/` | R3,R4,R5,R6,R7,R8,R9,R10 |

Parallel constraints: R3 and R4 are sequential. R5 may work against R2 contracts, but
cannot finish before R4. R6 may render R2 fixtures, but acceptance waits on real R3/4/5.
R7 consumes only persisted R4 output. R8 uses exact R2/R4 queue contract; R9 cannot
redefine worker behavior. R10 cannot call job APIs. R11 may fix only its owned test/
packaging paths; contract defects return to the owner block and reopen it.

## 18.5 R1 — Verify exact source/engine compatibility

**Read:** docs/04 §§4.2–4.4,4.9; docs/05 §§5.2,5.4; docs/16; doc 18 §§18.1–18.2.
**Own:** `backend/data/app/tests/` only. Planner may update doc 04 only if assigned.
**Do:** inspect vendored Git revision, event structs/loaders, asset builders, exchange
processors, queue/fill models and provider converters. Inspect existing manifests and
files; do not count filenames as coverage. Use an attributed real-format sample to test
asset construction and at least one event/order lifecycle against actual engine API.
Record source paths/symbols, provider provenance and exact test command in STATE.
Do not download restricted data or store credentials.
**Output:** candidate evidence table: market, event types, book semantics, provider
access/license, schema/sequence requirements, builder/fill behavior, fixture result,
missing prerequisite. If unavailable, name exact product/account permission/user
action/source objects/pass condition; mark blocked.
**Accept:** fixture test demonstrates compatibility or reproducibly rejects candidate;
no synthesized event/book; every claim traceable to source/test; exact decision/blocker;
all tests pass; only owned files changed.

## 18.6 R2 — Freeze API and persistence contracts

**Read:** docs/03 §§3.1–3.5; docs/05 §§5.1–5.3; docs/08 §§8.3–8.15; docs/10 §§10.1–10.3;
docs/12 §12.5; docs/15 §§15.1–15.5; doc 18 §18.3. Do not implement UI, engine,
metrics, AI or ingestion. Types/storage/API/tests only. Preserve existing named fields;
contradiction means block and ask Planner, never silently choose.

Required records:

- Dataset manifest: existing doc 05 fields plus exchange/market, type, immutable
  source checksum refs, coverage/event count, capabilities, normalization/pipeline
  version, depth/quote flags, prepared artifact refs. Raw != prepared.
- Quality report: existing doc 15 fields plus per-check stable ID/status/count,
  `blocks_backtest`, and reason. Backend is sole eligibility authority.
- Strategy ref: `{id,version,code_hash,template_id,required_capabilities,
  validation_report_id}`.
- Run config: strategy ref, dataset ID, explicit UTC ns bounds/boundary convention,
  typed params, capital/currency, fee, latency, queue, exchange/fill model, enabled
  orders, seed, engine revision, fidelity. Exact values/units follow cited specs.
- Experiment: immutable config and input checksums, strategy hash, engine build,
  parent ID, creator/time, status, result refs or typed failure. Retry is new ID.
- Job: `{job_id,kind,experiment_id,status,queued_at,started_at,completed_at,
  progress,cancel_requested,worker_id,error}`. Only queued→running→complete|failed|
  cancelled. Terminal is immutable.
- Batch: ordered child IDs, explicit concurrency cap, timestamp and child-derived
  status; children remain normal immutable experiments/jobs.

Under the existing local API/version prefix (do not create a server): `GET /datasets`,
`GET /datasets/{id}/quality`, `GET /strategies/templates`, `POST /strategies`,
`POST /strategies/{id}/validate`, `POST /jobs/backtest` `{runConfig}` -> HTTP 202
`{jobId,experimentId,status:"queued"}`, `GET /jobs/{id}`, idempotent cancel via
`DELETE /jobs/{id}`, `GET /experiments/{id}`, reproduction via
`POST /experiments/{id}/reproduce` creating a new ID, batch via `POST /jobs/batches`
`{runConfigs,concurrencyLimit}` -> `{batchId,children:[{jobId,experimentId}]}`.
Batch 1..100; reject invalid count before writes. Concurrency 1..max(1, CPU count-1);
invalid gets 422, never clamp. Persist records before 202. Validate whole batch before
creating any children. Progress topic remains `job.{jobId}.progress`.

Error JSON exactly `{code,message,fieldErrors:[{field,code,message}],requestId}`:
404 unknown ID; 409 immutable/state conflict; 422 invalid/unsupported/capability;
429 queue full plus retry metadata; 500 unexpected fault plus request ID. Never put
secret field in public schema.

**Accept:** contract tests for each endpoint, field/unit agreement across Rust/Python/
protobuf/TS, transitions, immutability, cancel, batch boundaries 100/101, invalid
batch zero-write; all listed errors tested. Read doc 15 and ownership before schema.

## 18.7 R3 — Prepare real compatible market data

**Precondition:** R1 source evidence and actual bytes/access are available; otherwise
blocked. Never substitute raw Spot or summary data. **Read:** docs/05 §§5.2–5.4;
docs/13 §13.2; docs/15 §§15.2,15.5; R1 report.

Preserve original bytes. Checksum verify and resume. Idempotency by exact provider
identity/checksum. Deterministic normalization retains source sequence/time and
provenance. Content identity includes market/instrument, source checksums, interval,
normalizer and engine-format revisions. Reconstruct books only from actual snapshots
and updates. No gap repair or invented recovery. Unknown metadata, sequence break,
missing required events, raw status, wrong market, corrupt/checksum-mismatched input,
wrong coverage or missing output makes ineligible. One backend eligibility function;
frontend cannot override. Do not alter existing Spot manifest/source bytes/row order.

**Test attributed authentic-format fixtures:** good input, changed checksum, truncation,
duplicate, gap, out-of-order, wrong market/date, missing instrument metadata, raw vs
prepared, idempotent import. Verify book levels/sequence against hand-checked source.
**Accept:** fresh data root→verified source→deterministic engine-readable artifact;
quality counts/hashes/coverage match source; invalid cases fail closed; idempotent
content ID; tests pass. If actual source unavailable, blocked, no fabricated pass.

## 18.8 R4 — Execute/persist one real engine backtest

**Precondition:** R3 has authentic prepared eligible dataset and R2 contract. **Read:**
docs/04 §§4.2–4.7; docs/05 §§5.1,5.5–5.7; docs/09 §9.1; docs/10 §§10.1,10.3;
docs/15 §§15.4–15.5.

Flow exactly: validate full config and hashes; re-check eligibility; resolve exact
validated strategy hash/params; atomically save experiment+queued job; acquire bounded
worker; read prepared artifact through vendor reader; run using the sole adapter
`engine/abstraction/src/hftbacktest_impl.rs`; publish progress only from engine event
counter; store actual recorder/event artifacts with hashes; calculate only defined
available metrics; persist outputs before terminal success; publish terminal state.
Typed errors at each boundary. Cancel only after engine actually stops. No fallback
simulator/app-side fills.

Immutable snapshot includes dataset/checksums, range, strategy ID/version/hash,
parameters, capital/currency, fees, latency/queue/exchange/order settings, instrument
metadata, seed, upstream revision, adapter build. Reproduction creates new ID and
must error if original input missing; never substitute latest.

**Tests:** actual engine service with attributed prepared fixture; actual engine drives
known order/fill checked by hand; no-order case; reject unsupported dataset before
job; invalid strategy; engine/persistence failure; cancel; worker exhaustion; actual
progress; checksum; fetch after restart; deterministic reproduction/new ID. **Accept:**
all above pass plus at least one selected real-provider run recorded with source
coverage and exact engine revision. No success from fixture alone.

## 18.9 R5 — Immutable strategy versions and compatible presets

**Read:** docs/05 §5.1; docs/08 §§8.3–8.6; docs/10 §§10.1,10.5.3; docs/15 §§15.2,15.5.
Keep existing strategy interface/runtime. Each available preset declares stable ID,
version/hash, description, required capabilities, limitations, and complete parameter
schema `{type,default,min,max,step,unit,description}`. Only expose templates truly
supported by R1/R3/R4. Do not claim order-book imbalance or market making without
required book events. At least two distinct runnable presets and one no-order control.

Lifecycle DRAFT→VALIDATED. Edit creates a new version/DRAFT. Validate never queues;
VALIDATED pins code hash, schema and engine API. Hash drift cannot run. Reject unknown
keys, wrong type, NaN/Infinity, range and step violations; no coercion.
**Accept:** each exposed preset schema and version stable; each validates and completes
fixture through actual R4; invalid/hash drift/incompatible capability tests reject
before job. No functional-looking stub. No extra paths.

## 18.10 R6 — Native single-run workflow

**Read:** docs/02 §§2.3,2.6; docs/08 §§8.1–8.16,8.28–8.29; docs/11; docs/14
§§14.7–14.10; docs/15 §§15.2–15.5.

Keep current desktop-only Tauri and real DATA view; no mock screens/runtime/browser
fallback. Exact screens: (1) DATA lists source, true market, UTC coverage, fidelity,
normalization, capabilities and server eligibility; raw Spot inspectable but blocked.
(2) Import/prepare uses actual async jobs; tab/reload keeps job ID. (3) Strategy lists
only persisted compatible versions; parameter bounds from server schema. (4) Config
shows selected dataset/date/capital/currency/fees/latency/queue/exchange/seed/fidelity
and limitations; unsupported controls absent. (5) Confirmation is exact submitted
payload. No accidental double-submit. (6) Job view consumes durable R2 job; actual
progress, navigation/reload persistent; cancel only while running after confirmation.
(7) Only actual persisted R4 results render. Empty/error never shows sample values.

No UI-thread operation over 50ms. Use R2 API only; keyboard, focus, loading, empty,
error per docs 11/14. **Accept:** component tests for all states/gates, native Tauri
real-service run journey, reload recovery, Spot exact block reason, no mock workflow
reachable, frontend checks pass.

## 18.11 R7 — Formula-correct result inspection and replay

**Read:** docs/04 §§4.6–4.7,4.10; docs/05 §5.5; docs/09 §§9.1–9.16; docs/08
§§8.16–8.22,8.25; docs/10 §§10.1–10.3; docs/11; docs/14 §§14.7–14.10.

Before code list each displayed metric's doc 09 formula, exact artifact/columns, units,
unavailable cases. Do not edit formulas. Every financial implementation cites
`docs/09 §x.y`; add hand-calculated fixture. Missing sampling interval/risk-free/fill
price/horizon or conflicting formula blocks that metric; no invented default. Results
use persisted R4 refs only. Recorder cannot stand in for fill events. Replay/Event
Inspector use actual stored IDs/time; absent detail says “not recorded” and is
non-actionable, never synthetic. Reproduction creates new record; comparison leaves
original unchanged.
**Accept:** tests each displayed formula, summary equals analytics API, specified
reconciliation, exact timestamp/event routing, absent refs show unavailable, reopen
after restart. Only owned files.

## 18.12 R8 — Concurrent different strategies/configurations

**Read:** docs/05 §5.6; docs/08 §§8.12–8.16,8.23; docs/09 §9.16; docs/10 §§10.1–10.3;
docs/15 §§15.2–15.3,15.5.

Accept 1–100 immutable configs; validate all before any write. Persist ordered children
and use R4 worker path. Explicit worker limit follows R2; queue full rejects atomically.
Show each child's exact strategy version, dataset/config, state, actual progress,
result/error. Independent failure does not cancel others. Parent cancel requests
remaining child cancellations and finishes only once children stop. Retry is a new
child with lineage. Service restart restores jobs. No ranking, pruning, early stop,
auto-selection or suppressing runs based on metrics.

Actual running count equals worker occupancy, queued equals durable queue. No timer
progress. **Accept:** atomic validate, order/IDs, different configs, actual invocation,
max worker bound, queue full, independent errors, child/parent cancel, retry lineage,
restart and UI every child state/result; assert no winner/pruning. Only assigned paths.

## 18.13 R9 — Sweeps and leakage-safe walk-forward

**Read:** docs/05 §5.6; docs/08 §§8.12,8.15,8.23; docs/09 §§9.16–9.19; docs/10
§§10.1–10.3; docs/15 §§15.2,15.5.

Sweep is deterministic: lexicographically sort param keys, retain each explicit value
order, Cartesian product. Reject duplicate/unknown key/value, empty axis, invalid R5
value and >10,000 cells before writes. Persist every config and use R8 worker. Show
all results/errors and selected formula metric; never call any cell best automatically.

Walk-forward persists UTC-ns train/validation/test windows and roll step; require
ordered nonempty non-overlapping windows within dataset by default. If doc 09 permits
contradictory overlap, stop and request Planner decision before code. Lock candidates
before test. Test-window data/results cannot affect parameter/candidate selection or
AI selection prompt. Every metric/chart persistently labeled TRAIN, VALIDATION or TEST.
No “best strategy” verdict.
**Accept:** Cartesian order, 10k/10,001, invalid axis, schema tests; window boundary,
overlap, order and lock tests; planted leakage test proves test data cannot alter choice;
UI labels all windows and child outcomes.

## 18.14 R10 — OpenRouter AI drafts; human-only run gate

**Read:** docs/03 §§3.1,3.5; docs/08 §§8.3–8.6,8.27; docs/10 §§10.4–10.5.3;
docs/14 §§14.4,14.9; docs/15 §§15.2,15.5.

Use existing backend AI service. OpenRouter model ID runtime config; no silent model
fallback. Key backend-only. Send user request, allowed capability/event schema, optional
explicit evidence refs; never secrets, archives or unbounded event streams. Strict JSON
response fields: title, hypothesis, assumptions, required capabilities, typed
parameter schema, strategy source, model ID, prompt version, evidence refs. Bound body
and source length; validate before save. Save AI-attributed DRAFT/hash. Display exact
code and assumptions for human review. AI tools read-only. No mutation/validation/job/
batch/risk/order functions registered. Only explicit normal human UI actions validate
and submit. Model/API errors are actionable; no fabricated fallback.

Tests mock only external HTTP transport, not engine/strategy/results. Prove secret
absent from frontend build, API, logs, DB, prompt and export. Tool allowlist denies all
writes/runs. Include prompt injection, invalid JSON, size limit, timeout, 429 and model
missing. **Accept:** persisted provenance/evidence; draft cannot enqueue; human normal
flow required; citation refs resolve to actual outputs; tests work without network.

## 18.15 R11 — Packaged release verification

**Read:** docs/00 §§0.3–0.9; docs/03 §§3.1–3.7; docs/04 §§4.2–4.10; docs/05 §§5.1–5.7;
docs/08 §§8.1–8.29; docs/09 §§9.1–9.19; docs/10 §§10.1–10.7; docs/11; docs/12
§§12.1–12.5; docs/14 §§14.7–14.10; docs/15 §§15.1–15.5.

Use deterministic attributed fixtures; CI must not require internet/restricted source/
OpenRouter. Separately test production source gate fails closed. Package Tauri native
app with actual services. Run journeys: (A) eligible real dataset→quality→preset
validate→config/confirm→vendored engine→event progress→restart/reopen actual result→
inspect actual event→new reproduction. (B) AI draft→human review→normal validate→
explicit normal job; prove no AI submission. (C) different strategy batch→real worker
limit→inspect every result/error, no winner. (D) bounded sweep/locked walk-forward and
leakage fixture. (E) raw Spot and corrupted input rejected with exact reason and zero
engine jobs.

Measure largest authentic local sample: hardware, bytes/events, engine revision,
worker cap, wall-clock and peak memory. Do not invent performance threshold if doc 03
has none; report missing Planner threshold and block release as applicable. Audit
package for credentials and reachable mock UI.
**Accept:** all journeys pass packaged native app/service; all preceding blocks done;
checks green; no secret/mock workflow; actual source access gate satisfied. Else R11
stays blocked; product is not called ready.

## 18.16 Handoff checklist

```text
1. Read AGENTS.md + full doc 18.
2. Claim one R-block in C:\ticklab-coord\coordination.py; honor dependencies.
3. Read full block and its referenced specs; verify external prerequisite.
4. Edit only the block-owned paths. Never guess finance/data/API semantics.
5. Fail closed; add listed tests; run every acceptance check.
6. Review diff for scope, secrets and data artifacts.
7. Append STATE.md; heartbeat. Mark done only on passing acceptance.
8. Commit `[R#] <specific change>` and report evidence/blocker.
```
