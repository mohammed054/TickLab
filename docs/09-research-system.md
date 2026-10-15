# 09 — Local Solana Research System Specification

This is the authoritative product/technical specification for transforming TickLab. It supersedes conflicting research behavior in docs/01–06. Task order is in docs/07; quality gates are in docs/08.

## 9.1 Non-negotiable boundary

The product collects market/on-chain data and conducts local research. It does not sign, submit, simulate a real wallet, connect to a trading venue, or use real funds. Remove the current `real` journal account and real-wallet import from the product scope; preserve historical user-entered records during migration/export, but do not add new real-trade workflows. Any future execution feature is a separate project requiring new owner approval.

All model inference, feature computation, training, experiment search, and reports run on the user's PC. Hosted services may provide raw/normalized blockchain data only. Never send token-level research data, wallet histories, or private data to a hosted AI service.

## 9.2 Architecture and ownership

Keep the Windows Electron + TypeScript + React app and SQLite operational database. Add a local Python research worker for offline dataset construction, model training/inference, and backtests. Python is launched as a child process by Electron main, communicates only through stdin/stdout JSON Lines, and has no listening TCP/HTTP server. The renderer cannot launch processes or access the network.

Process responsibilities:

| Process | Responsibilities | Must not do |
|---|---|---|
| Electron renderer | Charts, tables, filters, job controls, local reports through allowlisted IPC | Network requests, Python imports, DB access |
| Electron main (TypeScript) | Provider clients, rate limits, operational SQLite, scheduler while app is open, bounded worker lifecycle, IPC validation | Model training on UI thread; transaction signing or order submission |
| Python worker | Read versioned local datasets, build point-in-time features/labels, train/evaluate models, bounded strategy search, write run artifacts | General network access, secret access, transaction code, silent data edits |

Worker protocol is one JSON object per line. Requests have `id`, `command`, `payload`; responses have the same `id`, `ok`, and either `result` or typed `error`; progress is a separate `event:"progress"` line with `jobId`, `stage`, `completed`, `total`, `message`. Stdout is protocol-only; logs go to stderr. Electron rejects malformed JSON, unknown commands, duplicate in-flight IDs, and responses above 1 MiB. Worker shutdown has a 10-second graceful period, then terminates the child and marks the job interrupted. Job state is persisted before launch and after every progress event. The optional Ollama client is the sole network exception: it may connect only to the configured loopback address `127.0.0.1` and must fail closed if configured to any other host. No worker command may use an external network.

The worker is local and may use CPU or CUDA, but Phase 0 must measure the actual GPU model/VRAM and RAM. No task may assume the RTX 2060 variant or fit a model before this probe. Model jobs default to one concurrent training process; inference and ingestion must remain usable while a model job runs.

## 9.3 Local storage layout and cap

Default research allocation: **150 GiB** beneath `<userData>/research/`, configurable from Settings. Keep at least 50 GiB outside this allocation on the reported 200 GB storage. Before enabling capture, calculate available disk space. Do not interpret the cap as the capacity of the physical drive.

| Path | Contents | Format |
|---|---|---|
| `<userData>/radar.db` | Launch index, latest state, job state, gaps, source usage, settings, model/run registry, compact queries | Existing SQLite, WAL |
| `<userData>/research/raw/provider=<id>/date=YYYY-MM-DD/hour=HH/` | Exact response bodies plus request metadata and checksums | Gzip-compressed JSON Lines, rotated at 64 MiB uncompressed or 1 hour |
| `<userData>/research/normalized/kind=<kind>/date=YYYY-MM-DD/` | Canonical append-only trades/events/snapshots | Parquet, Zstandard compression, files rotated at 128 MiB |
| `<userData>/research/runs/<run-id>/` | Frozen config, logs, metrics, predictions, plots, model files | JSON/CSV/Parquet/model-native files |

Each raw envelope has `source`, `endpointId`, `requestId`, `requestAt`, `responseAt`, `httpStatus`, `bodySha256`, `schemaVersion`, and the exact response body. Secrets and authorization headers are never recorded. Normalized rows carry both `eventAt` and `availableAt`, provider/source identifiers, and schema version. Never rewrite raw records. Normalization is repeatable and versioned; reprocessing writes a new derived dataset version.

