# 08 — Secondary Monitor Components ("Research Lab")

Location: `frontend/src/app/secondary-monitor/SecondaryMonitorShell.tsx`, composed
from components under `frontend/src/features/{strategy-editor,parameters,
dataset-selector,data-quality,backtest-config,backtest-progress,results,analytics,
strategy-comparison,parameter-sweeps,walkforward,robustness,replay,event-inspector,
why-investigation,experiments,research-notes,ai-research,logs}`.

This monitor uses a vertically-stacked layout (narrower/taller reference viewport
than the Main Monitor — see `docs/02-two-monitor-workspace-spec.md` §2.1). It never
hosts the primary live price chart.

## 8.1 Secondary Monitor Header

Component: `features/header/SecondaryHeader.tsx`.

```
RESEARCH LAB

{SYMBOL}
{EXCHANGE_NAME}

STRATEGY: {strategy_name} {status_dot}
DATA: {CONNECTED|DISCONNECTED} {dot}
ENGINE: {READY|BUSY|ERROR} {dot}
```

Below the header, a horizontal tab bar (§8.2).

## 8.2 Tabs

```ts
type SecondaryTabId =
  | "strategy" | "parameters" | "data" | "backtest" | "results"
  | "experiments" | "replay" | "analytics" | "logs" | "ai-research";
```

The active tab is part of the Sync Bus (`docs/02-two-monitor-workspace-spec.md`
§2.3.1 `activeTab.secondaryMonitor`) so a Main Monitor interaction (e.g., clicking a
losing equity point) can programmatically switch tabs (to `"replay"` or a trade
investigation overlay, §8.20) as part of the linked-workspace behavior in
`docs/02` §2.3.2.

## 8.3 Strategy Panel

Component: `features/strategy-editor/StrategyPanel.tsx`. Shown at the top of the
Strategy tab regardless of editor state:

```
{STRATEGY_NAME}
v{version}

{status_dot} {STATUS}

Environment: {RESEARCH|PAPER|LIVE}
```

`STATUS ∈ {DRAFT, TESTING, BACKTESTED, VALIDATED, PAPER, LIVE, PAUSED, STOPPED,
ARCHIVED}`. Status transitions are constrained (e.g., a strategy cannot move
directly from `DRAFT` to `LIVE` — it must pass through `BACKTESTED` and `VALIDATED`
and, per `docs/12-execution-modes-and-risk.md` §12.6, through `PAPER` with a minimum
validated run before `LIVE` is even selectable). The allowed transition graph is
defined in `docs/12` §12.6 and enforced server-side in `backend/experiments`, not
just hidden in the UI.

## 8.4 Strategy Editor

Component: `features/strategy-editor/StrategyEditor.tsx`, built on Monaco Editor
(`docs/03-tech-stack-and-repo-structure.md` §3.1). Supports syntax highlighting,
autocomplete against the strategy SDK's type definitions (generated from the
`SimulatorContract`-facing strategy interface, `docs/05-engine-abstraction-and-data-pipeline.md`
§5.1), line numbers, in-editor search, inline error/warning diagnostics (surfaced
from a `VALIDATE` call to `backend/jobs`, not client-side guessing), and code
navigation (go-to-definition within the strategy file; cross-file navigation is out
of scope for Phase 1–3 since strategies are single-file in that phase — see
`docs/16-implementation-roadmap.md`).

Action buttons, always visible above the editor: `VALIDATE`, `RUN`, `BACKTEST`,
`PAPER`.
- `VALIDATE`: static + lightweight dynamic check (imports resolve, required
  strategy entry points present, parameter schema — §8.6 — matches declared
  defaults). Fast (<2s), synchronous.
- `RUN`: a short, bounded local dry-run against a small fixed sample dataset, purely
  to catch runtime errors before committing to a full backtest job. Not a substitute
  for `BACKTEST`.
- `BACKTEST`: submits a full async job (`docs/01-architecture-overview.md` §1.5),
  switches the active tab to `"backtest"` (§8.12) automatically.
- `PAPER`: only enabled once the strategy's status (§8.3) is at least `VALIDATED`;
  promotes it into the Paper environment per `docs/12-execution-modes-and-risk.md`
  §12.1.

