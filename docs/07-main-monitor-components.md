# 07 — Main Monitor Components ("Market Command Center")

Location: `frontend/src/app/main-monitor/MainMonitorShell.tsx`, composed from
components under `frontend/src/features/{header,price-chart,order-book,trade-tape,
order-flow,microstructure,market-regime,strategy-monitor,inventory,risk,
execution-monitor,bottom-bar}`.

This monitor must remain fully useful with **no strategy running** — every panel
below has a defined empty/idle state (see `docs/14-cross-cutting-systems.md` §14.7).

## 7.1 Global Header

Component: `features/header/GlobalHeader.tsx`. Always visible, pinned to the top.

Fields (left to right):

```
{SYMBOL}     {LAST_PRICE}     {24H_CHANGE_%}

BID {bid_price}   ASK {ask_price}   SPREAD {spread_abs} ({spread_ticks} TICK[S])

24H HIGH {high}   24H LOW {low}   24H VOL {volume_usd}

{EXCHANGE_NAME} {connection_dot}
MARKET DATA {data_dot}
LATENCY {latency_ms}ms
UTC {HH:MM:SS.mmm}
```

Props:
```ts
interface GlobalHeaderProps {
  symbol: string;
  exchange: string;
  lastPrice: number;
  changePct24h: number;
  bid: number; ask: number; spreadAbs: number; spreadTicks: number;
  high24h: number; low24h: number; volume24hUsd: number;
  exchangeConnected: boolean;
  marketDataConnected: boolean;
  latencyMs: number | null;    // null → render "—" per doc 14 §14.7, never fabricate
  environment: "RESEARCH" | "PAPER" | "LIVE";
}
```
- Connection dots: green (connected/healthy), yellow (degraded/reconnecting), red
  (disconnected) — palette defined in `docs/11-design-system.md` §11.1.
- `changePct24h` colors green/red per sign; magnitude does not change color
  intensity (no "more red the worse it is" gradients — see `docs/11` §11.1 on
  restrained palette).
- The environment badge (`docs/12-execution-modes-and-risk.md` §12.1) renders here
  too, top-right, always visible, never abbreviated or muted.

## 7.2 Central Price/Market Chart

Component: `features/price-chart/PriceChart.tsx`, built on `lightweight-charts` with
a custom overlay layer for strategy quotes/orders/fills (`PriceChartOverlay.tsx`,
Canvas, synced to the chart's visible range via its API).

### 7.2.1 Modes
`ChartMode = "candles" | "line" | "area" | "tick" | "trades" | "footprint" |
"depth" | "orderflow" | "replay"`. Default: `"candles"`. Mode switch is a segmented
control in the chart's top-left corner.

- `footprint` and `orderflow` modes require the finer-grained event data described
  in `docs/05-engine-abstraction-and-data-pipeline.md` §5.5 (or, for live/paper, the
  live normalized event stream, `docs/06` §6.4) — if unavailable for the current
  dataset, the mode is shown but disabled with a tooltip explaining why (see
  `docs/14-cross-cutting-systems.md` §14.7 for the disabled-state pattern).

### 7.2.2 Timeframes
`"tick" | "1s" | "5s" | "15s" | "30s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d" |
custom`. Custom opens a small popover accepting a duration + unit. Timeframe
selection is **local UI state**, not part of the Sync Bus (`docs/02` §2.3.3) —
investigating a trade should not fight the user's current chart framing.

### 7.2.3 Candle hover tooltip
On hovering a candle, show: open, high, low, close, volume, trade count, buy
volume, sell volume, delta (buy − sell volume), spread (avg over the candle),
volatility (stdev of intra-candle returns, method documented in
`docs/09-analytics-and-investigation-suite.md` §9.11).

### 7.2.4 Overlays (toggleable, none on by default except VWAP + strategy quotes
when a strategy is active)
VWAP, moving average (configurable period), EMA (configurable period), volume,
volatility, cumulative volume delta, order-book imbalance, spread, mid-price,
micro-price, fair-value estimate (only shown if the active strategy exposes one via
its `fair_value` output — see `docs/08-secondary-monitor-components.md` §8.6),
strategy quotes, simulated orders, live orders, simulated fills, live fills,
inventory, P&L, latency markers. Overlay visibility is per-user, persisted
(`docs/15-api-and-data-model-spec.md` §15.5 `user_chart_prefs`).

