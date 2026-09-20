# STATE.md — Append-Only Session Log

**Read `AGENTS.md` before reading this file if you have not already.**

Rules:
- Never edit or delete a past entry. Only append new ones.
- Every entry follows the exact format in `AGENTS.md` §3.1.
- To find where to resume, read from the bottom up until you find the most recent
  `IN_PROGRESS` or `BLOCKED` entry, or the most recent `DONE` entry if none are open.
- Phase/Block/Task IDs reference `docs/16-implementation-roadmap.md`.

---

### [2.1.A] DONE — Data Models and Persistence
Timestamp: 2026-09-19T18:55:00Z
Agent: big-pickle (Executor, executor-1)
Status: DONE
Files touched:
  - scripts/migration/0001_strategies.sql
  - scripts/migration/0002_datasets.sql
  - scripts/migration/0003_experiments.sql
  - scripts/migration/0004_notes.sql
  - scripts/migration/0005_alert_history.sql
  - scripts/migration/0006_workspace_presets.sql
  - scripts/migration/0007_instrument_metadata.sql
  - scripts/migration/0008_user_chart_prefs.sql
  - scripts/migration/0009_audit_log.sql
  - scripts/migration/apply.ps1
  - scripts/migration/apply.sh
  - scripts/migration/verify_schema.py
  - backend/experiments/app/models.py
  - backend/data/app/models.py
Spec files read:
  - docs/15-api-and-data-model-spec.md §15.5 (all)
  - docs/16-implementation-roadmap.md Block 2.1
  - docs/03-tech-stack-and-repo-structure.md §3.5, §3.7
  - docs/10-experiment-management-and-ai-research.md §10.1–§10.4
  - docs/12-execution-modes-and-risk.md §12.1, §12.5, §12.6, §12.8
  - docs/14-cross-cutting-systems.md §14.3, §14.5
  - docs/13-data-management-and-monitoring.md §13.1–§13.2
  - docs/05-engine-abstraction-and-data-pipeline.md §5.2–§5.3
  - docs/07-main-monitor-components.md §7.2.4
  - docs/08-secondary-monitor-components.md §8.3–§8.7
  - docs/02-two-monitor-workspace-spec.md §2.5
Summary: Created the Postgres DDL for all 9 tables required by docs/15 §15.5
(strategies, experiments, datasets, notes, alert_history, workspace_presets,
instrument_metadata, user_chart_prefs, audit_log) as numbered migration files
under scripts/migration/, plus a migration runner (apply.ps1 + POSIX apply.sh)
that applies each file exactly once in its own transaction through the already-
declared postgres:16 compose service and records versions in a schema_migrations
table — chosen deliberately to avoid a new top-level dependency (AGENTS.md §5.5:
docs/03 lists no ORM/Alembic or host psql driver). Added verify_schema.py, a
stdlib literal diff-check of every DDL column name against §15.5 and the
referenced spec sections (passes). Added backend/experiments/app/models.py and
backend/data/app/models.py as pydantic mirrors of the schema. Verified for real:
started Docker Desktop, booted postgres:16 via compose, applied all 9 migrations
cleanly, re-ran for idempotency (all SKIP), exercised CHECK on strategy status,
FK RESTRICT on experiments.strategyId, and a valid experiment insert (all in a
rolled-back transaction).
Deviations from spec: none. Field-name choices not literally present in §15.5
were taken from the docs referenced above and each SQL file cites its doc
section; two *documented* composites were flattened relationally with their
member names preserved: auth-by identity becomes authoredByAgentType/
authoredById (Note) and createdByAgentType/createdById (Experiment); dateRange
becomes dateRangeStart/dateRangeEnd; linkedView stays a single JSONB {path,
params}. Column names are written camelCase in the DDL to match the interface
field names literally; Postgres folds unquoted identifiers to lowercase at rest
(standard behavior) — the diff-check validates the DDL source, which is the
reviewable artifact. experiment/strategy deployment notes: no `jobs` table is
created here — docs/03 §3.1's Postgres-backed job table is owned by Block 2.8;
experiments.datasetId has no hard FK (docs/13 §13.2 requires *acknowledged*
deletion, which a RESTRICT FK would defeat) — indexed only.
Open questions for Planner:
  1) audit_log CHECK includes actorAgentType 'system' (rises from risk limiter /
  emergency-stop actors, docs/12 §12.5/§12.8) — the docs only enumerate
  'human' | 'ai-assistant' for authoredBy/createdBy.
  2) user_chart_prefs columns (userId, symbol, exchange, overlays JSONB,
  settings JSONB) are the smallest interpretation of "overlay visibility is
  per-user, persisted" (docs/07 §7.2.4); no exact field list exists in any doc.
  3) verify_schema.py's expected field sets for the 6 tables NOT defined as
  interfaces in §15.5 are transcribed from the referenced doc sections and
  implemented as-enumerated; if the Planner intended different names, the doc
  (and verify_schema.py) should be updated together per the Golden Rule.
