"""Drawdown metrics (docs/09 §9.3).

Computes max drawdown, current drawdown, drawdown duration, and recovery time.
Source: Recorder stream (equity_wo_fee series).
"""

from __future__ import annotations

from typing import Any, Mapping, NamedTuple, Sequence

import math
import polars as pl


class DrawdownResult(NamedTuple):
    """Result container for drawdown metrics."""
    current_drawdown_pct: float
    max_drawdown_pct: float
    drawdown_duration: float | None
    recovery_time: str | None
    peak_timestamp: str
    peak_value: float
    trough_timestamp: str
    trough_value: float


def compute_drawdown(
    samples: Sequence[Mapping[str, Any]],
    *,
    initial_capital: float,
) -> DrawdownResult:
    """Compute drawdown metrics from Recorder samples.

    Args:
        samples: Recorder rows (docs/04 §4.6) in time order, each with
            `timestamp_ns, price, position, balance, fee, num_trades`.
        initial_capital: quote-currency starting capital (`book_size` upstream).

    Returns:
        DrawdownResult named tuple with all drawdown metrics.

    Formula (docs/09 §9.3):
        drawdown(t) = (equity(t) - running_max(equity, 0..t)) / running_max(equity, 0..t)
        max_drawdown = min(drawdown(t)) over the full series
    """
    if not samples:
        raise ValueError("samples must hold at least one Recorder row")

    # Build the record frame with equity_wo_fee (mirrors headline.py build_record_frame)
    frame = pl.DataFrame(
        {
            "timestamp": [int(s["timestamp_ns"]) for s in samples],
            "price": [float(s["price"]) for s in samples],
            "position": [float(s["position"]) for s in samples],
            "balance": [float(s["balance"]) for s in samples],
            "fee": [float(s["fee"]) for s in samples],
        }
    )
    if "timestamp" not in frame.columns or frame.height == 0:
        raise ValueError("samples must hold at least one Recorder row")
    frame = frame.with_columns(pl.from_epoch("timestamp", time_unit="ns"))
    frame = frame.with_columns(
        (pl.col("balance") + pl.col("position") * pl.col("price")).alias("equity_wo_fee")
    )

    equity = frame["equity_wo_fee"]
    running_max = equity.cum_max()
    drawdown = equity - running_max

    # Max drawdown (minimum of drawdown, expressed as positive percentage)
    mdd_raw = drawdown.min()
    max_drawdown_pct = float(mdd_raw) if mdd_raw is not None else 0.0

    # Current drawdown (at the last point)
    last_dd = float(drawdown[-1]) if frame.height > 0 else 0.0
    current_drawdown_pct = float(last_dd) if last_dd is not None else 0.0

# Peak and trough timestamps/values
    # Use arg_sort to find indices
    peak_val = float(running_max.max())
    trough_val = float(drawdown.min())
    
    # Find first occurrence of peak and trough
    peak_idx = int(running_max.arg_sort()[-1])  # last index has max value
    # For trough, find the index of minimum value
    trough_idx = int(drawdown.arg_sort()[0])

    peak_timestamp = frame["timestamp"][peak_idx].strftime("%Y-%m-%d %H:%M:%S")
    peak_value = float(equity[peak_idx])
    trough_timestamp = frame["timestamp"][trough_idx].strftime("%Y-%m-%d %H:%M:%S")
    trough_value = float(equity[trough_idx])

    # Drawdown duration: time from peak to recovery (first time equity >= peak equity after peak)
    peak_time = frame["timestamp"][peak_idx]
    after_peak = frame.slice(peak_idx + 1)
    recovery_mask = after_peak["equity_wo_fee"] >= peak_value

    if recovery_mask.sum() > 0:
        recovery_idx = int(recovery_mask.to_list().index(True)) + peak_idx + 1
        recovery_timestamp = frame["timestamp"][recovery_idx]
        recovery_time = recovery_timestamp.strftime("%Y-%m-%d %H:%M:%S")
        # Duration in seconds
        duration_sec = (recovery_timestamp - peak_time).total_seconds()
    else:
        recovery_time = None
        duration_sec = None

    return DrawdownResult(
        current_drawdown_pct=current_drawdown_pct,
        max_drawdown_pct=max_drawdown_pct,
        drawdown_duration=duration_sec,
        recovery_time=recovery_time,
        peak_timestamp=peak_timestamp,
        peak_value=peak_value,
        trough_timestamp=trough_timestamp,
        trough_value=trough_value,
    )


# Convenience functions returning plain dicts for UI integration

def drawdown_metrics_dict(
    samples: Sequence[Mapping[str, Any]],
    *,
    initial_capital: float,
) -> dict[str, Any]:
    """Return drawdown metrics as a dict matching §9.3 UI fields."""
    r = compute_drawdown(samples, initial_capital=initial_capital)
    return {
        "current_drawdown_pct": r.current_drawdown_pct,
        "max_drawdown_pct": r.max_drawdown_pct,
        "drawdown_duration_sec": r.drawdown_duration,
        "recovery_time": r.recovery_time,
        "peak_timestamp": r.peak_timestamp,
        "peak_value": r.peak_value,
        "trough_timestamp": r.trough_timestamp,
        "trough_value": r.trough_value,
    }