At 80% of cap, show a persistent warning and estimate time to cap. At 90%, stop low-priority deep capture and model artifact duplication, but keep shallow launch capture if space allows. At 95%, stop new raw writes safely, persist a `storage_cap` gap, and alert. Do not silently delete anything. A user-configured cleanup job may prune **oldest raw response files first**, after verifying hashes and retaining their manifest. Keep compact normalized launch outcome summaries, scam/risk labels, experiment metadata/metrics, and model configs. Old normalized tick-level data may be downsampled only by an explicit versioned compaction task that verifies source checksums and preserves original-file manifests. Never delete a research run or its final test predictions automatically.

The 150 GiB cap is a Phase 0 starting value, not a forecast. Phase 0 records actual bytes/day by data class and estimates retention. Update the default only through Planner review based on measurement.

## 9.4 Data universe, sources, and capture policy

### Universe

Capture every Solana new launch discoverable from the selected source(s), across supported DEX/launch venues. Do not filter scam/dead/low-liquidity/failed launches out of the shallow dataset. Retain source coverage and exclusions explicitly. If a source does not support a venue, mark that venue as a known coverage gap; never claim “all Solana launches” from partial coverage.

### Provider selection

The initial adapter already in the app is GeckoTerminal, with Solana RPC support. Phase 0 must compare these against at least one historical/on-chain data provider for: venue coverage, historical depth, launch capture completeness, data delay, missingness, point-in-time availability, rate limits, terms for local storage/research, and measured free-tier cost. Select the smallest free-first combination that meets measured needs. A paid service, cloud data download, or changed provider limit requires explicit owner approval. Provider endpoints/field names are not considered verified until saved real fixtures pass the report.

Provider adapters belong in `src/main/sources/`; provider network access stays in Electron main. No model worker network access. API rate limits are provider-configured and evidence-backed; do not hardcode marketing claims from unofficial pages.

### Capture tiers

| Tier | Universe | Required records | Default behavior |
|---|---|---|---|
| 1 — shallow | Every discovered launch | mint, pool, DEX/venue, quote mint, first observed time, source creation time when known, price, liquidity/reserves if available, FDV/market cap if source supplies it, volume and buy/sell counts, source health and raw response reference | Immediate launch record plus snapshots at 15-second cadence for first 5 minutes, 1-minute cadence to 1 hour, 5-minute cadence to 24 hours, then 15-minute cadence while app remains open, subject to the Phase 0 measured quota. If provider limits make this infeasible, preserve launch and trade events first, then lower snapshot cadence with a visible documented coverage setting. |
| 2 — selected deep | Tokens selected by user watchlist or configured research sampling policy | swap/trade events and wallet addresses where available, holder distribution, creator/deployer evidence, authority/token-extension state, security scan, liquidity changes, social/KOL metadata only from a source with a documented timestamp | Selection reason and timestamp are stored. Never select only tokens already known to pump. Sampling includes a random cohort of eligible launches for unbiased training/evaluation. |
| 3 — outcome follow-up | Every launch, including untracked/dead tokens | last observed state, time to inactivity, known pool migration, whether observable exit liquidity existed, forward outcomes at 1m/5m/1h/6h/24h when capture supports it | Derived labels stay even if raw deep records are later pruned. Missing future observation stays censored/unknown, not zero return. |

The 15s/1m/5m/15m cadences are initial targets. Phase 0 measures provider limits and data loss; Phase 1 must encode final effective cadences in settings and report any reductions. Preserve every launch id even when subsequent data is unavailable. Record app-closed/offline/provider gaps with start/end/reason and backfill attempt result.

### Required data families

Collect, where available and allowed by provider terms:

