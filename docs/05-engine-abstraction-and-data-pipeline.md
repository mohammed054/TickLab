# 05 — Engine Abstraction Layer and Data Pipeline

## 5.1 The `SimulatorContract` — why and what

**Why**: `docs/01-architecture-overview.md` and the master requirements explicitly
forbid architecting the whole product so tightly around one library that another
simulator can never be added. `hftbacktest` is excellent and is the Phase 1–4
engine, but the Job Runner, Experiment Store, and every UI panel must talk to a
**contract**, not to `hftbacktest` types directly.

**The contract** (Rust trait, `engine/abstraction/src/contract.rs`):

```rust
pub trait SimulatorContract {
    type Config;      // simulator-specific config, constructed from our normalized BacktestRequest
    type Handle;       // a running/completed backtest handle

    fn validate_dataset(&self, dataset: &DatasetRef) -> Result<DataQualityReport, EngineError>;
    fn prepare_dataset(&self, dataset: &DatasetRef) -> Result<PreparedDataset, EngineError>;
    fn start_backtest(&self, req: BacktestRequest) -> Result<Self::Handle, EngineError>;
    fn poll_progress(&self, handle: &Self::Handle) -> BacktestProgress;
    fn stream_events(&self, handle: &Self::Handle) -> EventStream; // for replay + investigation
    fn collect_results(&self, handle: &Self::Handle) -> Result<BacktestResult, EngineError>;
    fn cancel(&self, handle: &Self::Handle) -> Result<(), EngineError>;
}
```

- `BacktestRequest`, `DatasetRef`, `DataQualityReport`, `BacktestProgress`,
  `BacktestResult`, and `EventStream` are **our own normalized types**, defined in
  `docs/15-api-and-data-model-spec.md` §15.5, independent of `hftbacktest`'s native
  types. `engine/abstraction/src/hftbacktest_impl.rs` is the only file allowed to
  translate between our types and `hftbacktest`'s native `Asset`/`Event`/builder
  types.
- Every other service (Job Runner, Experiment Store, Data Pipeline, all frontend
  code) only ever sees the normalized types, via the gRPC service defined over this
  contract (`engine.proto`, `docs/15` §15.4).
- Adding a second simulator later means implementing `SimulatorContract` again in a
  new module and adding a config switch — no changes required anywhere else in the
  system. This is the concrete mechanism by which we satisfy the "don't lock the
  architecture to one library" requirement.

## 5.2 Data pipeline stages

```
RAW EXCHANGE DATA
      ↓
VALIDATION
      ↓
NORMALIZATION
      ↓
ORDER BOOK RECONSTRUCTION
      ↓
TRADE ALIGNMENT
      ↓
TIMESTAMP VALIDATION
      ↓
HFTBACKTEST-COMPATIBLE FORMAT
      ↓
READY
```

This pipeline is implemented in `backend/data/app/` and is what the Data Quality
panel (`docs/08-secondary-monitor-components.md` §8.10) visualizes and what the
Dataset Selector (`docs/08` §8.8) triggers.

### Stage: Raw exchange data
- Sourced either from (a) upstream `collector/` binaries recording live WS feeds to
  disk (`docs/13-data-management-and-monitoring.md` §13.1), or (b) a downloaded
  historical archive from a supported vendor (Binance historical data dumps, Tardis,
  Databento — reusing upstream's existing utilities per
  `docs/04-hftbacktest-engine-analysis.md` §4.9).
- Stored as-is, untouched, in object storage under
  `datasets/raw/{exchange}/{market}/{symbol}/{date}/...` so validation failures can
  always be diagnosed against the original bytes.

### Stage: Validation
- Structural checks: file readable, expected columns/fields present, non-empty.
- Sequence checks: for L2/L3 feeds, monotonic update IDs / sequence numbers per
  symbol; flags **sequence gaps**.
- Timestamp checks: exchange timestamp vs. local (collection) timestamp sanity
  (reuses/extends `py-hftbacktest`'s `correct_local_timestamp` utility — see
  `docs/04` §4.9 — for detecting and correcting negative/implausible feed latency).
- Duplicate detection: exact-duplicate event rows.
- Output: a `DataQualityReport` with counts and a 🟢/🟡/🔴 status per check (exact
  fields in `docs/15-api-and-data-model-spec.md` §15.5 `DataQualityReport`).
- **A dataset with any 🔴 (Invalid) check may never be silently used for a backtest.**
  The Backtest Configuration screen must block "Run Backtest" and surface the
  specific failing check(s) until resolved or explicitly, individually overridden by
  the user with a logged acknowledgment (audit-logged per
  `docs/14-cross-cutting-systems.md` §14.5).

