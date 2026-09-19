# 09 — Analytics and Investigation Suite

This is the specification of **what every number means and how it is computed**.
UI panels in `docs/08-secondary-monitor-components.md` §8.16 (Results) and §8.25
(Analytics tab) render these computations; they do not define them independently.
Any Executor implementing a metric must implement it as specified here, extending
the `Metric` engine described in `docs/04-hftbacktest-engine-analysis.md` §4.7,
placed in `backend/experiments/app/metrics/` (one module per section below,
suggested naming matches section titles).

All computations operate over the two data sources established in
`docs/04-hftbacktest-engine-analysis.md` §4.6 and
`docs/05-engine-abstraction-and-data-pipeline.md` §5.5: the coarse per-interval
`Recorder` stream (`timestamp, price, position, balance, fee, num_trades,
trading_volume, trading_value`) and the fine-grained order/fill event stream
(`timestamp_ns, event_type, order_id, side, price, size, queue_ahead_estimate,
fill_probability_estimate, market_state_snapshot_ref, latency_breakdown`). Each
section below states which source it uses.

## 9.1 Headline metrics (Results screen, `docs/08` §8.16)

Source: `Recorder` stream, using the existing upstream `Metric` classes
(`docs/04` §4.7) wherever they already implement the needed figure.

- **Return** — `(equity[-1] - fee[-1]) - (equity[0] - fee[0])`, matching upstream's
  `Ret` metric exactly (`equity_wo_fee - fee`, per
  `docs/04-hftbacktest-engine-analysis.md` §4.7's source reading). Do not
  reimplement; call the upstream metric.
- **Return %** — Return divided by `initial_capital` (the `book_size` parameter
  upstream's `Ret`/`AnnualRet` already support).
- **Max Drawdown** — see §9.3.
- **Sharpe** / **Sortino** — computed over the equity return series at the
  `Recorder`'s sampling interval, annualized per upstream's `AnnualRet`-style
  `trading_days_per_year` convention; exact risk-free-rate assumption (0% unless
  configured) must be stated next to the figure, not left implicit.
- **Trades** — `num_trades[-1]` (cumulative fill count).
- **Fill Rate** — `fills / orders_submitted` (orders_submitted comes from the
  fine-grained event stream's `submit` event count, not the `Recorder`).
- **Fees** — `fee[-1]`.
- **Slippage** — see §9.7 (aggregated to a single headline figure here; the full
  breakdown lives in its own view).

## 9.2 Equity Curve

Source: `Recorder` stream. Modes: absolute P&L, percentage return, log scale,
realized-only, unrealized-only, net, gross (gross = net + fees, i.e., P&L before fee
deduction). Hovering any point shows: timestamp, and the corresponding market state
at that instant (mid price, spread, volatility — pulled via
`market_state_snapshot_ref` from the nearest fine-grained event, or, if none exists
at that exact instant, the nearest `Recorder` sample's derived price). Clicking a
point sets the Sync Bus `timestamp` (`docs/02-two-monitor-workspace-spec.md` §2.3.2
item 1), which is the mechanism behind "click a losing section, both monitors jump
there."

## 9.3 Drawdown

```
drawdown(t) = (equity(t) - running_max(equity, 0..t)) / running_max(equity, 0..t)
max_drawdown = min(drawdown(t)) over the full series
drawdown_duration = t_recovery - t_peak, where t_recovery is the first t after
                    t_peak at which equity(t) >= equity(t_peak); null if never recovered
                    within the backtest window
```

Displayed: current drawdown, max drawdown, drawdown duration, recovery time, peak
value+timestamp, trough value+timestamp. **Clicking a drawdown region sets the Sync
Bus `timestamp` to the trough** and, if the drawdown region maps to a bounded time
range, also sets `replay.rangeStart`/`replay.rangeEnd` to that region so the user can
immediately replay exactly that window (`docs/08` §8.17).

## 9.4 P&L Attribution

Source: fine-grained event stream + `Recorder` stream, reconciled. Categories,
computed additively so they sum to Net P&L exactly (a reconciliation check, not just
a display convention — the sum must be validated in a unit test with a known
hand-computed example per `AGENTS.md` §5.7):

```
Gross Trading P&L     = sum of (fill_price - reference_price) * signed_size
                         across all fills, where reference_price is the mid price
                         at the moment the corresponding order was SUBMITTED
                         (isolates the raw trading edge from adverse selection,
                         which is captured separately below)
Fees                   = sum of per-fill fee amounts (from FeeModel, docs/04 §4.4)
Slippage               = sum of (fill_price - expected_price) * signed_size, where
                         expected_price is the price implied by the order's limit
                         price and side (see §9.7 for the full definition)
Adverse Selection       = sum of post-fill markout at a fixed horizon (see §9.6),
                         representing P&L given away to informed order flow after
                         the fill
Inventory P&L           = mark-to-market P&L attributable to holding a non-zero
                         position between fills: sum over time of
                         position(t) * (mid_price(t+dt) - mid_price(t))
Execution Loss          = Gross Trading P&L minus the sum of the categories above
                         that are directly attributable to execution mechanics
                         (this is the reconciling residual, not an independently
                         computed figure — if this category is large and
                         unexplained, that is itself a signal worth surfacing,
                         not something to hide by padding another category)
Other                   = any remaining reconciliation residual after all of the
                         above; must be near-zero in a correctly implemented
                         system — a persistently non-trivial "Other" is a bug
                         signal, and the UI must visually flag it as such
                         (docs/11-design-system.md §11.1 warning treatment)
```

Every category is clickable, filtering the Fill Analysis (§9.5) and Trade
Investigation (`docs/08` §8.20) views to the fills that contributed to it.

## 9.5 Trade / Fill Analysis

**Trade Analysis** (aggregate, source: fine-grained event stream): total trades,
winning trades, losing trades (a trade's win/loss classification is determined by
its markout at the configured investigation horizon, §9.6, not by raw fill price
vs. entry — this must be stated explicitly in the UI since it's a specific,
non-obvious methodological choice), average winner, average loser, largest winner,
largest loser, holding time (time between an opening and a fully-offsetting closing
fill for the same inventory lot, using FIFO lot matching), fill price, expected
price, realized price, slippage (per fill, §9.7), post-fill movement (§9.6).

**Fill Analysis** (per fill, source: fine-grained event stream): for any selected
fill, show timestamp, side, price, size, queue ahead (at submission), fill
probability (modeled estimate at submission — see
`docs/04-hftbacktest-engine-analysis.md` §4.10's honesty requirement), latency,
spread (at fill time), volatility (at fill time), order-book imbalance (at fill
time), followed by future price movement at `+1ms, +5ms, +10ms, +50ms, +100ms,
+1sec, +5sec` after the fill — this is the raw markout ladder that §9.6 aggregates.

## 9.6 Adverse Selection

For a given fill, markout at horizon `h` is:

```
markout(h) = signed_size * (mid_price(fill_time + h) - fill_price)
```

(positive `signed_size` for buys, negative for sells — so a positive markout means
the fill was favorable in hindsight, negative means adverse selection occurred).

Dedicated view shows, for a selected fill or aggregated across a filter (e.g., all
fills in a volatility bucket, §9.9):

```
{BUY|SELL} FILLED
${fill_price}

+{h1}    ${mid_price at fill_time + h1}
+{h2}    ${mid_price at fill_time + h2}
...
```

**Aggregated markout distributions**: a histogram/violin of `markout(h)` across many
fills at a fixed `h` (default `h = 100ms`, user-adjustable), to answer "on average,
does this strategy get picked off after fills, and how badly?" — this is exactly
what feeds the P&L Attribution's "Adverse Selection" category (§9.4): that category
equals the sum of `markout(h_fixed)` (negated, since markout is defined as
favorable-positive but the P&L category represents a cost) across all fills, using
one single, consistently-applied `h_fixed` so the two views never disagree.

## 9.7 Slippage Analysis

```
expected_price = the order's limit price at submission (for limit orders) or the
                 best available price at submission (for market/IOC/FOK orders)
slippage        = (fill_price - expected_price) * signed_size    [in quote currency]
slippage_ticks  = slippage_price_diff / tick_size
slippage_bps    = (fill_price - expected_price) / expected_price * 10_000
```

Breakdowns available by: volatility bucket (§9.9), liquidity bucket (§9.10), order
size bucket (quantiles, configurable bucket count, default quartiles), time of day
(§9.11), market regime (`docs/07-main-monitor-components.md` §7.10's classification,
joined by timestamp), and exchange (multi-exchange backtests only).

## 9.8 Queue Analysis

Source: fine-grained event stream. For a selected order: submission time, queue
ahead at submission (modeled estimate), a timeline of trades arriving ahead of the
order in the book (which erode queue-ahead over time — this timeline is what lets
the UI render "queue progression"), the point of partial fill (if any), full fill or
cancellation, with timestamps for each.

**Queue Ahead vs. Fill Probability**: a scatter/binned-line chart plotting queue-
ahead-at-submission (x) against realized fill rate (y) across many historical
orders, i.e., an empirical calibration check of the modeled `fill_probability_estimate`
against what actually happened — this is the mechanism by which a user can judge
whether the configured Queue Model (`docs/08-secondary-monitor-components.md` §8.7)
is well-calibrated for this instrument, not just trust it blindly.

## 9.9 Latency Analysis

Source: fine-grained event stream's `latency_breakdown` field
(`docs/05-engine-abstraction-and-data-pipeline.md` §5.5), broken into: decision
latency, order-creation latency, exchange-arrival latency, fill latency, and total
latency. Visualizations: a latency distribution (histogram, with p50/p90/p99
annotated), latency over time (line chart, to catch degradation during a session),
and, where the dataset/live source distinguishes them, a breakdown of network vs.
strategy vs. exchange-side latency components — these three must sum to (or clearly
account for the gap to) the total latency figure; an unreconciled gap is flagged
the same way P&L Attribution's "Other" residual is flagged (§9.4).

## 9.10 Order-Book Imbalance Analysis

```
imbalance(t) = (bid_volume(t) - ask_volume(t)) / (bid_volume(t) + ask_volume(t))
```
computed over a configurable depth window (default: top 10 levels, matching the
Order Book Depth Controls default, `docs/07-main-monitor-components.md` §7.5).
Analysis view plots `imbalance(t)` against subsequent price movement at fixed
horizons (`10ms, 100ms, 1sec, 5sec`), as a binned average or scatter with a fitted
trend line, to show the empirical (not assumed) relationship strength.

**Mandatory framing, restated from `docs/00-vision-and-principles.md` §0.6 item 4**:
this view must display the statistical relationship (e.g., correlation or binned
average with confidence bands) and must **not** present order-book imbalance as a
predictive signal with implied certainty — a caption stating this is a historical
statistical association, not a trading recommendation, is required directly on this
view, not buried in a help doc.

## 9.11 Volatility Analysis

Volatility estimator (must be picked and documented before implementation, not
decided ad hoc per feature): default to **realized volatility from log returns at
the `Recorder`'s sampling frequency**, annualized; expose the estimator choice
(close-to-close vs. a range-based estimator such as Parkinson) as a setting on this
view, applied consistently everywhere "volatility" is shown elsewhere in the product
(`docs/07-main-monitor-components.md` §7.9's Microstructure Panel, §7.10's Regime
Panel) so the same word never means two different computations in two different
places. Strategy performance is bucketed into `Low / Normal / High / Extreme`
volatility regimes (thresholds: percentile-based over the dataset's own volatility
distribution — e.g., quartiles — rather than hardcoded absolute thresholds, so the
buckets remain meaningful across different market conditions/instruments). For each
bucket: P&L, fill rate, spread captured (average realized spread on filled orders),
adverse selection (§9.6), drawdown.

## 9.12 Liquidity Analysis

Breakdown by: depth (top-of-book vs. 5/10/25-level, matching
`docs/07-main-monitor-components.md` §7.9), spread, order-book density (orders per
price level, L3 datasets only), trade volume, trade frequency. Same bucketing
approach as §9.11 (percentile-based, not hardcoded).

## 9.13 Time Analysis

P&L by hour, P&L by minute-of-hour, fill rate by hour, spread by hour, volatility by
hour, adverse selection by hour — all bucketed by hour **in the exchange's local
time zone by default** (configurable to UTC or user local time), since intraday
patterns in crypto markets often correlate with specific regional trading-session
overlaps; defaulting to UTC-only would obscure that.

## 9.14 The "Why?" Investigation Methodology

This is the evidence-routing table that `docs/08-secondary-monitor-components.md`
§8.22's `WhyPanel` navigates by. Each question maps to a specific, pre-filtered
view — never a freeform text explanation generated without a concrete evidence
trail:

| Question | Routes to |
|---|---|
| Why did the strategy lose (in this period)? | P&L Attribution (§9.4) filtered to the period, sorted by magnitude of negative contribution |
| Why didn't this order fill? | Queue Analysis (§9.8) for that specific order, showing queue-ahead progression and what consumed the queue ahead of it |
| Why did inventory increase? | Inventory Panel history (`docs/07-main-monitor-components.md` §7.13) for the period, cross-referenced with Fill Analysis (§9.5) showing the one-sided fill run |
| Why did fill rate collapse? | Queue Analysis (§9.8) aggregate view for the period, cross-referenced with Liquidity Analysis (§9.12) to check whether a liquidity regime change is the cause |
| Why did latency spike? | Latency Analysis (§9.9) for the period, cross-referenced with the Execution/System Monitor's connection/reconnect log (`docs/07` §7.15) |
| Why did P&L drop (at this specific instant)? | Trade Investigation (`docs/08` §8.20) for the nearest fill(s) to that instant, showing markout/adverse-selection (§9.6) |

If the AI Research Assistant (`docs/10-experiment-management-and-ai-research.md`
§10.5) is asked one of these questions in its own chat interface, it must use these
same underlying queries as its evidence source rather than generating an answer from
general reasoning alone — this is enforced by giving the assistant tool access to
these exact backend query endpoints (`docs/15-api-and-data-model-spec.md` §15.2),
not by prompting it to "be accurate."

## 9.15 Market Regime Classification Method

Backs the Market Regime Panel (`docs/07-main-monitor-components.md` §7.10). The
classification is a simple, explainable, two-axis method — deliberately not a
black-box model for Phase 1–3, so its output can always be explained in one
sentence:

```
Volatility axis:  bucketed exactly as in §9.11 (percentile-based over a trailing
                  lookback window, default 24h) → LOW_VOLATILITY | NORMAL_VOLATILITY
                  | HIGH_VOLATILITY | EXTREME_VOLATILITY

Liquidity axis:    bucketed exactly as in §9.12 (percentile-based, total visible
                  depth) → HIGH_LIQUIDITY | LOW_LIQUIDITY

Trend axis:        classified via a simple trend-strength measure (e.g., the
                  absolute value of a short-window return normalized by realized
                  volatility over the same window — a standardized-move measure)
                  against fixed percentile thresholds (also trailing-window
                  relative, not absolute) → TREND_LIKE | MEAN_REVERTING | UNSTABLE
                  (UNSTABLE = trend axis is ambiguous, e.g. sign has flipped
                  repeatedly within the window)

Confidence:        the percentile distance of the current window's statistic from
                  the nearest bucket boundary, normalized to 0–100% (closer to a
                  boundary → lower confidence) — a simple, transparent confidence
                  measure, not a model-derived probability, and must be labeled as
                  such
```

This method may be replaced later by a learned classifier (an appropriate use of
the offline/GPU-eligible research compute path noted in
`docs/05-engine-abstraction-and-data-pipeline.md` §5.6), but only as an explicit,
versioned upgrade — never silently swapped in without updating this doc and the
"statistical classification" disclosure required by
`docs/07-main-monitor-components.md` §7.10.

## 9.16 Strategy Comparison Philosophy

When comparing two or more experiments (`docs/08-secondary-monitor-components.md`
§8.23), the comparison view shows, side by side: equity curves overlaid on one
chart, drawdown, inventory history, P&L attribution breakdowns, fill counts, fees,
slippage, and latency distributions. **No automatic "winner" badge or ranking score
is computed or displayed.** This is a deliberate product rule, not an oversight: a
strategy with a higher raw return but far worse tail risk, or tested over a shorter/
easier period, is not simply "better," and a single ranking number would hide
exactly the kind of nuance this entire product exists to surface (see
`docs/00-vision-and-principles.md` §0.3). The comparison view's job is to make the
relevant differences visible and clickable into their own investigation views
(§9.2–§9.13), not to declare an outcome.

## 9.17 Parameter Sweeps

A sweep defines one or more parameters with a range (e.g., `Spread: 2 → 10 ticks`,
`Order Size: 0.001 → 0.1 BTC`, `Inventory Skew: 0 → 1`, `Latency: 5 → 100ms`) and a
step count or explicit value list per parameter. Each combination is submitted as an
independent backtest job (`docs/05-engine-abstraction-and-data-pipeline.md` §5.6 —
this is exactly the embarrassingly-parallel case that justifies the CPU worker-pool
design). Results render as:

- A **heatmap** for exactly two swept parameters (axes = the two parameters, color =
  the selected output metric — P&L, drawdown, fill rate, or a risk figure, user-
  selectable).
- A **P&L surface** (3D or a slider-through-2D-slices view) when more than two
  parameters are swept.
- A **sensitivity view**: for each parameter independently, the output metric's
  variation holding others at their default/best value — this is what makes
  "parameter sensitivity obvious" per the product requirement, distinct from the
  raw heatmap which shows joint effects.

## 9.18 Walk-Forward and Out-of-Sample Testing

Three named, non-overlapping (by default; overlap must be an explicit, visually
flagged choice) date ranges are configured per walk-forward run:

```
TRAIN        — data used to develop/fit the strategy's parameters
VALIDATION   — data used to select among candidate parameter sets, not seen during
              fitting
TEST         — data used exactly once, after TRAIN/VALIDATION are finalized, to
              report the number the user actually trusts
```

The UI must always visually distinguish which range produced which result (a
persistent label — "TRAIN," "VALIDATION," "TEST" — on every chart/number derived
from a walk-forward run) so a user cannot accidentally present or act on an
in-sample number as if it were out-of-sample. A full walk-forward run chains this
pattern across multiple rolling windows (e.g., train on months 1–3, validate on
month 4, test on month 5; then roll forward one month and repeat), with per-window
and aggregated-across-windows results both available.

## 9.19 Robustness Testing

Runs the same strategy/dataset combination repeatedly under controlled perturbation
of one factor at a time, then shows the **distribution** of outcomes rather than a
single number:

- **Parameter perturbation**: small random jitter around the configured parameter
  values (e.g., ±10%), N repetitions.
- **Latency perturbation**: resampling from a wider or shifted latency distribution
  than the point-estimate used in the base backtest.
- **Fee perturbation**: testing sensitivity to fee-schedule assumptions.
- **Fill uncertainty**: resampling queue-model randomness across repetitions (using
  the `iterations`/random-seed mechanism from
  `docs/08-secondary-monitor-components.md` §8.12).
- **Trade-order randomization**: for datasets/venues where simultaneous events'
  relative order isn't fully determined by the data, testing sensitivity to
  tie-breaking order.
- **Market-condition variation**: rerunning across multiple historical periods
  chosen to span different volatility/liquidity regimes (§9.15), not just the one
  period the strategy was designed against.

Output: a distribution (histogram/box-plot) of the chosen output metric across all
repetitions, with the base-case (unperturbed) result marked distinctly, so the user
can see how much the reported performance depends on assumptions that could easily
have been slightly different.
