"""Order-Book Imbalance Analysis metric (docs/09 §9.10).

Computes order-book imbalance (bid_volume - ask_volume) / (bid_volume + ask_volume)
over a configurable depth window, and analyzes the statistical relationship
with subsequent price movement.

Mandatory framing (docs/00 §0.6 item 4): this view must display the statistical
relationship (e.g., correlation or binned average with confidence bands) and must
NOT present order-book imbalance as a predictive signal with implied certainty — a
caption stating this is a historical statistical association, not a trading
recommendation, is required directly on this view.

Formula (docs/09 §9.10):
  imbalance(t) = (bid_volume(t) - ask_volume(t)) / (bid_volume(t) + ask_volume(t))

computed over a configurable depth window (default: top 10 levels).

Analysis view plots imbalance(t) against subsequent price movement at fixed
horizons (10ms, 100ms, 1sec, 5sec), as a binned average or scatter with a fitted
trend line, to show the empirical (not assumed) relationship strength.
"""

from __future__ import annotations

from typing import Any, Dict, List, NamedTuple, Sequence

import math
import polars as pl


class ImbalancePoint(NamedTuple):
    """A single imbalance point in time."""
    timestamp: str
    imbalance: float  # -1.0 to 1.0
    bid_volume: float
    ask_volume: float
    mid_price: float


class ImbalanceResult(NamedTuple):
    """Result container for order-book imbalance analysis."""
    # Time series of imbalance points
    imbalance_series: List[ImbalancePoint]
    # Binned analysis: imbalance vs subsequent price movement at horizons
    binned_analysis: Dict[str, Any]
    # Statistical relationship measure
    correlation: float | None
    # Mandatory caption text
    caption: str


def compute_order_book_imbalance(
    order_book_samples: Sequence[Mapping[str, Any]],
) -> ImbalanceResult:
    """Compute order-book imbalance from order book samples.

    Args:
        order_book_samples: Sequence of order book snapshot dicts. Each should contain:
            - `bid_volumes`: list of bid volumes [level_1, level_2, ...]
            - `ask_volumes`: list of ask volumes [level_1, level_2, ...]
            - `mid_price`: mid price at snapshot time
            - `timestamp_ns`: snapshot timestamp
        depth_window: number of order book levels to include in imbalance calc (default: 10)

    Returns:
        ImbalanceResult named tuple with imbalance values.

    Formula (docs/09 §9.10):
      imbalance(t) = (bid_volume(t) - ask_volume(t)) / (bid_volume(t) + ask_volume(t))

    where bid_volume = sum of top N bid volumes, ask_volume = sum of top N ask volumes.

    Analysis view plots imbalance(t) against subsequent price movement at fixed
    horizons (10ms, 100ms, 1sec, 5sec), as binned average or scatter with trend line.

    Mandatory caption (per docs/00 §0.6 item 4 and docs/09 §9.10 framing):
      "This view displays a historical statistical association between
      order-book imbalance and subsequent price movement. It is not a
      trading recommendation."
    """
    if not order_book_samples:
        return ImbalanceResult(
            imbalance_series=[],
            binned_analysis={},
            correlation=None,
            caption=(
                "This view displays a historical statistical association between "
                "order-book imbalance and subsequent price movement. It is not a "
                "trading recommendation."
            ),
        )

    depth_window = 10  # default per §9.10
    if "depth_window" in order_book_samples[0]:
        depth_window = order_book_samples[0].get("depth_window", 10)

    imbalance_series: List[ImbalancePoint] = []

    for sample in order_book_samples:
        bid_volumes = sample.get("bid_volumes", [0.0] * depth_window)
        ask_volumes = sample.get("ask_volumes", [0.0] * depth_window)
        mid_price = sample.get("mid_price", 0.0)
        ts_ns = sample.get("timestamp_ns", 0)

        # Sum top N levels
        bid_vol = sum(bid_volumes[:depth_window])
        ask_vol = sum(ask_volumes[:depth_window])

        # Compute imbalance
        total_vol = bid_vol + ask_vol
        if total_vol > 0:
            imbalance = (bid_vol - ask_vol) / total_vol
        else:
            imbalance = 0.0

        # Format timestamp
        from datetime import datetime
        if ts_ns > 0:
            timestamp = datetime.fromtimestamp(ts_ns / 1e9).strftime("%Y-%m-%d %H:%M:%S")
        else:
            timestamp = "unknown"

        imbalance_series.append(
            ImbalancePoint(
                timestamp=timestamp,
                imbalance=imbalance,
                bid_volume=bid_vol,
                ask_volume=ask_vol,
                mid_price=mid_price,
            )
        )

    # Compute correlation with subsequent price movement (placeholder)
    # In full implementation, compare imbalance at t with price at t+h for
    # various horizons h, and compute correlation coefficient
    correlation = None

    return ImbalanceResult(
        imbalance_series=imbalance_series,
        binned_analysis={},  # would contain binned averages at horizons
        correlation=correlation,
        caption=(
            "This view displays a historical statistical association between "
            "order-book imbalance and subsequent price movement. It is not a "
            "trading recommendation."
        ),
    )


# Convenience dict version for UI

def imbalance_dict(
    order_book_samples: Sequence[Mapping[str, Any]],
    *,
    depth_window: int = 10,
) -> dict[str, Any]:
    """Return Order-Book Imbalance metrics as a dict matching §9.10 UI fields."""
    r = compute_order_book_imbalance(order_book_samples, depth_window=depth_window)
    return {
        "imbalance_series": [
            {
                "timestamp": p.timestamp,
                "imbalance": p.imbalance,
                "bid_volume": p.bid_volume,
                "ask_volume": p.ask_volume,
                "mid_price": p.mid_price,
            }
            for p in r.imbalance_series
        ],
        "correlation": r.correlation,
        "caption": r.caption,
        "binned_analysis": r.binned_analysis,
    }