# 07 — Transformation Phases and Executor Task Cards

These cards replace the old Radar/Judge/Journal build roadmap. Follow task IDs and dependencies in order. Do not implement future phases early. `docs/09-research-system.md` is the required contract. The Planner owns this file and all docs; the Executor owns only each task's listed non-doc files.

## Phase 0 — Feasibility and owner gate (no product-code changes)

**Goal:** verify real source coverage, historical access, terms, disk rate, and machine capability before committing to providers or adding a Python ML stack. The existing `P0-REPORT.md` remains the evidence form.

### T0.1 Machine and storage profile

**Files:** `scripts/p0/system.mjs`, `data/p0/system.json`. **Spec:** docs/00 §0.2; docs/09 §§9.2–9.3. **Do:** record Windows version, CPU, total/free disk, system RAM, exact GPU name/VRAM/driver, Python version, CUDA availability, and current model cache sizes. Do not download models. **Accept:** command prints and saves a JSON report; all fields are populated or explicitly `unknown`; no secrets are emitted.

### T0.2 Real launch and shallow-data coverage

**Files:** `scripts/p0/capture.mjs`, `scripts/p0/fields.mjs`, `fixtures/gt/new_pools.real.json`, `fixtures/gt/pools_multi.real.json`, `fixtures/gt/trades.real.json`, `fixtures/gt/ohlcv.real.json`, `fixtures/gt/token_info.real.json`, `data/p0/coverage.json`. **Spec:** docs/09 §9.4. **Do:** capture 24 hours of real launch responses; save real fixtures for launch discovery, pool snapshot, trades, OHLCV, and token metadata; compare a two-hour launch sample against an independent public reference and list unsupported venues. **Accept:** fixtures are real and dated; JSON report gives counts, latency, missingness, venue coverage, HTTP status/error/429 rate, and measured bytes/day; no field is marked verified without fixture evidence.

### T0.3 Historical data/provider bake-off

**Files:** `scripts/p0/history.mjs`, `fixtures/history/provider_a_sample.jsonl`, `fixtures/history/provider_b_sample.jsonl`, `data/p0/provider-bakeoff.json`. **Spec:** docs/09 §9.4. **Do:** evaluate the existing source plus at least one historical/on-chain candidate on the same 25 active and 25 failed/dead launches; measure history start/end, trades/candles, point-in-time fields, pool migration handling, coverage gaps, latency, free limits, and data export. Save exact requests/responses and a provider comparison table. **Accept:** every scored claim links to a dated fixture or official terms/pricing page; JSON report explicitly identifies unobservable fields and archive limitations.

### T0.4 Terms, quota, and storage projection

**Files:** `data/p0/terms-and-storage.json`. **Spec:** docs/09 §§9.3–9.4. **Do:** date-stamp provider data retention/research terms, free quotas, per-method costs if exposed, and measured capture storage; project 30/90/365-day usage under shallow and selected-deep capture. **Accept:** report includes source links, worst-case estimate and recommended configuration under the 150 GiB managed cap; a source whose terms prohibit local retention is rejected. Planner transfers the reviewed evidence into `docs/build-spec/P0-TERMS.md` and `P0-REPORT.md`.

### T0.5 Feasibility verdict and owner decision

**Owner + Planner gate; no Executor file assignment.** Planner reviews `data/p0/*.json` and dated fixtures, updates `docs/build-spec/P0-REPORT.md`, `P0-TERMS.md`, and `FIELDS.md`, and recommends Full / Reduced / Not feasible with first provider set, final capture cadence, Python/model compatibility, and any paid dependency. **Accept:** all measurements are filled, limitations explicit, and owner replies `go` before Phase 1. If paid data is required, owner approval is separately required; otherwise use a reduced scope or stop.

**PHASE 0 GATE:** no worker/model stack, data migrations, or product feature expansion until the owner reviews the evidence and replies `go`.

## Phase 1 — Supersede old product paths and establish local worker

**Goal:** retain the Electron app shell but make its boundaries match the research-only product.

### T1.1 Audit current paths and produce removal inventory

**Files:** `scripts/research/audit-scope.mjs`, `tests/unit/research-scope.test.ts`. **Spec:** docs/09 §§9.1–9.2, 9.9. **Do:** scan current source for real account/journal, wallet import, trading/signing, remote AI, renderer networking, and all old `paper|real` references; report exact path/line and classify keep/remove/archive. **Accept:** report flags all real-money journal and wallet-import workflows; test fails if transaction-signing or send-order identifiers are introduced; no source files changed in this task.

