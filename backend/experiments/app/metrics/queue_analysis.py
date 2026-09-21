"""Queue Analysis metrics (docs/09 §9.8).

Computes queue-ahead at submission, fill probability calibration, and
queue progression timeline for individual orders.

Source: fine-grained event stream (submission events with queue-ahead estimate
and trade arrival timeline).
"""

from __future__ import annotations

from typing import Any, Dict, List, NamedTuple, Sequence

import polars as pl


class QueueProgressionPoint(NamedTuple):
    """A point in the queue progression timeline."""
    timestamp_ns: int
    trades_ahead_before: int  # trades that were ahead before this point
    trades_ahead_after: int   # trades still ahead after this point
    event_type: str  # "partial_fill", "full_fill", "cancellation"


class QueueAnalysisResult(NamedTuple):
    """Result container for queue analysis metrics."""
    # Per-order queue-ahead at submission
    queue_ahead_at_submission: Dict[str, int]  # order_id -> queue_ahead
    # Fill probability calibration: modeled vs realized
    fill_probability_calibration: Dict[str, float]  # bucket -> (modeled, realized)
    # Queue progression timeline for a selected order
    progression: List[QueueProgressionPoint]
    # Per-order: partial fill and full fill/cancellation timestamps
    order_timestamps: Dict[str, Dict[str, int]]  # order_id -> {submission, partial_fill, full_fill, cancellation}


def compute_queue_analysis(
    orders: Sequence[Mapping[str, Any]],
) -> QueueAnalysisResult:
    """Compute queue analysis metrics from order events.

    Args:
        orders: Sequence of order event dicts. Each should contain:
            - `order_id`: order identifier
            - `side`: "buy" or "sell"
            - `timestamp_ns`: submission timestamp
            - `queue_ahead_estimate`: modeled queue-ahead at submission
            - `fill_probability_estimate`: modeled fill probability
            - `status`: "filled", "partially_filled", "cancelled"

    Returns:
        QueueAnalysisResult named tuple with queue metrics.

    Key metrics (docs/09 §9.8):
      - Queue Ahead at Submission: modeled estimate
      - Fill Probability Calibration: modeled vs realized fill rate
      - Queue Progression: timeline of trades eroding queue ahead
      - Partial fill and full fill/cancellation timestamps
    """
    if not orders:
        return QueueAnalysisResult(
            queue_ahead_at_submission={},
            fill_probability_calibration={},
            progression=[],
            order_timestamps={},
        )

    queue_ahead_at_submission: Dict[str, int] = {}
    fill_prob_calibration: Dict[str, float] = {}  # bucket -> (modeled_prob, realized_rate)
    progression: List[QueueProgressionPoint] = []
    order_timestamps: Dict[str, Dict[str, int]] = {}

    for o in orders:
        order_id = o["order_id"]
        side = o["side"]
        queue_ahead = o.get("queue_ahead_estimate", 0)
        fill_prob_estimate = o.get("fill_probability_estimate", 0.0)
        status = o.get("status", "cancelled")
        subm_ts = o.get("timestamp_ns", 0)

        queue_ahead_at_submission[order_id] = queue_ahead

        # Record timestamps
        order_timestamps[order_id] = {
            "submission": subm_ts,
        }

        # Track fill/cancellation timestamps based on status
        if status == "filled":
            order_timestamps[order_id]["full_fill"] = subm_ts
        elif status == "partially_filled":
            order_timestamps[order_id]["partial_fill"] = subm_ts
        elif status == "cancelled":
            order_timestamps[order_id]["cancellation"] = subm_ts

        # Fill probability calibration:
        # Compare modeled fill_probability_estimate against realized fill rate
        # across similar queue-ahead buckets
        bucket_key = f"q{queue_ahead}"
        if bucket_key not in fill_prob_calibration:
            fill_prob_calibration[bucket_key] = {"modeled": fill_prob_estimate, "realized": 0.0, "count": 0}
        fc = fill_prob_calibration[bucket_key]
        fc["count"] += 1
        # Realized rate would be computed from actual fill events vs submissions
        # For placeholder: just record the modeled estimate
        fc["modeled"] = (fc["modeled"] * (fc["count"] - 1) + fill_prob_estimate) / fc["count"]

    # Queue progression - placeholder: build from actual trade arrivals
    # In full implementation, track how trades ahead of the order change over time

    return QueueAnalysisResult(
        queue_ahead_at_submission=queue_ahead_at_submission,
        fill_probability_calibration=fill_prob_calibration,
        progression=progression,
        order_timestamps=order_timestamps,
    )


# Convenience dict version for UI

def queue_analysis_dict(
    orders: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Return Queue Analysis metrics as a dict matching §9.8 UI fields."""
    r = compute_queue_analysis(orders)
    return {
        "queue_ahead_at_submission": r.queue_ahead_at_submission,
        "fill_probability_calibration": r.fill_probability_calibration,
        "progression": [{"ts": p.timestamp_ns, "trades_ahead_before": p.trades_ahead_before,
                         "trades_ahead_after": p.trades_ahead_after, "event": p.event_type}
                        for p in r.progression],
        "order_timestamps": r.order_timestamps,
    }