### Stage: Normalization
- Converts vendor-specific field names/units/tick conventions into our internal
  canonical `Event` schema (mirrors `hftbacktest`'s `Event`/`EXCH_EVENT`/
  `LOCAL_EVENT` structure per `docs/04` §4.2, so the following stage's output maps
  cleanly onto the engine's native ingestion).
- Normalizes tick size and lot size per instrument (sourced from exchange metadata,
  cached in Postgres `instrument_metadata` table, `docs/15` §15.5).

### Stage: Order book reconstruction
- For L2 snapshot+diff feeds: replays diffs onto the last valid snapshot to produce
  a continuous depth history; detects and flags reconstruction breaks (a diff that
  doesn't apply cleanly signals a missed update — this becomes a 🟡/🔴 quality flag
  and a "missing interval," surfaced exactly as described in
  `docs/08-secondary-monitor-components.md` §8.10).
- For L3 (Market-By-Order) feeds: replays individual order add/modify/cancel events.

### Stage: Trade alignment
- Aligns the trade tape timeline with the order-book timeline so replay and
  investigation views can present both consistently at any timestamp (needed for
  `docs/09-analytics-and-investigation-suite.md` §9.10 order-book-imbalance-vs-
  subsequent-trade analysis).

### Stage: Timestamp validation (final pass)
- Confirms strictly increasing timestamps across the fully assembled, aligned
  dataset (a hard requirement of `hftbacktest`'s event loop — see
  `docs/04-hftbacktest-engine-analysis.md` §4.3).

### Stage: HftBacktest-compatible format
- Writes the final `Event` array to the engine's native binary layout (`.npz`/
  custom binary per `docs/04` §4.2's `data.rs`/`NpyDTyped`), plus a Parquet mirror
  of the same data for our own analytics queries that don't want to go through the
  engine (e.g., rendering historical order-book heatmaps directly in the UI without
  running a backtest).

### Stage: Ready
- Dataset becomes selectable in the Dataset Selector; its `DataQualityReport` is
  attached and always visible before a backtest runs (`docs/08` §8.8–§8.10).

## 5.3 Dataset identity and versioning

Every prepared dataset is content-addressed: a hash of (exchange, market, symbol,
date range, source vendor, pipeline version) becomes its `dataset_id`. If any
pipeline stage's logic changes (e.g., a bug fix in normalization), the pipeline
version component changes, producing a new `dataset_id` rather than silently
mutating a previously-used dataset — this is required for experiment
reproducibility (`docs/10-experiment-management-and-ai-research.md` §10.3).

## 5.4 Data types supported (Phase 1 scope vs. later)

| Data type | Phase 1–2 | Later |
|---|---|---|
| Trades | ✅ | |
| L2 order book (snapshot + incremental) | ✅ | |
| Ticker / mark price / funding | ✅ | |
| L3 order book (Market-By-Order) | | ✅ Phase 4 (backtest-only, per engine limitation in `docs/04` §4.10) |
| Liquidation data | | ✅ Phase 4 |
| Other exchange-specific feeds | | Evaluated case by case |

## 5.5 Extended event/fill recording (beyond upstream's `Recorder`)

As established in `docs/04-hftbacktest-engine-analysis.md` §4.6/§4.10, upstream's
built-in `Recorder` is too coarse for this product's investigation features. The
Engine Abstraction Layer adds a **secondary recording stream**, captured during the
same backtest run, containing one entry per **order lifecycle event** (submit,
queue-position-estimate-updated, partial fill, fill, cancel, reject, expire) and one
entry per **strategy decision tick**, each carrying:

```
timestamp_ns, event_type, order_id, side, price, size,
queue_ahead_estimate, fill_probability_estimate,
market_state_snapshot_ref (pointer to book/spread/volatility at that instant),
latency_breakdown { decision_ns, order_creation_ns, exchange_arrival_ns, fill_ns }
```

This is what powers Fill Analysis, Queue Analysis, Latency Analysis, and Adverse
Selection (`docs/09-analytics-and-investigation-suite.md` §9.5, §9.6, §9.8–§9.9). It is
written to Parquet alongside the standard `Recorder` npz output, keyed by
`experiment_id`, and is the concrete engineering task tracked as
`docs/16-implementation-roadmap.md` Phase 2, Block 2.5 — flagged there explicitly as
non-trivial, since it requires hooking into the engine's Local/Exchange processor
boundary (`docs/04` §4.3), not just reading its existing output.

## 5.6 Scaling the backtest workload — CPU parallel workers, not GPU

Per `docs/04-hftbacktest-engine-analysis.md` §4.8, a single backtest's event loop is
sequential and cannot be internally parallelized or GPU-accelerated. The Job Runner
therefore scales by **running many independent backtest processes concurrently**:

- **Single backtest**: one worker process, one CPU core, runs at native Rust speed.
  This is what "run at CPU speed, full throttle" means in practice for this engine —
  there is no faster single-run mode to unlock.
- **Parameter sweeps / robustness perturbations / walk-forward windows /
  multi-strategy comparisons**: each cell/window/strategy is an independent backtest
  submitted as its own job. The Job Runner maintains a worker pool sized to
  available CPU cores (configurable; default = `nproc - 1` to leave headroom for the
  Gateway/OS) and schedules jobs across it. This is what the Multi-Experiment
  Execution view (`docs/08-secondary-monitor-components.md` §8.15 "RUNNING /
  QUEUED / COMPLETE" list) is showing: real concurrent worker utilization, not a
  simulated progress bar.
- **GPU**: not part of the backtest execution path. If/when the AI Research
  Assistant or a future ML-based signal (e.g., a learned fair-value or regime model)
  needs GPU training, that is a separate, clearly-labeled research compute path
  (`backend/ai` or a future `backend/ml`), never advertised to the user as "your
  backtest ran on the GPU," because it did not.
- Horizontal scaling beyond one machine (Phase 5+): the same worker-pool model
  extends to a distributed job queue (e.g., additional worker machines subscribing
  to the same NATS job-dispatch subject), with no change to the single-backtest
  execution model itself.

## 5.7 What "full speed" honestly means, stated for the user

The Backtest Configuration / Progress screens (`docs/08` §8.12–§8.14) must never
imply GPU acceleration of a single run. Acceptable framing (used verbatim as a
guideline for copy in those screens): *"Backtests run at native engine speed on
CPU. Running multiple experiments (sweeps, robustness tests, comparisons)
automatically uses all available CPU cores in parallel."* This is both accurate and
still genuinely fast, since `hftbacktest`'s Rust core is already highly optimized
for this exact workload.