### T1.2 Add pinned local Python worker environment

**Files:** `research-worker/requirements.txt`, `research-worker/README.md`, `scripts/research/bootstrap-worker.ps1`, `scripts/research/worker-health.ps1`. **Spec:** docs/09 §§9.2, 9.8. **Do:** create a per-user virtual environment with Python version and exact package pins chosen after T0; expose no network listener; document CUDA/CPU fallback and offline health check. **Accept:** clean Windows profile can create the venv and print Python/package/GPU status; no model downloads occur; requirements hash is recorded. Any T0-incompatible dependency is returned to Planner, not guessed.

### T1.3 Implement JSONL worker protocol and supervisor

**Files:** `research-worker/src/protocol.py`, `research-worker/src/main.py`, `src/main/research/worker.ts`, `src/main/research/worker.test.ts`. **Spec:** docs/09 §9.2. **Do:** implement request/response/progress schema, typed errors, 1 MiB response bound, stderr logs, child shutdown and interruption behavior. **Accept:** tests cover success, malformed JSON, unknown command, mismatched ID, oversized output, crash, graceful stop and forced stop; worker binds no TCP/HTTP socket; renderer cannot spawn it.

### T1.4 Persist research job lifecycle

**Files:** `src/main/db/migrations/002_research_jobs.sql`, `src/main/research/jobs.ts`, `src/main/research/jobs.test.ts`, `src/main/ipc/handlers/researchJobs.ts`, `src/shared/api.ts`. **Spec:** docs/09 §§9.2, 9.8. **Do:** add queued/running/paused/cancelled/interrupted/failed/completed job states with timestamps, config hash, progress, result path, and typed error. **Accept:** migration preserves existing `radar.db`; duplicate job IDs rejected; killed app marks running job interrupted on next open; only allowlisted, zod-validated IPC can control jobs.

### T1.5 Remove real-money workflow and archive existing records

**Files:** `src/main/wallet/import.ts`, `src/main/wallet/parseSwap.ts`, `src/main/wallet/solUsd.ts`, `src/main/journal/service.ts`, `src/main/journal/exportCsv.ts`, `src/main/ipc/handlers/journal.ts`, `src/shared/api.ts`, `src/shared/ipc.ts`, `src/renderer/screens/Journal/index.tsx`, `src/renderer/screens/Journal/DecisionTable.tsx`, `src/renderer/screens/Journal/DecisionDrawer.tsx`, `src/renderer/screens/Journal/NewDecisionModal.tsx`, `src/renderer/screens/Journal/FillForm.tsx`, `src/renderer/screens/Journal/EquityTab.tsx`, `src/renderer/screens/Journal/UnlinkedTrades.tsx`, `src/renderer/screens/Journal/RiskPanel.tsx`, `src/renderer/screens/Journal/SummaryCards.tsx`, `src/renderer/screens/Journal/riskText.ts`, `src/renderer/screens/Journal/useDecisions.ts`, `src/renderer/screens/Settings/index.tsx`, `src/renderer/screens/Detail/JournalTab.tsx`, `src/renderer/router.tsx`, `tests/unit/journal.test.ts`, `tests/unit/wallet.test.ts`. **Spec:** docs/09 §§9.1, 9.9. **Do:** remove all new decision/fill entry, wallet import, account mutation, and real-trade workflows. Turn the existing Journal route into a read-only Legacy Archive linked from Settings; keep current rows/exports intact, label them as legacy, and never use them in model data. Preserve DB tables and rows unchanged. **Accept:** old DB opens with byte-for-byte-equivalent legacy row values; the archive displays and exports existing rows; no UI/IPC can insert or mutate a journal/wallet record; scan/test finds no transaction signing or order submission code. No owner data is deleted or rewritten.

### T1.6 Remove hosted AI calls and credentials

**Files:** `src/main/ai/openrouter.ts`, `src/main/app/runtime.ts`, `src/main/ipc/handlers/misc.ts`, `src/main/ipc/handlers/types.ts`, `src/main/db/queries/ai.ts`, `src/main/settings/secrets.ts`, `src/main/settings/defaults.ts`, `src/main/settings/store.ts`, `src/shared/constants.ts`, `src/shared/api.ts`, `src/shared/ipc.ts`, `src/renderer/screens/Settings/AiSection.tsx`, `src/renderer/screens/Settings/fields.tsx`, `src/renderer/screens/Detail/AiTab.tsx`, `src/renderer/screens/Detail/index.tsx`, `src/renderer/router.tsx`, `tests/unit/ai.test.ts`, `tests/unit/settings.test.ts`, `tests/unit/ipc.test.ts`. **Spec:** docs/09 §§9.1–9.2, 9.8. **Do:** remove OpenRouter client, endpoint, secret configuration and cloud AI UI. Preserve unrelated RPC secrets. Keep reusable local sanitization/safety helpers only if still referenced; do not add local model yet. **Accept:** mocked fetch/network inspection proves no AI call to a non-loopback host; OpenRouter key setting/channel is absent; old encrypted key is ignored and never read; app and old DB still open.