The Planner does **not** require the user to hand-edit code for every parameter
change — parameters exposed in §8.6 are two-way bound to the strategy's declared
parameter schema and can be edited via the Parameters tab without touching the
editor.

## 8.5 Strategy Types (templates)

`StrategyTemplate = "market_making" | "mean_reversion" | "momentum" |
"order_book_imbalance" | "statistical_arbitrage" | "execution" | "arbitrage" |
"custom"`. Selecting a template scaffolds a new strategy file from
`backend/experiments/app/templates/{template_id}.py` (or `.rs` for Rust-native
strategies, relevant once Live mode strategies need to run through the Rust live
path per `docs/04-hftbacktest-engine-analysis.md` §4.5) with the template's default
parameter schema pre-filled. The underlying `SimulatorContract`
(`docs/05-engine-abstraction-and-data-pipeline.md` §5.1) makes no assumption about
strategy "type" — templates are a UI/scaffolding convenience only, never a
constraint enforced by the engine.

## 8.6 Strategy Parameters

Component: `features/parameters/ParametersPanel.tsx`. Renders form controls
(sliders, numeric fields with min/max/step, dropdowns, presets, reset-to-default)
generated from the strategy's declared parameter schema (a JSON schema-like
structure the strategy file exports — exact format finalized in Task 2.6, but must
at minimum carry: key, label, type, min, max, step, default, description, group).

Default grouping, matching common market-making strategies (adapt per template,
§8.5):

```
QUOTE
  Spread             (ticks)
  Order Size         (BTC)
  Requote            (ms)
  Inventory Limit    (BTC)
  Inventory Skew     (0–1)

FILTERS
  Min Spread         (ticks)
  Max Volatility
  Min Liquidity
  Min Expected Edge
```

If the strategy computes and exposes a `fair_value` estimate (an optional, named
output field in its parameter/output schema — not all strategies will have one),
the Main Monitor's chart can render it as the "fair-value estimate" overlay
(`docs/07-main-monitor-components.md` §7.2.4). This panel is where that output field
is declared/labeled, not computed — the computation lives in the strategy code
itself.

Every parameter shows its `description` as inline help text (tooltip or persistent
caption, per `docs/11-design-system.md` §11.7) — a parameter with no description is
a spec gap, not an acceptable shipped state.

## 8.7 Execution Model

Component: `features/backtest-config/ExecutionModelPanel.tsx`. Exposes, grounded
exactly in what `docs/04-hftbacktest-engine-analysis.md` §4.4 confirms the engine
actually supports — do not add a control for something the engine can't do:

```
Maker fee            (%)
Taker fee            (%)
Tick size            (read-only, from instrument metadata)
Lot size             (read-only, from instrument metadata)

Latency model         fixed | empirical (from data file) | custom distribution
Queue model            <finalized preset list — see docs/04 §4.4>
Allow partial fills    toggle  (maps to ExchangeKind: NoPartialFillExchange / PartialFillExchange)

Order types allowed     Limit, Market, IOC, FOK, GTC, Post-only, Reduce-only
                         (checkboxes; strategy code may only submit order types
                         enabled here — enforced by the backtest job, not just
                         hidden in the UI)
```

Every field here is echoed verbatim into the Backtest Confirmation Summary (§8.13)
and into the experiment's stored, immutable configuration
(`docs/10-experiment-management-and-ai-research.md` §10.1) — this panel's values
are never allowed to silently drift from what a completed experiment recorded.

## 8.8 Dataset Selector

Component: `features/dataset-selector/DatasetSelector.tsx`.

```
Exchange     (dropdown, e.g. Binance)
Market       (dropdown, e.g. USDT Futures / COIN-M Futures / Spot)
Symbol       (dropdown, filtered by exchange+market, e.g. BTCUSDT)
Data type    (multi-select: Trades, L2 Order Book, L3 Order Book — see §8.9)
Start date   (date picker)
End date     (date picker)
```

Selecting a range that isn't yet a `Ready` dataset (per
`docs/05-engine-abstraction-and-data-pipeline.md` §5.2's pipeline stages) triggers
an on-demand pipeline run, visualized via §8.11, rather than failing silently or
requiring a separate manual "prepare data" step.

## 8.9 Data Types