1. Launch, mint, pool, venue, quote asset, pool migration, and token metadata.
2. Swaps/trades with event time, available time, side, quote/base amounts, price, pool, transaction id, wallet when provider exposes it.
3. OHLCV/reserves/liquidity and price/volume/change windows that can be reconstructed at 1m, 5m, 1h, 6h, and 24h.
4. Supply, market cap/FDV (preserve provider semantics), holder count/distribution, top-1/top-10 concentration, burn/program classifications, and timestamped wallet holdings when obtainable.
5. Creator/deployer address and observable funding links, with evidence depth and confidence.
6. Mint/freeze authority and relevant Token-2022 extensions; security/honeypot/tax checks with request/available timestamps and source/version.
7. Wallet/creator history and realized/unrealized P&L only where it can be computed from covered trades, with coverage/completeness metadata.
8. Social/KOL/community data only if source terms permit collection and point-in-time timestamps are available. Treat absent or delayed social data as unknown.

For every field, store `value`, `known/unknown/not_supported`, `eventAt`, `availableAt`, `source`, and a quality/provenance reference. Null must not silently mean zero or “safe.”

## 9.5 Research event schema and point-in-time rule

Every training/backtest feature at decision time `T` may use only records where `availableAt <= T`. `eventAt` alone is insufficient: a historical API response fetched later must not be treated as information the model had at `T`. For fields without point-in-time snapshots, either begin forward capture or exclude that feature from historical evaluation.

Canonical normalized dataset entities:

| Entity | Required keys/fields |
|---|---|
| Launch | `launchId`, `mint`, `pool`, `venue`, `quoteMint`, `sourceCreatedAt?`, `firstSeenAt`, `availableAt`, `sourceId`, `coverageStatus` |
| Trade | `tradeId`, `launchId`, `txId`, `eventAt`, `availableAt`, `side`, `baseAmount?`, `quoteAmount?`, `priceUsd?`, `wallet?`, `sourceId`, `qualityFlags[]` |
| Snapshot | `snapshotId`, `launchId`, `eventAt`, `availableAt`, `priceUsd?`, `liquidityUsd?`, `reserves?`, `fdvUsd?`, `marketCapUsd?`, volume/trade/buyer windows, `sourceId` |
| HolderSnapshot | `snapshotId`, `mint`, `eventAt`, `availableAt`, `supply?`, holder count, top1/top10 %, wallet/program/burn aggregates, completeness, source |
| RiskObservation | `mint`, `eventAt`, `availableAt`, `checkId`, `status` (`hit|clear|unknown`), `severity`, `evidence`, `sourceId`, `version` |
| WalletObservation | `wallet`, `eventAt`, `availableAt`, activity/trade aggregates, coverage window, source and completeness |
| Outcome | `launchId`, `decisionAt`, horizon, simulated entry/exit assumptions, gross/net return, max adverse/favorable excursion, exitability, censoring reason, datasetVersion |

SQLite remains the operational index/job store; high-volume append-only market data lives in date-partitioned compressed files. Add a data catalog in SQLite with file path, entity, time range, row count, schema version, bytes, SHA-256, and normalized dataset version. Data migration must never overwrite existing user DB; back up and provide an export/rollback path first.

## 9.6 Integrated opportunity rank and risk flags

The UI presents **one ranked opportunity score** and its components. The primary objective is expected **net return after modeled costs at 6 hours** from the first eligible decision time. The other horizons are supporting diagnostics. Risk observations/flags are inputs to the same ranking task and remain separately visible as evidence; version 1 does not require a separate scam model or force the user to combine multiple scores. The score is a ranking aid, not an instruction or safety guarantee. Initial output fields:

```ts
interface OpportunityAssessment {
  launchId: number;
  computedAt: number;
  score: number | null; // 0..100 ranking percentile, not probability of profit
  expectedNetReturnPct: Record<'1m'|'5m'|'1h'|'6h'|'24h', number | null>;
  probabilityPositiveNetReturn: Record<'1m'|'5m'|'1h'|'6h'|'24h', number | null>;
  downsideEstimatePct: number | null;
  dataCompleteness: number;
  flags: RiskFlag[];
  explanation: string[];
  modelVersion: string;
  featureVersion: string;
}
```

The initial score is the **cross-sectional percentile rank of predicted 6-hour net return** among launches first observed in the same 15-minute cohort; clamp to 0–100. If fewer than 5 eligible launches are in a cohort, use the trailing 24-hour cohort. Missing 6-hour prediction means score `null`. This score is not a probability. Risk flags and other risk features are inputs to the same trained return estimator and remain visible as separate evidence. Phase 6 may replace this baseline formula only with a measurable out-of-sample improvement. Do not hard-exclude a token solely because an unvalidated third-party flag says “unsafe”; expose the evidence and let the evaluated strategy define explicit exclusions.