**PHASE 1 GATE:** app launches with prior DBs; worker can run locally with bounded protocol; real-money paths are removed without deleting old records; no hosted AI client remains.

## Phase 2 — Local research storage and data catalog

### T2.1 Add versioned file catalog and dataset versions

**Files:** `src/main/db/migrations/004_research_catalog.sql`, `src/main/db/queries/researchFiles.ts`, `src/shared/types.ts`, `tests/unit/researchFiles.test.ts`. **Spec:** docs/09 §§9.3, 9.5. **Do:** add tables for `data_files`, `dataset_versions`, source manifests and checksums. **Accept:** SQLite tests verify path/partition/schema/hash/time-range/byte metadata, immutable dataset versions, and idempotent registration.

### T2.2 Add raw gzip JSONL writer and manifest

**Files:** `src/main/research/rawWriter.ts`, `src/main/research/rawWriter.test.ts`, `src/main/research/manifest.ts`. **Spec:** docs/09 §9.3. **Do:** rotate by hour or 64 MiB uncompressed, whichever occurs first; write exact response body envelopes without auth headers; hash files and register them in the catalog. **Accept:** rotation, restart recovery, partial-file quarantine, hash verification, and secret-header exclusion are tested with temp directories.

### T2.3 Add normalized Parquet writer/reader

**Files:** `research-worker/src/storage/parquet.py`, `research-worker/src/storage/catalog.py`, `research-worker/tests/test_storage.py`, `src/main/research/datasets.ts`. **Spec:** docs/09 §§9.3, 9.5. **Do:** read catalogued raw files; normalize into date-partitioned Parquet using pinned Zstandard compression; keep schema/data version. **Accept:** fixture round-trip preserves integer timestamps, nulls, addresses, event/available times; files <=128 MiB target; unknown schema fails visibly without overwriting prior data.

### T2.4 Enforce disk cap and cleanup policy

**Files:** `src/main/research/storageBudget.ts`, `src/main/research/storageBudget.test.ts`, `src/main/settings/defaults.ts`, `src/main/ipc/handlers/settings.ts`. **Spec:** docs/09 §9.3. **Do:** default cap 150 GiB; warning at 80%; stop low-priority deep fetch at 90%; pause raw writes at 95%; record gap and require explicit cleanup configuration. **Accept:** tests use a fake disk meter and prove no file deletion occurs automatically; cap states/events and cleanup preview are correct; final outcomes/run artifacts are excluded from cleanup candidates.

### T2.5 Replay and migration safety

**Files:** `scripts/research/replay-raw.mjs`, `src/main/research/replay.ts`, `src/main/research/replay.test.ts`. **Spec:** docs/09 §§9.3, 9.5. **Do:** replay raw fixtures into a new normalized dataset version, leaving previous data immutable. **Accept:** same raw input + normalizer version gives identical output hash; a changed normalizer creates a different version; SQLite backup/restore is verified before schema migration.

**PHASE 2 GATE:** raw-to-normalized replay is deterministic; disk cap only warns/pauses; no automatic data loss.

## Phase 3 — All-launch shallow capture

### T3.1 Update provider schemas from Phase 0 real fixtures

**Files:** `src/main/sources/geckoterminal.ts`, `src/main/sources/normalize.ts`, `src/main/sources/geckoterminal.test.ts`, `src/main/sources/normalize.test.ts`, `fixtures/gt/new_pools.real.json`, `fixtures/gt/pools_multi.real.json`, `fixtures/gt/trades.real.json`, `fixtures/gt/ohlcv.real.json`, `fixtures/gt/token_info.real.json`. **Spec:** docs/09 §§9.4–9.5; docs/build-spec/FIELDS.md. **Do:** implement only fields proven in real fixtures; preserve source-specific raw field paths in provenance. **Accept:** every supported endpoint has real fixture tests; unknown/missing fields become unknown; no synthetic fixture is treated as live proof.

