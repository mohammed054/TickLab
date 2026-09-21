"""Slippage Analysis metrics (docs/09 §9.7).

Computes slippage per fill and aggregated breakdowns by volatility bucket,
liquidity bucket, order size bucket, time of day, and market regime.

Source: fine-grained event stream (fill price vs. expected price at submission).

Formula (docs/09 §9.7):
  expected_price = the order's limit price at submission (for limit orders)
                   or the best available price at submission (for market/IOC/FOK)
  slippage        = (fill_price - expected_price) * signed_size    [in quote currency]
  slippage_ticks  = slippage_price_diff / tick_size
  slippage_bps    = (fill_price - expected_price) / expected_price * 10_000
"""

from __future__ import annotations

from typing import Any, Dict, List, NamedTuple, Sequence

import math
import polars as pl


class SlippageResult(NamedTuple):
    """Result container for slippage metrics."""
    # Per-fill slippage
    per_fill: Dict[str, float]  # order_id -> slippage in quote currency
    # Aggregated slippage
    total_slippage: float
    total_slippage_ticks: float
    total_slippage_bps: float
    # Breakdowns
    by_volatility_bucket: Dict[str, float]  # bucket_name -> total slippage
    by_liquidity_bucket: Dict[str, float]
    by_order_size_bucket: Dict[str, float]
    by_time_of_day: Dict[str, float]
    by_market_regime: Dict[str, float]


def compute_slippage(
    fills: Sequence[Mapping[str, Any]],
    *,
    tick_size: float = 0.0001,
    # Fine-grained event data needed for each fill:
    # - expected_price (limit price at submission or best available price)
    # - side ("buy" or "sell")
    # - timestamp_ns (for time-of-day bucketing)
    # - volatility estimate (for volatility bucketing)
    # - liquidity measure (for liquidity bucketing)
    # - market_regime classification (for regime bucketing)
) -> SlippageResult:
    """Compute slippage per fill and aggregated breakdowns.

    Args:
        fills: Sequence of fill event dicts. Each should contain:
            - `order_id`: order identifier
            - `side`: "buy" or "sell"
            - `price`: fill price
            - `timestamp_ns`: fill timestamp
            - `expected_price`: price expected at submission (limit price or best bid/ask)
        tick_size: minimum price increment for the instrument
        volatility_bucket: optional pre-computed bucket assignment per fill
        liquidity_bucket: optional pre-computed bucket assignment per fill
        order_size_bucket: optional pre-computed bucket assignment per fill
        time_of_day_bucket: optional pre-computed bucket assignment per fill
        market_regime: optional pre-computed bucket assignment per fill

    Returns:
        SlippageResult named tuple with slippage values.

    Formula (docs/09 §9.7):
      slippage = (fill_price - expected_price) * signed_size   [quote currency]
      signed_size = 1.0 for buys, -1.0 for sells
      slippage_ticks = slippage_price_diff / tick_size
      slippage_bps = (fill_price - expected_price) / expected_price * 10_000
    """
    if not fills:
        zero = 0.0
        return SlippageResult(
            per_fill={},
            total_slippage=zero,
            total_slippage_ticks=zero,
            total_slippage_bps=zero,
            by_volatility_bucket={},
            by_liquidity_bucket={},
            by_order_size_bucket={},
            by_time_of_day={},
            by_market_regime={},
        )

    per_fill: Dict[str, float] = {}
    slippage_values: list[float] = []
    slippage_ticks_values: list[float] = []
    slippage_bps_values: list[float] = []

    # Breakdown accumulators
    by_volatility: Dict[str, float] = {}
    by_liquidity: Dict[str, float] = {}
    by_order_size: Dict[str, float] = {}
    by_time_of_day: Dict[str, float] = {}
    by_market_regime: Dict[str, float] = {}

    for f in fills:
        order_id = f["order_id"]
        side = f["side"]
        signed_size = 1.0 if side == "buy" else -1.0
        fill_price = float(f["price"])
        expected_price = float(f.get("expected_price", fill_price))

        price_diff = fill_price - expected_price
        slippage = price_diff * signed_size  # quote currency
        slippage_ticks = slippage / tick_size if tick_size > 0 else math.nan
        slippage_bps = (slippage / expected_price * 10_000) if expected_price > 0 else math.nan

        per_fill[order_id] = slippage
        slippage_values.append(slippage)
        slippage_ticks_values.append(slippage_ticks)
        slippage_bps_values.append(slippage_bps)

        # Bucket assignments - use provided or default
        vol_bucket = f.get("volatility_bucket", "unknown")
        liq_bucket = f.get("liquidity_bucket", "unknown")
        size_bucket = f.get("order_size_bucket", "unknown")
        time_bucket = f.get("time_of_day_bucket", "unknown")
        regime_bucket = f.get("market_regime", "unknown")

        by_volatility[vol_bucket] = by_volatility.get(vol_bucket, 0.0) + slippage
        by_liquidity[liq_bucket] = by_liquidity.get(liq_bucket, 0.0) + slippage
        by_order_size[size_bucket] = by_order_size.get(size_bucket, 0.0) + slippage
        by_time_of_day[time_bucket] = by_time_of_day.get(time_bucket, 0.0) + slippage
        by_market_regime[regime_bucket] = by_market_regime.get(regime_bucket, 0.0) + slippage

    total_slippage = sum(slippage_values)
    total_slippage_ticks = sum(slippage_ticks_values) if slippage_ticks_values else 0.0
    total_slippage_bps = sum(slippage_bps_values) if slippage_bps_values else 0.0

    return SlippageResult(
        per_fill=per_fill,
        total_slippage=total_slippage,
        total_slippage_ticks=total_slippage_ticks,
        total_slippage_bps=total_slippage_bps,
        by_volatility_bucket=by_volatility,
        by_liquidity_bucket=by_liquidity,
        by_order_size_bucket=by_order_size,
        by_time_of_day=by_time_of_day,
        by_market_regime=by_market_regime,
    )


# Convenience dict version for UI

def slippage_dict(
    fills: Sequence[Mapping[str, Any]],
    *,
    tick_size: float = 0.0001,
) -> dict[str, Any]:
    """Return Slippage Analysis metrics as a dict matching §9.7 UI fields."""
    r = compute_slippage(fills, tick_size=tick_size)
    return {
        "total_slippage": r.total_slippage,
        "total_slippage_ticks": r.total_slippage_ticks,
        "total_slippage_bps": r.total_slippage_bps,
        "per_fill": r.per_fill,
        "by_volatility_bucket": r.by_volatility_bucket,
        "by_liquidity_bucket": r.by_liquidity_bucket,
        "by_order_size_bucket": r.by_order_size_bucket,
        "by_time_of_day": r.by_time_of_day,
        "by_market_regime": r.by_market_regime,
    }