Risk flag families to record and test:

- Mint authority active; freeze authority active.
- Token-2022 permanent delegate, transfer hook, transfer-fee, default-frozen, and other extension states when present.
- Low/withdrawn liquidity, concentration among top holders, creator/deployer retained supply.
- Creator-linked wallets, suspicious funding/common-control evidence, fast insider selling, bundled/clustered launch activity.
- Honeypot/transfer restrictions, sell failure/tax simulation, authority/permission changes.
- Wash-like volume, asymmetric/outlier trades, abnormal buy/sell/unique-wallet ratios.
- Inactive/migrated pool, stale data, missing timestamps, unreliable price, unknown holder coverage.
- Social link/domain quality or sudden social changes only when timestamped evidence is available.

Each risk flag has an ID, definition, source, evidence time, severity, status (`hit|clear|unknown`), false-positive/false-negative review, and version. Unknown data lowers completeness; it is not a clear result. Keep all launches in the research corpus regardless of flags to measure both missed scams and false alarms.

## 9.7 Labels, costs, and simulator

At each eligible decision time, build candidate labels for 1m, 5m, 1h, 6h, and 24h. Use the first realistically observable quote/pool after the configured data/decision delay, then simulate exit at a predeclared horizon or strategy rule. No entry at an unseen candle open and no exit at a future best tick.

For each simulated fill, record:

- observed decision time and simulated order-arrival time;
- pool and quote route assumed;
- notional size, available liquidity, estimated price impact/slippage;
- buy and sell fees, network/priority costs, and any failed/unexitable condition;
- gross return, total costs, net return, maximum adverse excursion, maximum favorable excursion;
- whether an exit at the modeled size was feasible using contemporaneous liquidity/trades.

### Required formulas and missing-data behavior

Let `N` be the entry notional before fees, `Qin`/`Qout` be the simulated input/output token quantities, `fBuy`/`fSell` the fee fractions per side, and `Cnetwork` the sum of entry/exit network costs in USD. All costs are charged against realized proceeds; never omit a fee because it is unavailable. If a fee/cost cannot be measured, use the versioned conservative assumption and label the result as assumption-dependent.

```text
entryFeeUsd      = N * fBuy
totalEntryCost   = N + entryFeeUsd + entryNetworkCostUsd
grossExitUsd     = executable output amount at the modeled exit time, before sell fees
exitFeeUsd       = grossExitUsd * fSell
netProceedsUsd   = grossExitUsd - exitFeeUsd - exitNetworkCostUsd
netPnlUsd        = netProceedsUsd - totalEntryCost
netReturnPct     = 100 * netPnlUsd / totalEntryCost
```

`grossExitUsd` and `Qin/Qout` must come from a venue/pool-specific historical quote reconstruction using the pool state and swap direction at the simulated arrival time. Do not use candle high/low, a later quote, or close price as an executable fill. If the provider history cannot reconstruct pool state/quote for the selected venue, mark the fill `not_simulatable` and exclude that venue from claims about executable strategy returns; retain its descriptive outcomes. Phase 0 must determine which venues meet this requirement. `maxAdversePct` is the minimum path return from simulated entry to exit within the horizon; `maxFavorablePct` is the maximum path return, both based only on trades/quotes available within the outcome window.

All costs and routing assumptions are versioned settings, initially calibrated from observed provider/on-chain data and labeled as assumptions until measured. Reports show optimistic/base/stress cases, with each multiplier stored in the frozen config. A token with no credible exit path is marked unexitable and treated as a loss: `netProceedsUsd = 0`, `netPnlUsd = -totalEntryCost`, and `netReturnPct = -100`. It is never dropped from results. If the outcome horizon ends before a valid exit can be observed, label it censored instead of assuming an exit or loss.

Labels: net return by horizon (continuous), positive-net outcome (binary), downside/drawdown, scam/risk evidence outcomes where ground truth exists, and `censored`/`unknown` when observation ends early. The ranking target is 6-hour net return. Do not define “winner” solely as a multiple from peak; include executable entry/exit and downside.