Next step: none — Block 2.1 complete and self-tested against its acceptance bar
(migrations apply cleanly; field names match the spec — see verify_schema.py).
Block 2.2 depends on nothing from this block at the contract/gRPC level; the
tasks that consume these tables are 2.3/2.4/2.8 (backend/jobs, gateway).

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
### [2.3.A] DONE — Execution Model Wiring (Fee, Asset, Exchange, Queue, Latency)
Timestamp: 2026-09-20T10:47:53Z
Agent: muse-spark (Executor, executor-1)
Status: DONE
Files touched:
  - engine/abstraction/src/execution_model.rs (new)
  - engine/abstraction/tests/execution_model.rs (new)
  - engine/abstraction/src/hftbacktest_impl.rs
  - engine/abstraction/src/types.rs
  - engine/abstraction/src/lib.rs
  - engine/abstraction/Cargo.toml
  - engine/abstraction/build.rs
  - engine/abstraction/clippy.toml
  - engine/abstraction/rustfmt.toml
  - engine/abstraction/src/grpc_service.rs (format only)
  - engine/abstraction/tests/roundtrip.rs (format only)
Spec files read:
  - docs/16-implementation-roadmap.md Block 2.3
  - docs/04-hftbacktest-engine-analysis.md §4.2–§4.4
  - docs/05-engine-abstraction-and-data-pipeline.md §5.1
  - docs/08-secondary-monitor-components.md §8.7, §8.12–§8.13
  - docs/15-api-and-data-model-spec.md §15.4–§15.5
  - docs/03-tech-stack-and-repo-structure.md §3.1, §3.4–§3.5
Summary: Wired every docs/08 §8.7 execution-model field through the normalized
contract into real vendored hftbacktest constructions (docs/04 §4.4 mapping
table), in the new engine/abstraction/src/execution_model.rs: maker/taker %
fees build TradingValueFeeModel<CommonFees>; allow_partial_fills selects
NoPartialFillExchange/PartialFillExchange; fixed latency builds
ConstantLatency from latency_entry_ns/latency_response_ns params
(empirical validates its data file, custom resolves as a descriptor);
asset linear/inverse (+ contract_size) travels via asset_type/contract_size
params into LinearAsset/InverseAsset; order-type gates map
Limit/Market to OrdType and Gtc/PostOnly/Ioc/Fok to TimeInForce GTC/GTX/IOC/FOK
and are enforced by check_order_allowed. Task 2.3.B finalized the queue
presets against models/ source: risk-averse maps to RiskAdverseQueueModel,
probabilistic to ProbQueueModel<LogProbQueueFunc>, power to
ProbQueueModel<PowerProbQueueFunc> (queue_power_n, default 2.0), custom to the
Probability func named by queue_prob_func. HftbacktestConfig::from_request now
resolves and stores the execution model, so unknown presets/values fail
start_backtest with typed errors. Acceptance verified for real: 12 new tests
plus the 5 existing roundtrip tests pass (cargo test, 17/17); the centerpiece
test drives real RiskAdverseQueueModel vs ProbQueueModel over a real
HashMapMarketDepth through an identical L2 event sequence and asserts the
probabilistic order fills (1.0) while the risk-averse order rests (0.0); a
200-step deterministic fuzz guards risk-averse as never filling more than
power; fee/asset/latency tests assert hand-computed values against real vendor
math; one test runs a real vendor Backtest from resolved models end to end.
cargo fmt --check is clean; cargo clippy reports only pre-existing warnings in
2.2-era code, none in new code.
Deviations from spec: none in behavior; incidental repairs inside owned
engine/abstraction/ (all required to compile/verify, no new dependencies):
(1) Cargo.toml hftbacktest path pointed at the virtual workspace manifest and
could never resolve — repointed to vendor/hftbacktest/hftbacktest with
backtest-only features; (2) build.rs used a nonexistent tonic-build API
(compile_protos) — corrected to configure().compile(); (3) clippy.toml and
rustfmt.toml were unparseable (blocked cargo fmt/clippy) — replaced with
minimal valid equivalents (clippy levels moved nowhere; left for Planner);
(4) cargo fmt reformatting applied to grpc_service.rs/roundtrip.rs (whitespace
only). Toolchain note: the Windows GNU toolchain has no linker on PATH;
builds/tests were run with C:\msys64\mingw64\bin on PATH (pre-existing MSYS2).
Open questions for Planner:
  1) Upstream spells it RiskAdverseQueueModel ("Adverse"); our preset keeps the
  doc spelling "risk-averse" — confirm, and confirm the finalized preset table
  (esp. probabilistic = LogProbQueueFunc, power default n = 2.0) by updating
  docs/04 §4.4 per Task 2.3.B (Executor may not edit docs/).
  2) Reduce-only has NO upstream counterpart (OrdType is Limit/Market only) —
  it is settable via the API but always rejected as Unsupported at enforcement;
  decide: drop the §8.7 checkbox, map it to a TimeInForce, or implement
  reduce-only filtering in a later block.
  3) Asset type travels via asset_type/contract_size request params (no §8.7
  field; docs/04 says the Dataset Selector Market field should select it) —
  confirm this channel or specify a contract field; likewise confirm fixed
  latency defaults (0/0 ns) and the §8.7 UI default queue preset.
  4) Empirical latency (IntpOrderLatency file staging) and custom
  Probability/LatencyModel trait impls construct at run time, not in this
  block — confirm the Block 2.8 job runner owns file staging.
Next step: none for 2.3 — done and self-tested. Uncommitted changes remain in
the working tree on branch exec/executor-1 for human review/merge (not
committed: no commit was requested). Note: engine/abstraction/target/ and
Cargo.lock are new untracked build artifacts; /target/ gitignore does not cover
the nested path — suggest adding engine/abstraction/target/ to .gitignore at
merge time.

---
