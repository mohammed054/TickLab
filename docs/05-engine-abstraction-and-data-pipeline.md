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

### Owner-directed first release: Binance USDⓈ-M BTCUSDT trades

The first real-data release imports Binance USDⓈ-M BTCUSDT perpetual aggregate
trade archives and runs a supported strategy through the vendored hftbacktest engine.
This is a trades-only historical dataset: it does **not** contain historical resting
book depth, best bid/ask quotes, or queue position. The product must label the run
`TRADES_ONLY`; it must not infer/fabricate a book, claim observed queue position, or
present an engine fill model as historically validated depth execution. Before
enabling this path, an Executor must verify in vendored hftbacktest source and a
fixture that trade-only events can be used with the selected asset/exchange/queue
models. If not, the backtest must remain blocked until suitable real depth data is
available. Candles alone do not satisfy this trade-event release.

#### Archive import record

For each source archive part, persist these required fields in the dataset manifest:

| Field | Type | Meaning |
|---|---|---|
| `source` | enum/string | `BINANCE_DATA_VISION` or another explicitly named supported source |
| `market` | enum | `BINANCE_USDM_PERPETUAL` or `BINANCE_SPOT`; never infer one from the symbol alone |
| `symbol` | string | `BTCUSDT` |
| `data_type` | enum | `AGG_TRADE` |
| `source_uri` | string | Exact archive URI/path used for retrieval |
| `archive_filename` | string | Original provider filename |
| `archive_sha256` | hex string | SHA-256 of untouched archive bytes |
| `retrieved_at_ns` | int64 | UTC retrieval time |
| `coverage_start_ns` | int64 | Minimum normalized event timestamp, inclusive |
| `coverage_end_ns` | int64 | Maximum normalized event timestamp, inclusive |
| `row_count` | uint64 | Number of accepted aggregate trade events |
| `pipeline_version` | string | Version identifier for parser/normalizer rules |
| `dataset_id` | string | Content identity over instrument, type, source, archive checksum(s), coverage, and pipeline version |
| `normalization_status` | enum/string | `NORMALIZED` for canonical prepared records or `RAW_PROVIDER_SCHEMA` for catalog-only source files |
| `raw_archive_path` | path | Local path to the checksum-verified original archive |
| `raw_csv_path` | path | Local path to the extracted vendor CSV; required for `RAW_PROVIDER_SCHEMA` |
| `normalized_path` | path | Local canonical trade-file path; absent for raw catalog-only records |
| `cataloged_at_ns` | int64 | UTC time a raw local dataset manifest was registered |
| `source_order_status` | enum | `MONOTONIC` or `NON_MONOTONIC` in original provider row order |
| `ordering_regressions` | uint64 | Number of rows whose aggregate ID or timestamp regresses relative to the previous raw row |
| `first_ordering_regression_row` | uint64/null | First 1-based provider row with an ordering regression, or null when monotonic |

#### Owner-requested local Binance Spot catalog

The local Spot aggregate-trade set at `Z:\Binance-BTCUSDT-Spot-AggTrades-2025-2026`
is cataloged separately from USD-M Futures imports. `scripts/import_binance_spot_catalog.py`
accepts `--source-root` (the folder containing `archives/`, `extracted/`, and
`manifest.csv`), `--data-root` (the TickLab data root), and optional `--workers` from
1 through 8 (default 4). It verifies every archive
against its Binance `.CHECKSUM`, validates the archive/CSV date mapping and each
headerless eight-field Spot row, and records exact event count and timestamp coverage.
Spot timestamps are provider microseconds and convert to nanoseconds by multiplying
by 1,000. Price/quantity must be finite and positive, both boolean fields must parse
as true or false, and timestamps must belong to the archive UTC date. ID/time ordering
regressions are counted while preserving provider row order; raw catalog registration
must never silently sort or repair source data. A malformed field or wrong-day timestamp
rejects that archive and reports its source row.