### T3.2 Discover and retain every launch

**Files:** `src/main/pipeline/discovery.ts`, `src/main/db/queries/launches.ts`, `src/main/pipeline/discovery.test.ts`. **Spec:** docs/09 §9.4. **Do:** remove score/liquidity/developer filters from insertion; persist all provider-discovered launches and their coverage status; deduplicate on chain+mint+pool. **Accept:** test fixture with scam, dead, low-liquidity, migrated and supported launches inserts every item; repeat polls do not duplicate launches and do create observations.

### T3.3 Persist shallow market snapshots on measured cadence

**Files:** `src/main/pipeline/tracker.ts`, `src/main/pipeline/scheduler.ts`, `src/main/settings/defaults.ts`, `src/main/pipeline/tracker.test.ts`, `src/main/pipeline/scheduler.test.ts`. **Spec:** docs/09 §9.4. **Do:** configurable initial target cadence (15s first 5m, 1m to 1h, 5m to 24h, 15m thereafter) with provider quota adaptation; record actual cadence and every skipped interval reason. **Accept:** fake-clock tests cover tier transitions, rate-limit slowdown, no duplicate timers, and gaps; effective cadence is visible in Health.

### T3.4 Capture trades and pool migration observations

**Files:** `src/main/sources/normalize.ts`, `src/main/pipeline/trades.ts`, `src/main/db/queries/trades.ts`, `src/main/pipeline/trades.test.ts`, `fixtures/gt/trades.real.json`. **Spec:** docs/09 §§9.4–9.5. **Do:** store provider trade events with event/available timestamps and quality flags; map pool migration as a relationship rather than replacing original pool identity. **Accept:** real fixture verifies buy/sell side and amount direction; dedupe and out-of-order delivery are tested; ambiguous trade mapping is logged as unknown.

### T3.5 Record app/offline/source gaps and bounded backfill

**Files:** `src/main/pipeline/backfill.ts`, `src/main/db/queries/gaps.ts`, `src/main/pipeline/status.ts`, `src/main/pipeline/backfill.test.ts`, `src/main/pipeline/status.test.ts`. **Spec:** docs/09 §§9.4, 9.9. **Do:** gap on app close/offline/rate limit/provider outage; backfill only where source confirms availability and within configured page/cost cap. **Accept:** tests distinguish complete/incomplete backfill; unfillable time remains a visible gap; no backfilled record is assigned an earlier `availableAt` than actual fetch time.

### T3.6 Source coverage report

**Files:** `src/main/pipeline/coverage.ts`, `src/main/pipeline/coverage.test.ts`, `src/main/ipc/handlers/health.ts`, `tests/unit/coverage.test.ts`. **Spec:** docs/09 §§9.4, 9.9. **Do:** report launches by source/venue, failed calls, missing intervals/fields, capture lag, request budget, and known unsupported venues. **Accept:** seeded fixtures produce exact counts; UI wording does not imply full-chain coverage when any venue is unsupported.

**PHASE 3 GATE:** at least seven consecutive days of app-open capture, including a full overnight period with the app intentionally kept open, with gaps and source coverage reported and no unexplained data loss.

## Phase 4 — Deep observations and risk evidence

### T4.1 Holder snapshots and concentration

**Files:** `src/main/pipeline/holders.ts`, `src/main/sources/solanaRpc.ts`, `src/main/db/queries/holders.ts`, `src/main/pipeline/holders.test.ts`, `fixtures/rpc/getTokenLargestAccounts.real.json`, `fixtures/rpc/getMultipleAccounts.real.json`. **Spec:** docs/09 §§9.4, 9.6. **Do:** capture timestamped top holders, wallet/program/burn classifications, top1/top10, completeness. **Accept:** tests verify percentages against hand-calculated supply; unknown owner remains unknown; refresh scheduling respects measured credit caps.

### T4.2 Mint authority and Token-2022 extension observations

**Files:** `src/main/pipeline/tokenSecurity.ts`, `src/main/sources/solanaRpc.ts`, `src/main/db/queries/risk.ts`, `src/main/pipeline/tokenSecurity.test.ts`, `fixtures/rpc/getAccountInfo.mint-authority-active.synthetic.json`, `fixtures/rpc/getAccountInfo.mint-revoked.synthetic.json`, `fixtures/rpc/token2022-extensions.synthetic.json`. **Spec:** docs/09 §9.6. **Do:** record mint/freeze authorities, extension type and raw evidence at check time. **Accept:** active/revoked/unsupported/unavailable cases are distinct; permanent delegate and transfer-hook fixtures create the specified flags; no absence is interpreted as clear without a successful check. Synthetic extension fixture remains test-only; Phase 0 real fixture is required before claiming observed coverage.

