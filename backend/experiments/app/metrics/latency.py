"""Latency Analysis metrics (docs/09 §9.9).

Computes latency breakdown from the fine-grained event stream's
latency_breakdown field, broken into decision, order-creation,
exchange-arrival, fill latency components, and total latency.

Visualizations: latency distribution (histogram with p50/p90/p99),
latency over time (line chart), and network/strategy/exchange
breakdown.

Source: fine-grained event stream's latency_breakdown field
(docs/05-engine-abstraction-and-data-pipeline.md §5.5).
"""

from __future__ import annotations

from typing import Any, Dict, List, NamedTuple, Sequence

import math
import polars as pl


class LatencyComponent(NamedTuple):
    """A single latency component."""
    name: str  # "decision", "order_creation", "exchange_arrival", "fill", "total"
    duration_ms: float


class LatencyResult(NamedTuple):
    """Result container for latency analysis."""
    # Per-fill latency breakdown
    per_fill: Dict[str, LatencyComponent]  # order_id -> latency components
    # Latency distribution statistics
    p50_ms: float
    p90_ms: float
    p99_ms: float
    # Latency over time (series)
    latency_over_time: Dict[str, float]  # timestamp_str -> latency_ms
    # Breakdown: network vs strategy vs exchange-side
    network_latency_ms: float
    strategy_latency_ms: float
    exchange_latency_ms: float
    # Reconciliation: do components sum to total?
    reconciliation_gap_ms: float


def compute_latency_analysis(
    fills: Sequence[Mapping[str, Any]],
) -> LatencyResult:
    """Compute latency analysis from fill events with latency breakdown.

    Args:
        fills: Sequence of fill event dicts. Each should contain:
            - `order_id`: order identifier
            - `latency_breakdown`: dict with latency components in ms:
              {"decision": ms, "order_creation": ms, "exchange_arrival": ms,
               "fill": ms, "total": ms}
            - `timestamp_ns`: fill timestamp

    Returns:
        LatencyResult named tuple with latency values.

    Formula (docs/09 §9.9):
      Latency components (from latency_breakdown field):
        - decision latency: order decision logic time
        - order-creation latency: time to create the order
        - exchange-arrival latency: time for order to reach exchange
        - fill latency: time from order arrival to fill
        - total = sum of components (or total from event, may include gap)

    Visualizations:
      - Histogram with p50/p90/p99 annotated
      - Latency over time line chart
      - Network/strategy/exchange breakdown (must sum to total or gap flagged)
    """
    if not fills:
        zero = 0.0
        return LatencyResult(
            per_fill={},
            p50_ms=zero,
            p90_ms=zero,
            p99_ms=zero,
            latency_over_time={},
            network_latency_ms=zero,
            strategy_latency_ms=zero,
            exchange_latency_ms=zero,
            reconciliation_gap_ms=zero,
        )

    per_fill: Dict[str, LatencyComponent] = {}
    all_latencies: list[float] = []
    latency_over_time: Dict[str, float] = {}

    # Breakdown accumulators
    total_network = 0.0
    total_strategy = 0.0
    total_exchange = 0.0

    for f in fills:
        order_id = f["order_id"]
        latency_breakdown = f.get("latency_breakdown", {})

        # Extract components (default to 0.0 if missing)
        decision = float(latency_breakdown.get("decision", 0.0))
        order_creation = float(latency_breakdown.get("order_creation", 0.0))
        exchange_arrival = float(latency_breakdown.get("exchange_arrival", 0.0))
        fill = float(latency_breakdown.get("fill", 0.0))
        total = float(latency_breakdown.get("total", 0.0))

        # Component breakdown: network vs strategy vs exchange
        # Per the spec: "these three must sum to (or clearly account for the gap
        # to) the total latency figure"
        # Placeholder assignments (full implementation would parse the breakdown)
        strategy_component = order_creation + decision
        exchange_component = exchange_arrival
        network_component = total - strategy_component - exchange_component

        comp = LatencyComponent(
            name="total",
            duration_ms=total,
        )
        # Store each component separately
        per_fill[f"{order_id}_decision"] = LatencyComponent(name="decision", duration_ms=decision)
        per_fill[f"{order_id}_creation"] = LatencyComponent(name="order_creation", duration_ms=order_creation)
        per_fill[f"{order_id}_exchange"] = LatencyComponent(name="exchange_arrival", duration_ms=exchange_arrival)
        per_fill[f"{order_id}_fill"] = LatencyComponent(name="fill", duration_ms=fill)
        per_fill[f"{order_id}_total"] = LatencyComponent(name="total", duration_ms=total)

        all_latencies.append(total)

        # Time-series plotting
        subm_ts = f.get("timestamp_ns", 0)
        if subm_ts > 0:
            from datetime import datetime
            ts_str = datetime.fromtimestamp(subm_ts / 1e9).strftime("%Y-%m-%d %H:%M:%S")
            latency_over_time[ts_str] = total

        # Accumulate breakdown totals
        total_strategy += strategy_component
        total_exchange += exchange_component
        total_network += network_component

    # Compute percentile statistics
    if all_latencies:
        sorted_latencies = sorted(all_latencies)
        n = len(sorted_latencies)
        p50_ms = sorted_latencies[int(n * 0.5)]
        p90_ms = sorted_latencies[int(n * 0.9)]
        p99_ms = sorted_latencies[int(n * 0.99)]
    else:
        p50_ms = p90_ms = p99_ms = 0.0

    # Reconciliation gap: do components sum to total?
    # Per spec: "an unreconciled gap is flagged the same way P&L Attribution's
    # 'Other' residual is flagged (§9.4)"
    reconciliation_gap_ms = abs(total_network + total_strategy + total_exchange - sum(all_latencies)) if all_latencies else 0.0

    return LatencyResult(
        per_fill=per_fill,
        p50_ms=p50_ms,
        p90_ms=p90_ms,
        p99_ms=p99_ms,
        latency_over_time=latency_over_time,
        network_latency_ms=total_network,
        strategy_latency_ms=total_strategy,
        exchange_latency_ms=total_exchange,
        reconciliation_gap_ms=reconciliation_gap_ms,
    )


# Convenience dict version for UI

def latency_dict(
    fills: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Return Latency Analysis metrics as a dict matching §9.9 UI fields."""
    r = compute_latency_analysis(fills)
    return {
        "p50_ms": r.p50_ms,
        "p90_ms": r.p90_ms,
        "p99_ms": r.p99_ms,
        "network_latency_ms": r.network_latency_ms,
        "strategy_latency_ms": r.strategy_latency_ms,
        "exchange_latency_ms": r.exchange_latency_ms,
        "reconciliation_gap_ms": r.reconciliation_gap_ms,
        "per_fill_count": len(r.per_fill),
        "latency_over_time_count": len(r.latency_over_time),
    }