This operation writes immutable metadata under
`{data-root}/registered/{dataset_id}/manifest.json` and points `raw_archive_path` and
`raw_csv_path` at the verified source files. It does not copy data, create a canonical
`trades.csv`, or claim normalization. Such manifests have
`normalization_status="RAW_PROVIDER_SCHEMA"`, `data_fidelity="TRADES_ONLY"`,
`data_capabilities=["TRADES"]`, and false book/quote availability. They may be
inspected in TickLab, but may not be used for dataset preparation or engine runs until
a separately specified canonical Spot normalization and compatible engine adapter
exist. A nonzero `ordering_regressions` value is a visible source-quality warning,
not permission to reorder the source. Keep the original Spot identity
(`market="BINANCE_SPOT"`) throughout; never
reinterpret these archives as USD-M perpetual data.

Preserve original downloaded bytes unchanged under the configured local raw-data
root, outside git. Download/import must be resumable and idempotent by source URI and
checksum. The user chooses UTC start/end dates; retrieval must inspect provider
coverage and report unavailable periods instead of assuming all of 2024–2026 exists.
The aggregate-trade archive is public and requires no trading credentials; the
official [Binance public-data guide](https://github.com/binance/binance-public-data)
documents USD-M futures trades, aggregate trades, archive cadence, and checksum files.
Binance's historical USD-M L2 tick-by-tick feed (`T_DEPTH`) is a separate, access-controlled
historical data service that requires an API key explicitly whitelisted for this
data product; it is not the public `bookDepth` percentage-summary archive. Do not
use `bookDepth` summary rows as exchange events or as an order book. Until approved
T_DEPTH data or another compatible real L2 source is available, the trade archive is
importable and inspectable but cannot be used for an order-fill hftbacktest result.
See Binance's [historical futures order-book data API guide](https://github.com/binance/binance-public-data/tree/master/Futures_Order_Book_Download)
for the access requirements; see hftbacktest's [order-fill model documentation](https://github.com/nkaz001/hftbacktest/blob/master/docs/order_fill.rst)
for the market-depth and queue assumptions behind simulated fills.

#### Canonical aggregate-trade row

The normalized row is immutable and contains:

| Field | Type | Mapping/meaning |
|---|---|---|
| `timestamp_ns` | int64 | Provider trade time converted exactly to UTC nanoseconds |
| `symbol` | string | Canonical `BTCUSDT` |
| `price` | decimal-preserving numeric | Provider price; conversion to engine float occurs only at engine boundary |
| `quantity` | decimal-preserving numeric | Aggregate base quantity |
| `buyer_is_maker` | bool | Provider maker-side flag; preserve as supplied |
| `first_trade_id` | uint64 | Provider first trade ID in aggregate |
| `last_trade_id` | uint64 | Provider last trade ID in aggregate |
| `event_id` | string | Stable source-derived ID, unique within dataset |
| `archive_part` | string | Source filename/partition for traceability |

The parser must preserve source order for audit, then produce a time/ID ordered engine
view. Duplicate archive imports are idempotent. Gaps in trade IDs are reported, not
repaired; the quality report distinguishes provider-defined aggregate ranges from
individual trade IDs so an aggregate range is not falsely reported as missing rows.
Timestamps must be within the requested interval and valid UTC epoch values. Prices
and quantities must be finite and positive. A malformed row rejects the archive
part and reports its exact source row and reason; no partial dataset is marked ready.

#### Fidelity and backtest contract

`data_capabilities` for this release is exactly `["TRADES"]`; `book_depth_available`
and `historical_best_quotes_available` are false. Every experiment stores
`data_fidelity = "TRADES_ONLY"` and the strategy's required capabilities. A strategy
requiring `L1_QUOTES`, `L2_DEPTH`, or `L3_ORDERS` is rejected before job submission.
Trade-only engine compatibility is not presumed: acceptance requires a test showing
that the selected vendored hftbacktest path consumes the real trades and produces an
actual result without synthesized events or book state. If hftbacktest needs depth
for the intended order/fill simulation, mark this path unavailable and continue
historical L2 ingestion as the next engine-compatible route; never use candles as a
silent replacement.

L2 is the next data capability. It requires real initial depth snapshots and ordered
incremental updates with sequence IDs, snapshot/delta continuity checks, resync
behavior, reconstructed-book validation, and aligned real trades. Only then may the
L2 queue-model result be described as depth-based; queue position remains a model
estimate, not historical ground truth. L3 is not in the first or next release.

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