### T4.3 Creator/deployer and wallet behavior features

**Files:** `src/main/pipeline/creator.ts`, `src/main/pipeline/walletAnalytics.ts`, `src/main/pipeline/creator.test.ts`, `src/main/pipeline/walletAnalytics.test.ts`, `fixtures/rpc/getSignaturesForAddress.real.json`, `fixtures/rpc/getTransaction.real.json`. **Spec:** docs/09 §§9.4–9.6. **Do:** derive creator/funding evidence within explicit page/credit caps; compute wallet behavior only over covered history and attach coverage windows. **Accept:** fixtures validate funding evidence, buy/sell/PnL math, and unknown history; incomplete wallets never receive a complete win-rate claim.

### T4.4 Timestamped third-party security observations

**Files:** `src/main/sources/securityProvider.ts`, `src/main/sources/securityProvider.test.ts`, `src/main/pipeline/riskObservations.ts`, `src/main/pipeline/riskObservations.test.ts`, `fixtures/security/token-scan.real.json`. **Spec:** docs/09 §§9.4, 9.6. **Do:** integrate only Phase 0-approved free source checks. Store fetched time, provider algorithm/version if exposed, response hash and status. **Accept:** a current scan is never backdated to launch time; provider failure yields unknown; storage terms checked in Phase 0.

### T4.5 Optional social/KOL capture feasibility adapter

**Planner approval required before this task exists.** On approval, Planner will create a separate exact file list. **Spec:** docs/09 §9.4. **Do:** capture social/KOL observations only when a lawful/allowed source and point-in-time timestamps are available. **Accept:** source terms and timestamps documented; if no valid free source passed Phase 0, mark social/KOL unavailable and do not scrape or guess.

### T4.6 Risk flag rules and evidence UI

**Files:** `src/main/research/riskFlags.ts`, `src/main/research/riskFlags.test.ts`, `src/main/ipc/handlers/launches.ts`, `src/shared/types.ts`, `src/renderer/screens/Detail/Evidence.tsx`, `src/renderer/screens/Detail/Overview.tsx`, `src/renderer/screens/Feed/columns.tsx`, `tests/unit/riskFlagsUi.test.tsx`. **Spec:** docs/09 §§9.6, 9.9. **Do:** map flag families to hit/clear/unknown with evidence timestamps; show flag evidence and completeness. Do not create the opportunity score in this phase. **Accept:** UI distinguishes unknown from clear; fixtures include honeypot, active authority, insider sell, concentration, stale source and false-positive cases; no “safe/profitable” label appears.

**PHASE 4 GATE:** owner can inspect real token timelines and see raw evidence, provenance, unknowns and collection timestamps for each enabled risk family.

## Phase 5 — Point-in-time dataset, labels, and simulator

### T5.1 Point-in-time feature builder

**Files:** `research-worker/src/features/build.py`, `research-worker/tests/test_features.py`, `research-worker/src/storage/catalog.py`. **Spec:** docs/09 §§9.5, 9.7. **Do:** build feature rows only from `availableAt <= decisionAt`; version feature code and output. **Accept:** planted future observations are excluded; a late historical API response cannot become an earlier feature; null remains null; identical input/version hashes match.

### T5.2 Outcome/label builder

**Files:** `research-worker/src/labels/build.py`, `research-worker/tests/test_labels.py`. **Spec:** docs/09 §9.7. **Do:** create 1m/5m/1h/6h/24h outcome and censoring labels at eligible decision times. **Accept:** hand-worked fixtures verify boundaries, no-data censoring, dead/unexitable outcomes, and no future-best-price entry/exit.

### T5.3 Versioned cost and impact model

**Files:** `research-worker/src/sim/costs.py`, `research-worker/tests/test_costs.py`, `src/main/settings/defaults.ts`. **Spec:** docs/09 §9.7. **Do:** implement documented fee, network cost, delay, size/liquidity price impact and stress multipliers. **Accept:** every formula has a hand-calculated fixture; base/stress settings are frozen into every run; unmeasured values are visibly labelled assumptions.

### T5.4 Deterministic event-driven backtester