Checkboxes/multi-select sourced from `docs/05-engine-abstraction-and-data-pipeline.md`
§5.4's supported-type table: trades, L2 order book (snapshot + incremental),
L3 order book, snapshots, incremental updates, ticker, mark price, funding,
liquidation data. Types not yet supported for the selected exchange/market
combination are shown disabled with a tooltip, never hidden silently (a hidden
option looks like "this exchange doesn't have that data" when the real reason is
"we haven't built the collector/pipeline yet" — these are different facts the user
deserves to see distinctly).

## 8.10 Data Quality Panel

Component: `features/data-quality/DataQualityPanel.tsx`. Renders the
`DataQualityReport` (`docs/05-engine-abstraction-and-data-pipeline.md` §5.2,
`docs/15-api-and-data-model-spec.md` §15.5) for the currently selected dataset:

```
Total events            {n}
Trades                  {n}
Order-book updates      {n}
Snapshots                {n}
Missing intervals        {n}   {🟢|🟡|🔴}
Duplicate events         {n}   {🟢|🟡|🔴}
Sequence gaps             {n}   {🟢|🟡|🔴}
Timestamp range           {start} → {end}
File size                 {size}
Source                    {vendor}
Normalization             {version}
Tick size / Lot size      {values}
```

Per `docs/05` §5.2: **any 🔴 status blocks `BACKTEST` and `PAPER`/`LIVE` promotion**
until resolved or explicitly, individually overridden with a required
justification note that is audit-logged (`docs/14-cross-cutting-systems.md` §14.5).

## 8.11 Raw Data Pipeline Visualization

Component: `features/data-quality/PipelineDiagram.tsx`. A static vertical flow
diagram mirroring `docs/05-engine-abstraction-and-data-pipeline.md` §5.2 exactly
(`RAW EXCHANGE DATA → VALIDATION → NORMALIZATION → ORDER BOOK RECONSTRUCTION →
TRADE ALIGNMENT → TIMESTAMP VALIDATION → HFTBACKTEST FORMAT → READY`), with the
current dataset's actual stage highlighted and a live progress indicator while a
pipeline run is in flight (job-backed, per `docs/01-architecture-overview.md` §1.5
— dataset preparation is itself an async job, not a blocking call).

## 8.12 Backtest Configuration

Component: `features/backtest-config/BacktestConfigPanel.tsx`. Aggregates: selected
dataset (§8.8, with its Data Quality summary, §8.10), date range, initial capital,
exchange, symbol, the full Execution Model (§8.7), risk limits (referencing
`docs/12-execution-modes-and-risk.md` §12.5's Research-mode-applicable subset),
strategy parameters (§8.6), a random seed field (for any stochastic component of the
latency/queue models — required for reproducibility,
`docs/10-experiment-management-and-ai-research.md` §10.3), and an iterations field
(for Monte-Carlo-style repeated runs under randomized latency/queue perturbation,
feeding Robustness Testing, `docs/09-analytics-and-investigation-suite.md` §9.19).

## 8.13 Backtest Run Button & Confirmation Summary

Large, unmistakable primary action: **`▶ RUN BACKTEST`**. Before submitting the job,
show a confirmation summary (a modal or inline expandable panel, not a silent
submit):

```
{SYMBOL} {MARKET}
{start_date} → {end_date}

Events:     {estimated_event_count}
Capital:    ${initial_capital}
Maker:      {maker_fee}%
Taker:      {taker_fee}%
Latency:    {latency_summary}
Queue:      {queue_model_summary}
```

This is the same information as §8.7/§8.12, deliberately re-surfaced right before
commit — matching the master requirement that backtest assumptions are **never
hidden** (also see `docs/10-experiment-management-and-ai-research.md` §10.1
"Backtest Transparency").

## 8.14 Backtest Progress

Component: `features/backtest-progress/BacktestProgressPanel.tsx`. Streams from the
job's WebSocket progress topic (`docs/01-architecture-overview.md` §1.5,
`docs/15-api-and-data-model-spec.md` §15.3):

```
BACKTEST RUNNING
{progress_bar} {pct}%

Events:        {processed} / {total}
Events/sec:    {rate}
Orders:        {order_count}
Fills:         {fill_count}
Simulated time: {sim_clock}
Elapsed:        {wall_clock_elapsed}
```