### 7.2.5 Crosshair hover/lock interaction (source of Sync Bus timestamp preview)
- Hovering the chart shows a crosshair and a throttled (≤20Hz) preview publish of
  `timestamp` to the Sync Bus (`docs/02-two-monitor-workspace-spec.md` §2.3.2 item
  4) — this updates linked read-only displays (order book replay position, if in
  replay mode) without navigating the Secondary Monitor away from its current view.
- Clicking commits the crosshair position as the active `timestamp` in the Sync Bus
  (`docs/02` §2.3.2 item 3), which **does** cause the Secondary Monitor to open the
  Event Inspector at that timestamp.
- Pressing `Esc` or clicking elsewhere clears the lock.

### 7.2.6 Jump-to-timestamp / jump-to-trade / jump-to-order / jump-to-fill
Available via: right-click context menu on the chart, the command palette
(`docs/14-cross-cutting-systems.md` §14.2), or programmatically when the Sync Bus
`timestamp`/`selectedTradeId`/`selectedOrderId`/`selectedFillId` changes from the
Secondary Monitor. Jumping animates the chart's visible range to center the target
timestamp rather than snapping instantly, so the user doesn't lose spatial context.

### 7.2.7 Other interactions
Zoom (scroll/pinch), pan (drag), fit-to-data (`F` key, see
`docs/14-cross-cutting-systems.md` §14.6), fullscreen toggle, screenshot (renders
current chart canvas to PNG via `toDataURL`, offered as a download — not routed
through the Export system in `docs/14` §14.10 since it's a one-off visual snapshot,
not a data export), reset (clears zoom/overlay-local state, not global settings).

## 7.3 Order Book Ladder

Component: `features/order-book/OrderBookLadder.tsx` — **canvas/WebGL rendered**,
not a per-row React tree (performance budget: `docs/03-tech-stack-and-repo-structure.md`
§3.6). Positioned to the right of the chart on wide layouts; below the chart on
narrower single-display fallback (`docs/02` §2.6).

Each row shows: price, size, order count (if the data source provides L3/MBO order
counts — otherwise omitted, not zero-filled), cumulative depth, distance from mid
(in ticks and bps), and a horizontal liquidity bar whose width is
`size / maxVisibleSizeInCurrentView` (recomputed per visible depth window, not a
fixed global max, so the bars stay visually meaningful as the book moves).

```ts
interface OrderBookRow {
  priceTick: number;
  size: number;
  orderCount: number | null;
  cumulativeDepth: number;
  distanceFromMidTicks: number;
  distanceFromMidBps: number;
  isStrategyQuote: boolean;   // drives docs/07 §7.14 highlighting
}
```

Mid/spread divider row is visually distinct (per `docs/11-design-system.md` §11.4),
always rendered even at extreme zoom/depth settings.

## 7.4 Order Book Modes

`BookMode = "ladder" | "heatmap" | "depth-profile" | "imbalance" | "microstructure"
| "replay"`.

- **Ladder**: §7.3's default view.
- **Heatmap**: historical liquidity-through-time, rendered as a 2D canvas (x = time,
  y = price level, color intensity = size at that level/time) — data sourced from
  the Parquet mirror of order-book state (`docs/05-engine-abstraction-and-data-pipeline.md`
  §5.2 "HftBacktest-compatible format" stage), not recomputed live from raw events on
  every render.
- **Depth profile**: aggregated cumulative liquidity curve (bid/ask), rendered as a
  filled area chart.