**Files:** `research-worker/src/sim/engine.py`, `research-worker/src/sim/portfolio.py`, `research-worker/tests/test_engine.py`. **Spec:** docs/09 §9.7. **Do:** simulate signal delay, entries/exits, concurrent positions, liquidity constraints, partial/unexitable outcomes and costs. **Accept:** tests cover winner, rug, sparse trades, migration, insufficient liquidity, stale data, failed exit and portfolio exposure; rerunning a seeded config gives identical trades/metrics.

### T5.5 Chronological split builder and baseline suite

**Files:** `research-worker/src/evaluation/splits.py`, `research-worker/tests/test_splits.py`, `research-worker/src/baselines/no_trade.py`, `random_eligible.py`, `persistence.py`, `simple_rules.py`, `research-worker/tests/test_baselines.py`, `research-worker/src/reports/baseline.py`. **Spec:** docs/09 §9.8. **Do:** create chronological train/validation/final-test periods with horizon-sized embargo; implement no-trade, random eligible, persistence, and simple liquidity/momentum baselines. **Accept:** no cohort crosses forbidden boundaries; final test data is inaccessible to tuning commands; reports show net results and sample sizes.

**PHASE 5 GATE:** labels and backtest reproduce known cases and pass explicit leakage checks; baseline outcomes are plausible under stress costs.

## Phase 6 — Local model benchmarking and integrated ranking

### T6.1 Predictive metrics and calibration

**Files:** `research-worker/src/evaluation/metrics.py`, `research-worker/tests/test_metrics.py`, `research-worker/src/reports/metrics.py`, `research-worker/tests/test_metrics_report.py`. **Spec:** docs/09 §§9.6, 9.8. **Do:** implement return error, positive-net precision/recall, rank correlation/top-k outcomes, probability calibration, downside, drawdown and exitability metrics. **Accept:** hand-calculated fixture values match; undefined metrics show null with reason; metrics include sample counts and time cohort.

### T6.2 Interpretable tabular baselines

**Files:** `research-worker/src/models/baselines.py`, `research-worker/tests/test_model_baselines.py`. **Spec:** docs/09 §9.8. **Do:** fit simple regression/classification and one tree-based model using training split only. **Accept:** seeded test is deterministic; feature availability assertions prevent leakage; model artifact stores dependency/model hashes and training range.

### T6.3 Candidate model training and ranking output

**Files:** `research-worker/src/models/train.py`, `research-worker/src/models/rank.py`, `research-worker/tests/test_rank.py`, `src/main/db/queries/researchRuns.ts`, `src/main/ipc/handlers/researchJobs.ts`, `src/shared/types.ts`. **Spec:** docs/09 §§9.6, 9.8. **Do:** generate per-horizon return/downside estimates and one 0–100 cross-sectional percentile ranking of predicted 6-hour net return, then attach risk evidence/completeness. Risk features participate in the same return estimator; no separate risk-score combination is required. **Accept:** cohort boundaries and fewer-than-five fallback test; missing 6-hour estimate produces null; score is never called probability; report demonstrates comparison to naive baseline on validation only.

### T6.4 Kronos benchmark adapter

**Files:** `research-worker/src/models/kronos_adapter.py`, `research-worker/tests/test_kronos_adapter.py`, `research-worker/src/reports/kronos_benchmark.py`, `data/research/kronos-benchmark.json`. **Spec:** docs/09 §9.8. **Do:** load only the owner-approved checkpoint and pinned tokenizer; convert canonical OHLCV sequences; benchmark inference memory/runtime and forecast/ranking performance against the same splits. **Accept:** CPU fallback works; GPU out-of-memory fails as a typed job error; no chart screenshots; checkpoint hashes logged; Kronos is retained only if it beats baseline out of sample.

### T6.5 Local model/resource controls

**Files:** `src/main/research/resourcePolicy.ts`, `src/main/research/resourcePolicy.test.ts`, `research-worker/src/runtime/resources.py`, `research-worker/tests/test_resources.py`. **Spec:** docs/09 §§9.2, 9.8. **Do:** cap concurrent jobs to one by default; report RAM/VRAM and permit cancel/pause; avoid loading multiple large models simultaneously. **Accept:** fake resource tests prove queueing and cancellation; worker crash does not block UI/data collection; no model auto-download on launch.

### T6.6 Opportunity ranking UI

