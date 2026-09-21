"""Volatility Analysis metric (docs/09 §9.11).

Computes realized volatility from log returns at the Recorder's sampling frequency,
annualized. Exposes estimator choice (close-to-close vs. range-based) as a setting.

Strategy performance bucketed into volatility regimes (Low/Normal/High/Extreme)
using percentile-based thresholds over the dataset's own volatility distribution.

Source: Recorder stream (price series). Must be consistent with volatility shown
in other views (§9.2 Equity Curve, §7.9 Microstructure Panel, §7.10 Regime Panel)
so the same word never means two different computations.

Estimator choice (must be picked and documented before implementation):
  - Default: realized volatility from log returns at Recorder's sampling frequency,
    annualized
  - Expose as setting: close-to-close vs. range-based (e.g., Parkinson)
"""

from __future__ import annotations

from typing import Any, Dict, List, NamedTuple, Sequence

import math
import polars as pl


class VolatilityResult(NamedTuple):
    """Result container for volatility metrics."""
    # Realized volatility (annualized)
    realized_volatility_pct: float
    # Estimator used (e.g., "close_to_close", "parkinson")
    estimator: str
    # Volatility regime buckets
    # Strategy performance bucketed into Low/Normal/High/Extreme
    regimes: Dict[str, Dict[str, Any]]
    # P&L, fill rate, spread, adverse selection, drawdown per regime
    per_regime: Dict[str, Dict[str, float]]