- **Imbalance**: bid-vs-ask visualization (e.g., a horizontal diverging bar,
  bid-volume-in-view vs. ask-volume-in-view), feeding the same imbalance figure
  used in §7.10 and `docs/09-analytics-and-investigation-suite.md` §9.10.
- **Microstructure**: raw event-level update feed (every add/modify/cancel), for
  power users; effectively a live-scrolling table, virtualized per
  `docs/03-tech-stack-and-repo-structure.md` §3.6.
- **Replay**: order book advancing through historical time, driven by the Sync
  Bus's `replay` state (`docs/02` §2.3.1) — this is the mode automatically entered
  per `docs/02` §2.3.2 item 2 when a backtest replay starts.

## 7.5 Order Book Depth Controls

Levels: `5 | 10 | 25 | 50 | 100` (segmented control, top of the ladder panel).
Price aggregation: `0.1 tick | 0.5 tick | 1 tick | 5 ticks | custom`. Aggregation
regroups raw levels into buckets client-side (or requests a re-aggregated feed from
`backend/market` if depth/aggregation combination requires server-side rollup for
performance — implementation decision for Task 3.3, log actual choice in
`STATE.md`).

## 7.6 Live Trade Tape

Component: `features/trade-tape/TradeTape.tsx` — virtualized list, newest at top,
auto-scrolling unless the user has scrolled up (in which case show a "N new
trades ↓" pill rather than yanking their scroll position).

```
{HH:MM:SS.mmm}   {BUY|SELL}   {size} BTC   ${price}
```
Fields: timestamp, side, price, size, notional, aggressor (taker side), trade ID.
Color: green = aggressive buy, red = aggressive sell (per
`docs/11-design-system.md` §11.1). Clicking a row sets `selectedTradeId` on the Sync
Bus (`docs/02` §2.3.1), which is how a user reaches the Secondary Monitor's Trade
Investigation view (`docs/08-secondary-monitor-components.md` §8.20) from a trade
they noticed live.

## 7.7 Trade Tape Filters

Buy only / sell only, min size, max size, and named presets: "Large" ($10K),
"Whale" ($50K), "Block" ($100K), plus a "$1M+" preset and custom threshold input.
Filters are **display-only** — they never drop data from what's recorded, only from
what's rendered, so switching filters never loses history (implementation: filter
applied client-side over a rolling buffer, or as a server-side query param when
requesting historical tape ranges).

## 7.8 Order Flow Panel

Component: `features/order-flow/OrderFlowPanel.tsx`. Compact live readouts, each
with a small sparkline (last N seconds/minutes, user-configurable window):

Buy pressure, sell pressure, delta, cumulative delta, trades/second,
volume/second, average trade size, median trade size, aggressive buy ratio,
aggressive sell ratio. All values computed over the same configurable rolling
window (default 60s), shown next to the window selector so the numbers are never
ambiguous about their timeframe.

## 7.9 Market Microstructure Panel

Component: `features/microstructure/MicrostructurePanel.tsx`. Grouped sub-sections:

- **Spread**: current, in ticks, in bps, rolling average, percentile (vs. a
  trailing lookback window, default 24h, configurable).
- **Liquidity**: top-of-book depth, 5/10/25-level depth, total visible depth.
- **Volatility**: instantaneous (very short window realized vol), 1m, 5m, 15m,
  and a longer realized-vol figure — exact estimator (e.g., close-to-close vs.
  Parkinson/Garman-Klass) must be specified and documented in
  `docs/09-analytics-and-investigation-suite.md` §9.11 before implementation, since
  different estimators materially disagree; do not implement ad hoc.
- **Order flow**: imbalance, delta, trade intensity, cancellation intensity,
  replenishment rate (liquidity added back after being consumed/canceled).

## 7.10 Market Regime Panel