Must update at least every 500ms per the performance budget
(`docs/03-tech-stack-and-repo-structure.md` §3.6) and must **never** block
navigation to any other tab while running — the job continues server-side
regardless of which tab is focused; re-opening `"backtest"` simply re-subscribes to
the same job's progress topic.

## 8.15 Multi-Experiment Execution

Component: `features/backtest-progress/MultiExperimentList.tsx`. Shows every
currently queued/running/recently-completed job as a compact list:

```
{strategy_version}    RUNNING
{strategy_version}    QUEUED
{strategy_version}    RUNNING
{strategy_version}    COMPLETE
```

Backed by the real worker-pool state described in
`docs/05-engine-abstraction-and-data-pipeline.md` §5.6 — `RUNNING` entries reflect
actual CPU worker occupancy, not a simulated queue display. Clicking a `COMPLETE`
entry opens its Results (§8.16); clicking a `RUNNING` entry opens its live progress
(§8.14).

## 8.16 Results Screen

Component: `features/results/ResultsScreen.tsx`. Headline block:

```
INITIAL CAPITAL     ${initial_capital}
FINAL CAPITAL       ${final_capital}

NET P&L             {±}${net_pnl}
RETURN              {±}{return_pct}%

MAX DRAWDOWN        -{max_drawdown_pct}%
SHARPE              {sharpe}
SORTINO             {sortino}

TRADES              {trade_count}
FILL RATE           {fill_rate_pct}%

FEES                ${fees}
SLIPPAGE            ${slippage}
```

Every figure here is computed by the metrics engine described in
`docs/04-hftbacktest-engine-analysis.md` §4.7 and defined precisely in
`docs/09-analytics-and-investigation-suite.md` §9.1–§9.2 — **this screen renders
numbers, it does not compute them**, and it is explicitly not allowed to present
this headline block as a final verdict: it always sits above the Equity Curve
(§9.2), Drawdown (§9.3), P&L Attribution (§9.4), and Trade Analysis (§9.5) views,
reachable via sub-tabs of `"analytics"` (§8.25), never gated behind an extra click
that makes the deeper story feel optional.

## 8.17 Replay Controls (transport)

Component: `features/replay/ReplayTransport.tsx`, on the `"replay"` tab.

```
⏮  ◀  ▶  ⏸  ⏭

0.01x  0.1x  0.5x  1x  5x  10x  100x  1000x
```

Drives `Sync Bus.replay` (`docs/02-two-monitor-workspace-spec.md` §2.3.1), which is
what makes the Main Monitor's chart/order-book/tape (`docs/07-main-monitor-components.md`
§7.19) advance. This is the **only** place transport controls exist — the Main
Monitor never duplicates them (`docs/02` §2.3.3).

## 8.18 Event-by-Event Replay

Component: `features/replay/EventStepper.tsx`. Steps through individual order
additions, modifications, cancellations, trades, snapshots, strategy decisions,
order submissions, and fills — one at a time — using controls: `Previous Event`,
`Next Event`, `Next Trade`, `Next Strategy Action`. Backed by the same
`EventStream` (`docs/05-engine-abstraction-and-data-pipeline.md` §5.1/§5.5) used by
continuous replay; stepping simply pauses the transport and advances by exactly one
qualifying event per press.

## 8.19 Synchronized Replay

Not a separate component — this section documents the required behavior: during any
replay (continuous or stepped), **both monitors update from the same timestamp**.
Main shows price/order book/trades/depth/strategy orders (`docs/07` §7.19);
Secondary shows strategy decision/order/latency/queue/event log/P&L (§8.21). This is
the Sync Bus contract (`docs/02` §2.3) applied specifically to the replay use case —
there is no independent "replay sync" mechanism to build; it is the same mechanism
used everywhere else in the product.

## 8.20 Trade Investigation View

Component: `features/why-investigation/TradeInvestigationPanel.tsx`. Opened
automatically when `selectedTradeId` or a losing equity-curve region is set on the
Sync Bus (`docs/02` §2.3.2 items 1 and, by extension, any trade-tape click on Main —
`docs/07-main-monitor-components.md` §7.6). Shows, for the trade/fill in question:
decision context, latency breakdown, queue-ahead estimate at submission, the fill
itself, markout (§9.6), fees, slippage (§9.7), adverse selection (§9.6), and its
contribution to P&L attribution (§9.4) — i.e., this view is a **pre-filtered,
single-trade lens** over the same analytics computations in doc 09, not a
separately computed summary.