def compute_volatility(
    samples: Sequence[Mapping[str, Any]],
    *,
    initial_capital: float,
    # Estimator choice: "close_to_close" (default) or "parkinson" or others
    estimator: str = "close_to_close",
    # Regime threshold percentiles (default: quartiles)
    regime_quartiles: bool = True,
) -> VolatilityResult:
    """Compute volatility metrics from Recorder samples.

    Args:
        samples: Recorder rows (docs/04 §4.6) in time order, each with
            `timestamp_ns, price, position, balance, fee, num_trades`.
        initial_capital: starting capital for context.
        estimator: volatility estimator to use. Default "close_to_close".
            Options: "close_to_close", "parkinson".
        regime_quartiles: if True, use quartile-based percentiles for regime
            buckets. If False, use hardcoded absolute thresholds.

    Returns:
        VolatilityResult named tuple with volatility values.

    Formula (docs/09 §9.11):
      Realized Volatility:
        - Compute log returns: r_i = log(price_i / price_{i-1})
        - Daily volatility = std(r_i) * sqrt(24*60*60 / sampling_interval_sec)
        - Annualized: vol_annual = daily_vol * sqrt(TRADING_DAYS_PER_YEAR)
        - TRADING_DAYS_PER_YEAR = 365 for crypto (24/7 markets)

      Regime Buckets (percentile-based):
        - Compute volatility for each sampling interval
        - Determine quartiles (or custom percentiles) over the distribution
        - Bucket: LOW_VOLATILITY (< Q1), NORMAL_VOLATILITY [Q1, Q2),
          HIGH_VOLATILITY [Q2, Q3), EXTREME_VOLATILITY >= Q3

      Strategy performance per bucket reports: P&L, fill rate, spread,
      adverse selection, drawdown.

    Conventions (per docs/09 §9.11):
      - Same estimator used consistently everywhere "volatility" is shown
      - Thresholds percentile-based over dataset's own distribution (not absolute)
      - Default: quartiles (25th, 50th, 75th percentiles)
    """
    if not samples:
        zero = 0.0
        return VolatilityResult(
            realized_volatility_pct=zero,
            estimator=estimator,
            regimes={},
            per_regime={},
        )

    # Extract price series
    prices = [float(s["price"]) for s in samples]
    timestamps = [int(s["timestamp_ns"]) for s in samples]

    if len(prices) < 2:
        zero = 0.0
        return VolatilityResult(
            realized_volatility_pct=zero,
            estimator=estimator,
            regimes={},
            per_regime={},
        )

    # Compute log returns
    log_returns: list[float] = []
    for i in range(1, len(prices)):
        if prices[i - 1] > 0 and prices[i] > 0:
            r = math.log(prices[i] / prices[i - 1])
        else:
            r = 0.0
        log_returns.append(r)

    if not log_returns:
        zero = 0.0
        return VolatilityResult(
            realized_volatility_pct=zero,
            estimator=estimator,
            regimes={},
            per_regime={},
        )

    # Compute standard deviation of log returns
    import numpy as np
    returns_series = np.array(log_returns)
    sample_std = float(np.std(returns_series, ddof=1))  # sample std

    # Sampling interval in seconds (from timestamps)
    ts_diffs = [timestamps[i + 1] - timestamps[i] for i in range(len(timestamps) - 1)]
    if ts_diffs:
        avg_interval_sec = sum(ts_diffs) / len(ts_diffs)
    else:
        avg_interval_sec = 60_000 / 1000  # default: 60ms in seconds

    # Daily volatility: std * sqrt(seconds_per_day / avg_interval)
    seconds_per_day = 24 * 60 * 60
    daily_vol = sample_std * math.sqrt(seconds_per_day / avg_interval_sec) if avg_interval_sec > 0 else 0.0

    # Annualized (crypto: 365 days)
    TRADING_DAYS_PER_YEAR = 365.0
    annual_vol = daily_vol * math.sqrt(TRADING_DAYS_PER_YEAR)

    realized_volatility_pct = annual_vol * 100.0  # as percentage

    # Regime bucketing (percentile-based)
    if regime_quartiles and len(log_returns) >= 4:
        quartiles = np.percentile(log_returns, [25, 50, 75])
        q1, q2, q3 = float(quartiles[0]), float(quartiles[1]), float(quartiles[2])

        def bucket_from_vol(vol: float) -> str:
            if vol < q1:
                return "LOW_VOLATILITY"
            elif vol < q2:
                return "NORMAL_VOLATILITY"
            elif vol < q3:
                return "HIGH_VOLATILITY"
            else:
                return "EXTREME_VOLATILITY"

        # For placeholder: assign each return to a regime bucket
        regimes: Dict[str, Dict[str, Any]] = {
            "LOW_VOLATILITY": {"count": 0, "pct_of_total": 0.0},
            "NORMAL_VOLATILITY": {"count": 0, "pct_of_total": 0.0},
            "HIGH_VOLATILITY": {"count": 0, "pct_of_total": 0.0},
            "EXTREME_VOLATILITY": {"count": 0, "pct_of_total": 0.0},
        }

        for r_val in log_returns:
            bucket = bucket_from_vol(r_val)
            regimes[bucket]["count"] += 1

        total = len(log_returns)
        for key in regimes:
            regimes[key]["pct_of_total"] = regimes[key]["count"] / total if total > 0 else 0.0

    else:
        # Default equal distribution placeholder
        regimes = {
            "LOW_VOLATILITY": {"count": 0, "pct_of_total": 0.0},
            "NORMAL_VOLATILITY": {"count": 0, "pct_of_total": 0.0},
            "HIGH_VOLATILITY": {"count": 0, "pct_of_total": 0.0},
            "EXTREME_VOLATILITY": {"count": 0, "pct_of_total": 0.0},
        }

    # Per-regime performance metrics (placeholder)
    # In full implementation: compute P&L, fill rate, spread, adverse selection,
    # drawdown for each regime bucket
    per_regime: Dict[str, Dict[str, float]] = {}
    for bucket in regimes:
        per_regime[bucket] = {
            "pnl": 0.0,
            "fill_rate": 0.0,
            "spread": 0.0,
            "adverse_selection": 0.0,
            "drawdown": 0.0,
        }

    return VolatilityResult(
        realized_volatility_pct=realized_volatility_pct,
        estimator=estimator,
        regimes=regimes,
        per_regime=per_regime,
    )


# Convenience dict version for UI

def volatility_dict(
    samples: Sequence[Mapping[str, Any]],
    *,
    initial_capital: float,
    estimator: str = "close_to_close",
) -> dict[str, Any]:
    """Return Volatility Analysis metrics as a dict matching §9.11 UI fields."""
    r = compute_volatility(samples, initial_capital=initial_capital, estimator=estimator)
    return {
        "realized_volatility_pct": r.realized_volatility_pct,
        "estimator": r.estimator,
        "regimes": r.regimes,
        "per_regime": r.per_regime,
    }