Component: `features/market-regime/MarketRegimePanel.tsx`. Shows a classified label
(`"LOW_VOLATILITY" | "NORMAL_VOLATILITY" | "HIGH_VOLATILITY" | "EXTREME_VOLATILITY"`
combined with a liquidity/trend axis: `"HIGH_LIQUIDITY" | "LOW_LIQUIDITY"`,
`"TREND_LIKE" | "MEAN_REVERTING" | "UNSTABLE"`) plus a confidence percentage.

```
{PRIMARY_LABEL}
Confidence {pct}%
```

**Mandatory framing**: this panel must always visually and textually communicate
that these are **analytical classifications, not predictions or guarantees** (small
"statistical classification" caption under the label, per
`docs/00-vision-and-principles.md` §0.6 item 4). The classification model itself
(the actual thresholds/method) is specified in
`docs/09-analytics-and-investigation-suite.md` §9.15 — this panel is a pure
presentation layer over that computation, never a separate ad hoc implementation.

## 7.11 Strategy Monitor

Component: `features/strategy-monitor/StrategyMonitorPanel.tsx`. Visible whenever a
strategy is attached to the current session (research replay, paper, or live).

```
{STRATEGY_NAME} {status_dot} {STATUS}

Inventory        {inventory_qty} BTC
Inventory Value  ${inventory_value}

Realized P&L     {sign}${realized_pnl}
Unrealized P&L   {sign}${unrealized_pnl}
Fees             -${fees}

NET P&L          {sign}${net_pnl}

Orders           {order_count}
Fills            {fill_count}
Cancelled        {cancelled_count}
Fill Rate        {fill_rate_pct}%

Latency          {latency_ms}ms
```

`STATUS ∈ {RUNNING, PAUSED, STOPPED, ERROR}`. All P&L figures reference the exact
formulas in `docs/09-analytics-and-investigation-suite.md` §9.1/§9.4 — this panel
must not compute its own variant of P&L; it reads the same computed values shown in
the Results screen's live/streaming equivalent.

## 7.12 Strategy Quotes (rendered inside the Order Book, §7.3)

When a strategy has working orders, the ladder highlights the corresponding rows:

```
STRATEGY BID   {price}   {size} BTC   Queue ahead: {queue_ahead_estimate} BTC
STRATEGY ASK   {price}   {size} BTC   Queue ahead: {queue_ahead_estimate} BTC
```

Order lifecycle states, each with a distinct visual treatment (color/border style,
`docs/11-design-system.md` §11.5): `submitted, working, partial_fill, filled,
cancelled, rejected, expired`. `queue_ahead_estimate` is explicitly labeled as an
estimate (tooltip: "modeled queue position, not exchange-confirmed" — ties to the
honesty-about-uncertainty principle and to
`docs/04-hftbacktest-engine-analysis.md` §4.10).

## 7.13 Inventory Panel

