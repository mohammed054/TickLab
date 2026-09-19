# 04 — HftBacktest Engine Analysis

This document is a source-grounded analysis of
[nkaz001/hftbacktest](https://github.com/nkaz001/hftbacktest), produced by cloning
the repository and reading its actual source, not from general knowledge. Treat this
as the ground truth for what the vendored engine can and cannot do; if a later doc
seems to contradict this one, this one wins (or the discrepancy is a
`NEEDS_PLANNER_REVIEW`).

## 4.1 What it is

A high-frequency-trading **backtesting and live-execution framework**, core written
in **Rust**, with a **Python** package (`py-hftbacktest`, PyO3 bindings) that lets
strategies be written in Python and JIT-compiled via **Numba** for speed, or written
natively in Rust for both backtesting and live trading. It focuses specifically on:

- Full order book reconstruction from Level-2 (Market-By-Price) or Level-3
  (Market-By-Order) feed data.
- Modeling **feed latency** and **order latency** separately and explicitly.
- Modeling **order queue position** for realistic fill simulation (not just
  "if price crossed, assume fill").
- Running the **same strategy code** in backtest and in live trading (Rust-only for
  live today).

## 4.2 Repository layout (as vendored)

```
hftbacktest/                 # Rust core crate
  src/
    backtest/                # backtest engine: asset builders, order/queue/latency/fee models, recorder
      assettype.rs           # AssetType trait (e.g. Linear/Inverse contract math)
      evs.rs                 # event set / event loop scheduling
      order.rs                # order bus between local and exchange processors
      recorder.rs             # per-tick state recording for stats (see §4.6)
      state.rs                 # trading state (position, balance, fees, trade counts)
      models/                 # LatencyModel, QueueModel, L3QueueModel, FeeModel traits + implementations
      proc/                   # Local / Exchange processors; NoPartialFillExchange, PartialFillExchange, L3Local, L3NoPartialFillExchange
      data.rs                  # DataSource, Reader, npy-backed Data<T>
    depth/                    # MarketDepth implementations
      btreemarketdepth.rs      # BTreeMap-backed L2 book (general purpose)
      hashmapmarketdepth.rs    # HashMap-backed L2 book
      roivectormarketdepth.rs  # vector-backed L2 book restricted to a Range of Interest — fastest
      fuse.rs                  # fuses multiple depth-update streams of differing frequency/granularity
    live/                     # live bot runtime: Bot trait implementation wired to a connector via IPC
    types.rs                  # Event, Order, Value, ErrorKind, LiveEvent, etc.
    prelude.rs
hftbacktest-derive/           # proc-macro crate (e.g. NpyDTyped derive for binary record layout)
connector/                    # standalone Rust binary + library: exchange connectivity
  src/
    binancefutures/           # market_data_stream.rs, user_data_stream.rs, rest.rs, ordermanager.rs
    binancespot/              # same shape as binancefutures
    bybit/                    # public_stream.rs, private_stream.rs, trade_stream.rs, rest.rs, ordermanager.rs
    connector.rs              # Connector trait each exchange implements
    main.rs                   # runs one connector process, exposes it over IPC to one or more live bots
collector/                    # data collectors that record raw exchange feeds to disk
  src/{binance,binancefuturescm,binancefuturesum,bybit,hyperliquid}/
py-hftbacktest/               # Python package (PyO3 + pure-Python layer)
  hftbacktest/
    binding.py                # PyO3-exposed bot interface
    order.py, state.py, types.py, intrinsic.py
    data/validation.py        # timestamp correction, feed validation utilities
    stats/{metrics.py, stats.py, utils.py}  # Polars-based performance metrics engine
examples/                     # per-exchange example strategies (spot, usdm, cm, bybit, hyperliquid, mexc)
docs/                         # Sphinx docs source (tutorials, API reference)
```

## 4.3 The backtest execution model

- A backtest is built via `Asset::l2_builder()` or `Asset::l3_builder()`, which
  compose (via generics, resolved at compile time in Rust — see §4.7 for the Python
  implication of this): a `LatencyModel`, an `AssetType`, a `QueueModel` (or
  `L3QueueModel`), a `MarketDepth` implementation, and a `FeeModel`, plus one or more
  `DataSource<Event>` inputs and an `ExchangeKind` (`NoPartialFillExchange` or
  `PartialFillExchange`).
- Internally, each asset is represented as a **Local processor** (the strategy's view
  — what it has submitted, what it believes has happened, subject to feed/order
  latency) and an **Exchange processor** (the ground-truth simulated exchange,
  applying the queue model to determine real fills), connected by an `order_bus`.
  This Local/Exchange split is exactly the "market state vs. strategy observation vs.
  strategy decision vs. order vs. fill" causal chain described in
  `docs/00-vision-and-principles.md` §0.3 — it is the source of truth we render in
  the Fill/Queue/Latency analysis panels (`docs/09` §9.5, §9.8–§9.9).
- The event loop (`evs.rs`) advances strictly by event/time order across all
  configured assets — this is why the simulation is inherently sequential
  (see §4.8 / `docs/03-tech-stack-and-repo-structure.md` §3.2).
- Backtests support **multi-asset, multi-exchange** configurations natively (an
  `Asset` per instrument/venue combination in one `Backtest`).
- **Parallel data loading** is already implemented upstream: the next data file
  loads in the background while the current one is being processed, so I/O does not
  stall the event loop between date-partitioned files.

## 4.4 Pluggable models — what's configurable and what our UI must expose

These map directly to `docs/08-secondary-monitor-components.md` §8.7 "Execution
Model":

| Model | Upstream options found in source | Notes for our UI |
|---|---|---|
| `LatencyModel` | Constant, and a generic model driven by empirical latency data files (feed latency + order latency modeled separately); custom implementations possible via the trait | Expose "fixed," "empirical (from data file)," and "custom distribution" as described in `docs/08` §8.7 — "empirical" maps directly to this |
| `QueueModel` (L2) / `L3QueueModel` (L3) | Multiple queue-position models (probabilistic power-law style position estimation among them); implemented as pluggable traits | Expose named presets ("risk-averse," "probabilistic," "power") plus "custom" — the exact preset list must be finalized against the actual model names in `models/` during Phase 2 implementation (see roadmap Task 2.3.B); do not invent behavior for a preset without checking the source first |
| `FeeModel` | Fee per trading value, fee per trading quantity, fee per trade, and direction-dependent (maker/taker) fee variants | Maps directly to `docs/08` §8.7 maker/taker fee fields |
| `AssetType` | Linear and Inverse contract math (needed for correct P&L/margin on futures) | Exposed indirectly via the "Market" field in Dataset Selector (`docs/08` §8.8) — USDT-margined vs. coin-margined selection must set the correct `AssetType` |
| `ExchangeKind` | `NoPartialFillExchange`, `PartialFillExchange` | Expose as an execution-model toggle: "allow partial fills" |
| `MarketDepth` | `BTreeMarketDepth`, `HashMapMarketDepth`, `ROIVectorMarketDepth` (fastest, restricted to a configured range of interest), plus `fuse.rs` for combining multiple depth-update streams of different granularity/frequency | This is an engine-internal performance choice, not user-facing; default to `ROIVectorMarketDepth` for BTC/USDT given its price range is well-bounded, falling back to `BTreeMarketDepth` for correctness-first / arbitrary-range scenarios. Document the actual default chosen in the Task 2.2 `STATE.md` entry. |

## 4.5 Live trading support

- A live bot uses the **same strategy code** as backtesting (Rust-only for live
  today; the Python/Numba path is backtest/research only per the current upstream
  roadmap, which explicitly lists "Add live trading support" for Python as
  unchecked).
- Live connectivity today: **Binance Futures, Binance Spot, Bybit** (`connector/`
  crate). Each exchange has its own `market_data_stream.rs` (WS book/trade feed),
  `user_data_stream.rs` or `private_stream.rs` (fills/order updates), `rest.rs`
  (order entry/cancel), and `ordermanager.rs` (local order state reconciliation).
- The connector is designed to run as its **own process**, with one or more live
  bots attaching to it. Upstream's own architecture diagram and roadmap describe
  this as IPC-based (referencing `iceoryx2`, a zero-copy shared-memory IPC library)
  specifically so multiple bots can share one exchange connection without each
  bot managing its own WS/REST session. A TCP-based transport for remote
  connections (and eventually the Python live path) is listed upstream as a planned
  but not-yet-shipped item.
- **This is exactly the architecture our low-latency live data design should mirror
  and extend, not replace.** See `docs/06-realtime-live-data-architecture.md` §6.2,
  which is written to be consistent with this upstream design rather than inventing
  a parallel one.
- Upstream roadmap explicitly lists **Level-3 (Market-By-Order) support for the live
  bot** as not yet implemented — only L2 is live-ready today. Our Live mode scope
  (`docs/12-execution-modes-and-risk.md` §12.6) must account for this: L3 strategies
  can be backtested but cannot yet go live via the upstream engine as-is.

## 4.6 The per-tick state record (what our analytics are actually computed from)

The Python `Recorder` (`py-hftbacktest/hftbacktest/recorder.py`) writes one record
per asset per recording interval with exactly these fields:

```
timestamp        # simulated time of the recording
price             # mid price = (best_bid + best_ask) / 2.0 at that instant
position          # current position (from StateValues)
balance           # current balance
fee               # cumulative fee paid
num_trades        # cumulative number of trades (fills)
trading_volume    # cumulative traded quantity
trading_value     # cumulative traded notional
```

This record array (`record_dtype`, saved to `.npz`) is the **actual raw input** to
every metric in `docs/09-analytics-and-investigation-suite.md` — equity curve,
drawdown, Sharpe/Sortino, etc. Any analytics feature that needs a field not in this
list (e.g., per-fill queue-ahead-at-submission, or per-event order-book snapshots for
markout calculation) must be sourced from the **separate, more granular event log**
that the Engine Abstraction Layer is responsible for also capturing during a
backtest run (see `docs/05-engine-abstraction-and-data-pipeline.md` §5.5) — the
built-in `Recorder` alone is not sufficient for the fill-level/markout/adverse-
selection analysis this product requires, and our abstraction layer must extend
recording granularity accordingly rather than assume upstream already provides it.

## 4.7 Existing performance/stats tooling to reuse, not reinvent

`py-hftbacktest/hftbacktest/stats/` already implements a **Polars-based**, pluggable
metrics engine: an abstract `Metric` base class with a `compute(df, context)`
contract, and concrete metrics (e.g. `Ret`, `AnnualRet`, and others in the same
file/module covering the standard performance-metric set). Our Results screen
(`docs/08-secondary-monitor-components.md` §8.16) and analytics suite
(`docs/09-analytics-and-investigation-suite.md`) should **wrap and extend this
metrics engine** rather than reimplement return/Sharpe/Sortino/drawdown math from
scratch — new metrics we need that don't exist upstream (e.g., markout distributions,
queue-ahead-vs-fill-probability) should be implemented as additional `Metric`
subclasses following the same interface, kept in `engine/abstraction/metrics/` or
`backend/experiments/app/metrics/` (finalize placement in Task 2.4, log the decision).