## 8.21 Event Inspector

Component: `features/event-inspector/EventInspector.tsx`. Opened when a timestamp
is committed on the Sync Bus from Main (`docs/02` §2.3.2 item 3). Shows, for the
event at that exact timestamp: type, price, size, side, order ID, sequence number,
full market state snapshot, full strategy state snapshot, latency, queue estimate,
and a scrollable window of preceding/following events for context (virtualized per
`docs/03-tech-stack-and-repo-structure.md` §3.6). Includes a `[ view raw event ]`
action opening the Raw Event Viewer (`docs/13-data-management-and-monitoring.md`
§13.4) for that specific event.

## 8.22 "Why?" Investigation

Component: `features/why-investigation/WhyPanel.tsx`. A structured entry point,
available from the Results screen (§8.16), Trade Investigation (§8.20), and the
Strategy Monitor (`docs/07` §7.11), offering framed questions such as "Why did the
strategy lose here?", "Why didn't this order fill?", "Why did inventory increase?",
"Why did fill rate collapse?", "Why did latency spike?" Selecting a question
navigates the workspace (via the Sync Bus) directly to the evidence that answers
it — e.g., "Why didn't this order fill?" jumps to Queue Analysis (§9.7) filtered to
that order, not to a canned text explanation. The full investigation methodology
(which evidence answers which question) is specified in
`docs/09-analytics-and-investigation-suite.md` §9.14; this component is the
navigation shell over that methodology, and its question list must not diverge from
what's actually implemented there.

## 8.23 Experiments Tab

Component: `features/experiments/ExperimentsTab.tsx`. Renders the Experiment Tree
UI (branching, duplication, open/duplicate/compare/reproduce/export actions) and
Strategy Comparison (multi-select two or more experiments). The tree data model,
versioning, and reproduction mechanics are specified in
`docs/10-experiment-management-and-ai-research.md`; this tab is the UI shell over
that model. Parameter Sweeps (heatmaps/surfaces), Walk-Forward/Out-of-Sample setup,
and Robustness Testing configuration also live here as sub-views, with their
methodology specified in `docs/09-analytics-and-investigation-suite.md` §9.17–§9.19.

## 8.24 Research Notes

Component: `features/research-notes/NotesPanel.tsx`. A note can attach to: a
strategy, an experiment, a specific timestamp, a specific trade, a specific fill, or
a chart view (captured as a reference, not a screenshot). Notes are plain text with
light markdown support, timestamped, attributed to the authoring agent/user (which
matters when both AI-assisted and human notes coexist — see
`docs/10-experiment-management-and-ai-research.md` §10.4).

## 8.25 Analytics Tab

Component: `features/analytics/AnalyticsTab.tsx`. A tabbed/sectioned shell hosting:
Equity Curve, Drawdown, P&L Attribution, Trade Analysis, Fill Analysis, Adverse
Selection, Slippage Analysis, Queue Analysis, Latency Analysis, Order-Book-Imbalance
Analysis, Volatility Analysis, Liquidity Analysis, Time Analysis, and Strategy
Comparison — **all defined in detail in
`docs/09-analytics-and-investigation-suite.md`**. This doc does not redefine those
computations; it only specifies that they must be reachable as sub-views of this one
tab, sharing one dataset/experiment selector at the top of the tab so switching
between them never requires re-selecting context.

## 8.26 Logs Tab

Component: `features/logs/LogsTab.tsx`. Structured, filterable, virtualized log
viewer. Categories and levels defined in `docs/14-cross-cutting-systems.md` §14.4.
Supports jumping from a log line's timestamp into the Event Inspector (§8.21) via
the same Sync Bus mechanism as every other timestamp-bearing view.

## 8.27 AI Research Tab

Component: `features/ai-research/AiResearchTab.tsx`. Chat-style interface plus a
persistent "supporting evidence" side panel (never a bare text answer with no
evidence — see `docs/10-experiment-management-and-ai-research.md` §10.5 for the
mandatory evidence-citation behavior and the hard constraint that this assistant can
only ever *propose*, never *create or run*, an experiment without an explicit user
click on a `[ CREATE EXPERIMENT ]` action rendered inline in its responses).