**Files:** `src/renderer/screens/Feed/columns.tsx`, `src/renderer/screens/Feed/FeedTable.tsx`, `src/renderer/screens/Detail/Overview.tsx`, `src/renderer/screens/Detail/Evidence.tsx`, `src/renderer/screens/Lab/LabResults.tsx`, `src/shared/types.ts`, `tests/unit/researchRankingUi.test.tsx`. **Spec:** docs/09 §§9.6, 9.9. **Do:** show rank, expected net return horizons, downside, completeness, model/version and explainable flags. **Accept:** unknown data is visibly unknown; run/version drilldown works; output can be exported with provenance; no strategy is framed as a buy instruction.

**PHASE 6 GATE:** at least one local model has a reproducible, leakage-checked comparison against naive baselines; otherwise the accepted result is `NO ROBUST EDGE FOUND` and data collection continues.

## Phase 7 — Logged strategy search and selection

### T7.1 Immutable experiment registry

**Files:** `research-worker/src/experiments/registry.py`, `research-worker/tests/test_registry.py`, `src/main/db/migrations/005_experiments.sql`, `src/main/db/queries/experiments.ts`, `src/main/ipc/handlers/experiments.ts`, `src/main/db/queries/experiments.test.ts`, `src/main/ipc/handlers/experiments.test.ts`. **Spec:** docs/09 §9.8. **Do:** store run hashes, candidate space, data manifest, code commit, metrics and all statuses. **Accept:** completed/failed runs cannot be edited or deleted through app; every result resolves to exact config/data/model hashes.

### T7.2 Bounded candidate generator

**Files:** `research-worker/src/experiments/search.py`, `research-worker/tests/test_search.py`, `research-worker/src/experiments/budget.py`, `research-worker/tests/test_budget.py`, `src/main/settings/defaults.ts`, `src/main/settings/store.ts`, `src/main/settings/store.test.ts`. **Spec:** docs/09 §9.8. **Do:** search only declared entry, exit, threshold, hold-duration and risk-filter parameters; enforce saved candidate, wall-clock, RAM and GPU budgets. **Accept:** budget stops search deterministically; search never edits data, labels, split, or cost definitions; all candidates are logged before evaluation.

### T7.3 Walk-forward evaluator and robustness reports

**Files:** `research-worker/src/evaluation/walk_forward.py`, `research-worker/tests/test_walk_forward.py`, `research-worker/src/reports/robustness.py`, `research-worker/tests/test_robustness_report.py`. **Spec:** docs/09 §9.8. **Do:** evaluate frozen candidates over multiple chronological periods and base/stress costs; include per-month, venue, liquidity, age, risk flags, drawdown and concentration. **Accept:** hand-built regimes appear in the correct buckets; final test remains locked; all tested variants appear in report, including losers.

### T7.4 Candidate selection gate

**Files:** `research-worker/src/evaluation/selection.py`, `research-worker/tests/test_selection.py`, `src/renderer/screens/Results/index.tsx`, `src/renderer/screens/Results/RunComparison.tsx`, `src/renderer/screens/Results/TradeBreakdown.tsx`, `tests/unit/selectionUi.test.tsx`. **Spec:** docs/09 §§9.8, 9.10. **Do:** classify `NO ROBUST EDGE FOUND` unless the candidate beats naive baselines across required untouched windows and cost cases. **Accept:** synthetic pass and fail cases verify gate; no user can override failed final test without creating a clearly labelled exploratory run that does not count as readiness.

**PHASE 7 GATE:** owner reviews the full search ledger and accepts the robustness report; no hidden best-of-many result.

## Phase 8 — Local research assistant (optional after model phase)

### T8.1 Local LLM discovery and hardware benchmark

**Files:** `research-worker/src/llm/benchmark.py`, `data/research/model-benchmark.json`. **Spec:** docs/09 §§9.2, 9.8. **Do:** compare locally runnable models against a fixed research-QA set on current RAM/VRAM; no cloud fallback. **Accept:** model/license/hash/runtime/memory recorded; model is optional; failure disables assistant without affecting collection/backtests. Planner may summarize evidence in docs.

### T8.2 Local report assistant with evidence links

**Files:** `research-worker/src/llm/assistant.py`, `research-worker/tests/test_assistant.py`, `src/main/research/assistant.ts`, `src/main/research/assistant.test.ts`. **Spec:** docs/09 §§9.1, 9.8–9.9. **Do:** answer only from selected local run/token artifacts and cite artifact row/field IDs. **Accept:** absent evidence returns “unknown”; prompt injection in token metadata is treated as untrusted text; assistant cannot edit config, start search, or relabel outcomes without explicit UI action.

**PHASE 8 GATE:** if local model quality is poor or resource cost is excessive, ship without the assistant; this does not block core research.