## 4.8 Why this shapes our scaling strategy (see also doc 03 §3.2, doc 05 §5.6)

Because the event loop is strictly sequential per backtest run:

- **A single backtest cannot be parallelized internally across cores or a GPU.**
  Its wall-clock speed is bounded by Rust's per-event processing cost and I/O
  throughput (parallel file loading already helps with the latter).
- **Multiple independent backtests (parameter sweeps, walk-forward windows,
  robustness perturbations, multi-strategy comparison runs) are embarrassingly
  parallel** — this is the correct place to add concurrency, by running N backtest
  processes/workers across N CPU cores.
- GPU acceleration has no direct application inside the simulation loop itself. It
  may have legitimate uses **downstream** of the sim (e.g., training an ML-based
  market-regime classifier or fair-value model over recorded features at scale), but
  that is an analytics/research concern, not a backtest-engine concern, and should
  not be conflated with "making backtests faster."

## 4.9 Data format and preparation tooling already available upstream

`py-hftbacktest/hftbacktest/data/` and the reference docs list existing utilities
for: Binance Futures historical data conversion, Binance historical market data,
order-book snapshot diffing, a data-format migration tool (v1→v2), and integration
utilities for third-party historical data vendors (Tardis, Databento). Our Data
Pipeline (`docs/05-engine-abstraction-and-data-pipeline.md` §5.2–5.4) wraps these
existing utilities as its first-class ingestion sources rather than writing new
parsers for exchanges upstream already supports; the `collector/` crate
(`collector/src/{binance,binancefuturescm,binancefuturesum,bybit,hyperliquid}`) is
similarly the basis for our own live raw-data recording used to build new datasets
going forward (see `docs/13-data-management-and-monitoring.md` §13.1).

## 4.10 Explicit engine limitations to design around, not hide

- No native GPU path (§4.8).
- Live trading is Rust-only; no Python live path yet upstream.
- Live L3 (Market-By-Order) is not yet supported upstream — only L2 depth is
  live-tradeable today.
- The order-fill queue models are **statistical estimates of queue position**, not
  ground truth — our UI must always present queue-ahead/fill-probability figures as
  modeled estimates (label them as such), matching the "honesty about uncertainty"
  principle in `docs/00-vision-and-principles.md` §0.6.
- The built-in `Recorder` is coarse (one row per asset per interval, not per event);
  our abstraction layer must add finer-grained event/fill capture for the
  investigation features this product promises (§4.6 above) — this is real,
  non-trivial engineering work, not a thin wrapper, and is scoped explicitly as its
  own roadmap block (`docs/16-implementation-roadmap.md` Phase 2, Block 2.5).