Component: `features/inventory/InventoryPanel.tsx`. Current inventory, target
inventory (if the strategy defines one), inventory limit, inventory value,
inventory P&L (P&L attributable specifically to holding the position, per
`docs/09-analytics-and-investigation-suite.md` §9.4's attribution breakdown),
inventory history (sparkline/mini chart), inventory volatility. Periods where
inventory accumulated because of one-sided fills are highlighted (shaded region on
the inventory history sparkline) — computed by detecting runs of same-side fills
without offsetting opposite-side fills, exact detection method finalized alongside
`docs/09` §9.4 during implementation.

## 7.14 Risk Panel

Component: `features/risk/RiskPanel.tsx`. Current exposure, max exposure, daily
P&L, drawdown (current + max), current risk (a composite figure — defined
alongside risk limits configuration in `docs/12-execution-modes-and-risk.md` §12.5,
not invented independently here), daily loss, maximum position, open orders count,
potential execution risk (notional value of all working orders if simultaneously
filled), margin usage (Paper/Live only — Research mode does not track real margin),
liquidation distance (derivatives only, Paper/Live only). Any value breaching a
configured limit (`docs/12` §12.5) renders with the warning treatment defined in
`docs/11-design-system.md` §11.1 (yellow approaching, red breached) — never silently.

## 7.15 Execution / System Monitor

Component: `features/execution-monitor/ExecutionMonitorPanel.tsx`. Feed latency,
decision latency, order latency, exchange response time, round-trip latency,
rejected/cancelled/stale order counts, dropped events, sequence gaps, reconnects,
missing data — each sourced from real measured values per
`docs/06-realtime-live-data-architecture.md` §6.5 (never simulated). Includes a
latency graph (small multi-line time series, last N minutes, `docs/11
-design-system.md` §11.6 for sparkline/small-multiple styling) breaking out
feed/decision/order/exchange latency separately, matching the categories in
`docs/06` §6.5's latency budget table so the live numbers and the documented budget
are directly comparable.

## 7.16 Bottom Bar

Component: `features/bottom-bar/BottomBar.tsx`. Persistent, single-line, compact:

```
POSITION {qty}   REALIZED {±$}   UNREALIZED {±$}   FEES {-$}   NET {±$}
ORDERS {n}   FILLS {n}   LATENCY {ms}ms   DATA {dot}   ENGINE {dot}   RISK {dot}
```

This is a condensed mirror of §7.11/§7.14/§7.15's headline figures for at-a-glance
status when those panels are collapsed or scrolled out of view — it must never
disagree with them (single source of computed values, per
`docs/09-analytics-and-investigation-suite.md`, rendered in two places, not
computed twice).

## 7.17 Layout composition

Default grid (wide landscape reference, CSS grid with named areas in
`MainMonitorShell.tsx`):

```
┌───────────────────────────────── header ──────────────────────────────────┐
┌───────────────────────────────┐ ┌───────────────────┐
│                                 │ │                     │
│           price-chart           │ │     order-book      │
│                                 │ │                     │
└───────────────────────────────┘ └───────────────────┘
┌───────────┬───────────┬───────────┬───────────┬───────────┬─────────────┐
│ trade-tape │ order-flow │ inventory │ strategy   │ risk       │ latency     │
└───────────┴───────────┴───────────┴───────────┴───────────┴─────────────┘
┌───────────────────────────────── bottom-bar ───────────────────────────────┐
```

Panel visibility/order within the lower strip is user-configurable (drag to
reorder, hide/show via a panel menu) but the header/chart+book/bottom-bar
three-row skeleton is fixed — this matches the visual priority ordering in
`docs/00-vision-and-principles.md` and keeps the "LOOK" mental model
(`docs/02-two-monitor-workspace-spec.md` §2.2) consistent across users.

## 7.18 Loading and empty states

- No strategy attached: Strategy Monitor (§7.11), Strategy Quotes (§7.12),
  Inventory (§7.13) show the empty state defined in
  `docs/14-cross-cutting-systems.md` §14.7 ("NO STRATEGY LOADED" +
  `[ CREATE STRATEGY ]` / `[ OPEN EXPERIMENT ]` actions), not zeroed-out panels
  pretending a strategy is running with no activity.
- Order book still loading/reconstructing (large replay jump, or initial live
  connect): show the loading state from `docs/14` §14.8 with the actual event
  count/progress, not an indefinite spinner.

## 7.19 Replay mode on the Main Monitor

When `Sync Bus.replay` is active (`docs/02` §2.3.1), the chart (§7.2, mode
`"replay"`), order book (§7.4, mode `"replay"`), trade tape (§7.6), and Strategy
Monitor (§7.11) all advance from the replay's `EventStream`
(`docs/05-engine-abstraction-and-data-pipeline.md` §5.1) rather than the live market
feed. Playback controls (`⏮ ◀ ▶ ⏸ ⏭`, speed `0.01x`–`1000x`) live on the Secondary
Monitor's Replay tab (`docs/08-secondary-monitor-components.md` §8.17) and drive the
Sync Bus; the Main Monitor never exposes its own separate transport controls, to
avoid two sources of truth for playback state.