## Phase 9 — Prospective paper validation

### T9.1 Freeze model/strategy paper version

**Files:** `research-worker/src/paper/freeze.py`, `research-worker/tests/test_freeze.py`, `src/main/db/migrations/006_paper.sql`, `src/main/db/queries/paper.ts`, `src/main/db/queries/paper.test.ts`. **Spec:** docs/09 §§9.8–9.10. **Do:** freeze model, features, strategy, costs and config hashes for a new prospective evaluation period. **Accept:** edits create a new version; all paper signals carry frozen hashes and capture timestamp.

### T9.2 Generate and record paper signals

**Files:** `src/main/paper/signals.ts`, `src/main/paper/signals.test.ts`, `src/main/paper/evaluation.ts`, `src/main/paper/evaluation.test.ts`, `src/main/ipc/handlers/paper.ts`, `src/main/ipc/handlers/paper.test.ts`, `src/main/db/queries/paper.ts`. **Spec:** docs/09 §§9.7, 9.9. **Do:** record candidate signal, hypothetical order-arrival time/size, expected entry/exit and risk evidence without calling any trading API. **Accept:** network mocks assert no order endpoints are called; each signal is immutable and gets eventual outcome/censor status.

### T9.3 Paper monitoring and locked evaluation report

**Files:** `research-worker/src/paper/report.py`, `research-worker/tests/test_paper_report.py`, `src/renderer/screens/Paper/index.tsx`, `src/renderer/screens/Paper/SignalTable.tsx`, `src/renderer/screens/Paper/PaperSummary.tsx`, `tests/unit/paperUi.test.tsx`. **Spec:** docs/09 §§9.8–9.10. **Do:** show prospective net performance, drawdown, signal delays, exits, missing data and cohort results. **Accept:** changing the model/strategy starts a separate paper cohort; owner-defined duration/sample gates must be set before collection and cannot be silently shortened.

**PHASE 9 GATE:** owner reviews an untouched forward-paper report. Passing it only qualifies the research result for discussion; it does not authorize live trading.

## Phase 10 — Research product hardening

### T10.1 Backup, restore, and corruption recovery

**Files:** `src/main/app/backup.ts`, `src/main/app/backup.test.ts`, `src/main/research/manifest.ts`, `src/main/research/manifest.test.ts`. **Spec:** docs/09 §9.3; docs/08 §8.1. **Accept:** backups cover SQLite and catalog manifests; restore verifies hashes and can rebuild derived files; failed restore leaves original data untouched.

### T10.2 Long-run capture and resource soak

**Files:** `tests/e2e/research-soak.spec.ts`, `scripts/research/summarize-soak.mjs`. **Spec:** docs/09 §§9.2–9.4; docs/08 §8.2. **Accept:** 72-hour app-open run across sleep/resume, source outage, rate limit, full disk warning and model cancellation; no silent corruption or UI freeze; resource/storage logs included.

### T10.3 Security and scope audit

**Files:** `tests/unit/security-scope.test.ts`, `scripts/research/audit-scope.mjs`. **Spec:** docs/09 §§9.1–9.2; docs/08 §8.3. **Accept:** renderer has no network; worker has no listening socket; secrets absent from raw/logs; code contains no signing/order submission; legacy real records remain read-only.

### T10.4 Windows packaging and fresh-profile worker setup

**Files:** `electron-builder.yml`, `package.json`, `scripts/research/bootstrap-worker.ps1`, `scripts/research/verify-package.mjs`, `src/main/research/worker.ts`. **Spec:** docs/09 §§9.2–9.3; docs/08 §§8.1, 8.5. **Do:** package the pinned worker bootstrap/runtime according to the Phase 0 decision; show a clear first-run status if Python/model files are missing; never silently download a model. **Accept:** `verify-package.mjs` and the documented manual fresh-profile check confirm install and launch; app remains usable if optional model files are absent; collection and worker status are clear; no network is used for model download.

### T10.5 Final research readiness report

**Files:** `docs/build-spec/FINAL-RESEARCH-REPORT.md` (Planner only), `STATUS.md` evidence. **Spec:** docs/08 §§8.2–8.4. **Do:** compile all phase gate evidence, known gaps, selected providers, disk use, model evaluation, strategy search and paper results. **Accept:** owner signs off on research readiness; report states edge found/not found and limitations; live-trading project remains unapproved and unimplemented.

**FINAL GATE:** research and paper system is stable, reproducible, locally operated, and honest about uncertainty. No task in this roadmap enables live execution.
