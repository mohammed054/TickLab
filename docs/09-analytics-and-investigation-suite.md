# 09 — Analytics and Backtest Formulas

This document is the formula reference required by `AGENTS.md` for every financial calculation. The full data and simulator contract is in `docs/09-research-system.md` §9.7; model and reporting metrics are specified in §§9.6–9.8. Do not implement any formula that is not listed here without Planner review.

## 9.1 Simulated entry and exit

Use the venue-specific pool-state reconstruction at simulated order-arrival time. `N` is entry notional before fees. Fees and network costs are charged in USD.

```text
entry_fee_usd = entry_notional_usd * buy_fee_fraction
total_entry_cost_usd = entry_notional_usd + entry_fee_usd + entry_network_fee_usd
gross_exit_usd = venue_reconstructed_exit_proceeds_before_fees
exit_fee_usd = gross_exit_usd * sell_fee_fraction
net_proceeds_usd = gross_exit_usd - exit_fee_usd - exit_network_fee_usd
net_pnl_usd = net_proceeds_usd - total_entry_cost_usd
net_return_pct = 100 * net_pnl_usd / total_entry_cost_usd
```

Do not use candle high/low or a later observation as an executable fill. If pool state cannot be reconstructed for the venue and decision time, status is `not_simulatable`; never silently substitute close price.

For a proven unexitable position, `net_proceeds_usd = 0`, `net_pnl_usd = -total_entry_cost_usd`, and `net_return_pct = -100`. If observation ends before exitability can be decided, mark `censored` rather than imputing an exit or loss.

## 9.2 Portfolio equity and drawdown

For a research portfolio with starting equity `E0` and closed simulated net P&L values `PnL_i`:

```text
equity_t = E0 + sum(PnL_i for trades closed by t)
peak_t = max(E0, max(equity_j for j <= t))
drawdown_pct_t = 100 * (peak_t - equity_t) / peak_t
max_drawdown_pct = max(drawdown_pct_t)
```

Use event/close time order. Do not count open simulated positions as closed P&L; report unrealized mark separately using a timestamped executable estimate and label it `mark_estimate`.

## 9.3 Windowed outcomes

For fixed horizon `h`, use the first eligible executable exit at or after `decision_time + h` under the frozen strategy. If the strategy exit triggers earlier, use that first trigger and store actual holding time. All returned horizon outcomes include entry latency, fees, network costs, and liquidity/exitability status.

## 9.4 Risk and return score

The launch score is the cross-sectional percentile rank of predicted 6-hour net return within the 15-minute first-seen cohort; when fewer than five eligible launches exist, use eligible launches first-seen in the trailing 24 hours. Clamp to `[0,100]`; missing prediction yields null. The score is a rank, not a profit probability.

Risk flags remain evidence fields and model inputs. Do not apply a hidden hand-tuned numeric penalty to the score. Any future score formula change must be versioned and demonstrate validation improvement.

## 9.5 Reporting rules

Every metric includes numerator/denominator, sample size, dataset/model/strategy version, time range, and cost scenario. Undefined metrics are null with a reason. Report gross and net results separately; net results are primary. Do not call the best in-sample variant “best strategy”.
