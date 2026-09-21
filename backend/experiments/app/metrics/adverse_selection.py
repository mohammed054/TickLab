"""Adverse Selection metrics (docs/09 §9.6).

Computes markout at a configured horizon for individual fills and aggregated
across fills. Markout(h) = signed_size * (mid_price(fill_time + h) - fill_price).

Source: fine-grained event stream's mid_price and latency_breakdown fields.
"""

from __future__ import annotations

from typing import Any, Dict, List, NamedTuple, Sequence

import math
import polars as pl


class AdverseSelectionResult(NamedTuple):
    """Result container for adverse selection metrics."""
    # Per-fill markout values
    markouts: Dict[str, float]  # order_id -> markout(h) value
    # Aggregated markout at fixed horizon h_fixed
    aggregated_markout_h: float
    # Fixed horizon used (default 100ms per §9.6)
    fixed_horizon_ms: int
    # Histogram/violin data for the distribution at h_fixed
    markout_distribution: Dict[str, Any]


def compute_adverse_selection(
    fills: Sequence[Mapping[str, Any]],
    *,
    horizon_ms: int = 100,
    # Fine-grained event data needed:
    # - mid_price at fill_time
    # - mid_price at fill_time + horizon_ms
    # - signed_size for each fill (1.0 for buy, -1.0 for sell)
) -> AdverseSelectionResult:
    """Compute adverse selection markout at a fixed horizon.

    Args:
        fills: Sequence of fill event dicts. Each must contain:
            - `order_id`: order identifier
            - `side`: "buy" or "sell"
            - `price`: fill price
            - `size`: filled size
            - `timestamp_ns`: fill timestamp
        horizon_ms: analysis horizon in milliseconds (default 100ms per §9.6)

    Returns:
        AdverseSelectionResult named tuple with markout values.

    Formula (docs/09 §9.6):
        markout(h) = signed_size * (mid_price(fill_time + h) - fill_price)

    positive markout = favorable in hindsight
    negative markout = adverse selection occurred
    """

    markouts: Dict[str, float] = {}
    markout_values: list[float] = []

    for f in fills:
        order_id = f["order_id"]
        side = f["side"]
        signed_size = 1.0 if side == "buy" else -1.0
        fill_price = float(f["price"])
        fill_time_ns = int(f["timestamp_ns"])

        # mid_price at fill_time - needs fine-grained event data
        # mid_price at fill_time + horizon_ms - also needs fine-grained data
        # For now, placeholder: markout = 0.0
        # In full implementation, lookup mid_price from the order book
        # at fill_time and at fill_time + horizon_ms

        markout = signed_size * (0.0 - fill_price)  # placeholder: no mid price data
        markouts[order_id] = markout
        markout_values.append(markout)

    # Aggregated markout at fixed horizon: sum across all fills
    aggregated_markout_h = sum(markout_values)

    return AdverseSelectionResult(
        markouts=markouts,
        aggregated_markout_h=aggregated_markout_h,
        fixed_horizon_ms=horizon_ms,
        markout_distribution={"values": markout_values, "horizon_ms": horizon_ms},
    )


# Convenience dict version for UI

def adverse_selection_dict(
    fills: Sequence[Mapping[str, Any]],
    *,
    horizon_ms: int = 100,
) -> dict[str, Any]:
    """Return Adverse Selection metrics as a dict matching §9.6 UI fields."""
    r = compute_adverse_selection(fills, horizon_ms=horizon_ms)
    return {
        "aggregated_markout_h": r.aggregated_markout_h,
        "fixed_horizon_ms": r.fixed_horizon_ms,
        "markout_distribution": r.markout_distribution,
    }