## 9.8 Models and strategy research

### Model ladder

1. **Data sanity and naive baselines:** persistence/no-change forecast; random eligible ranking; market/liquidity/momentum rules; always-skip baseline.
2. **Interpretable tabular models:** logistic/linear and tree-based models using point-in-time features. Compare calibration and ranking value.
3. **Sequence models:** evaluate Kronos mini/small/base against the same chronological splits and OHLCV inputs. Kronos tokenizes numeric K-line sequences; do not assume screenshot/chart-image input. It may be dropped if it does not beat simple baselines on Solana data.
4. **Local LLM assistant:** optional Ollama-compatible local model may explain saved reports, answer questions over local run artifacts, and propose hypotheses through Ollama's local loopback API only. It must not invent data, alter labels, silently tune a strategy, or mark a strategy successful. Every hypothesis it proposes must become an explicit logged experiment before evaluation. Cloud models/fallbacks are disabled.

Model candidates and dependencies are not installed until Phase 0 checks Python/CUDA compatibility, license, disk size, RAM/VRAM, and offline operation. Pin all Python dependencies and model identifiers/hashes. Do not download models at app startup. Model artifacts are stored locally and tracked by checksum.

### Experiment controls

Every run stores `runId`, code commit, data/file manifest hashes, dataset version, feature version, label version, model/config hash, seed, machine/runtime info, start/end, metrics, logs, predictions, and status. Runs are immutable. Search is bounded by a saved experiment budget (max candidates, wall-clock, memory, and GPU utilization); default one training/search worker. Allow pause/resume/cancel. The executor may not erase failed or poor runs.

### Split and selection rules

- Use chronological train/validation/untouched-test splits; never random-shuffle token-time rows across periods.
- Keep launches from the same time cohort together. Add a purge/embargo at least as long as the prediction horizon when labels overlap.
- Freeze one final test period before model/strategy selection. Do not repeatedly tune against it.
- Run walk-forward evaluation across multiple market periods, plus per-month, venue, liquidity, age, and risk-flag cohorts.
- Record every tested strategy/model variant and include selection bias/multiple-testing caution in reports.
- Report rank metrics and probability calibration as well as net performance, drawdown, trade count, unexitable rate, and outcome concentration.
- Promote a candidate only if it beats naive/simple baselines across multiple out-of-sample windows under base and stress costs. If not, display `NO ROBUST EDGE FOUND` and keep researching.

Strategy search may vary only declared entry, exit, threshold, hold duration, and risk filter parameters. It cannot change data cleaning, split boundaries, cost assumptions, or final test data. A search run records its full candidate space and selection rule before execution.

## 9.9 Local user workflows

The transformed app’s primary screens are:

1. **Launch Feed:** all shallow-captured launches; source coverage and data quality visible; filters never alter the underlying raw corpus.
2. **Token Research Detail:** timeline, OHLCV, trades, liquidity, holders, creator/deployer, security/risk evidence, known unknowns, and observation timestamps.
3. **Research Lab:** choose a frozen dataset/feature/label version, baseline/model, split, costs, and experiment budget; start/monitor/cancel local jobs.
4. **Strategy Results:** compare run outputs to baselines, inspect trades/cohorts/drawdowns, save hypothesis and verdict.
5. **Paper Forward:** record signals prospectively on newly observed launches; never send orders. Lock strategy/model versions during each evaluation window.
6. **Data Health/Settings:** disk use, sources, capture gaps, API budget, data coverage, Python/worker/model readiness, and cleanup controls.

The old Journal becomes a read-only Legacy Archive reachable from Settings. Preserve existing paper/real decision, fill, note, equity, and wallet-import rows exactly; label them as legacy user-entered/imported data and never use them as model training/backtest evidence. Remove new decision/fill entry, wallet import, account mutation, and real-trade workflows. Provide CSV export without editing or deleting the legacy rows.

## 9.10 Readiness phases

“Ready” for this project means the research and forward-paper gates in docs/08 pass. It does not mean a strategy will win or that live trading is authorized. Live readiness, exchange/DEX routing, wallet custody, transaction signing, and capital controls belong to a new owner-approved specification.
