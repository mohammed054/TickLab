"""Headline metrics over a Recorder series (docs/09 §9.1), wrapping upstream.

Calls the vendored `Metric` classes directly (docs/04 §4.7) — `Ret`,
`MaxDrawdown`, `SR`, `Sortino` — loaded via `_vendor` (see its docstring for
why the compiled extension is bypassed). Conventions mirror the Rust engine
(`engine/abstraction/src/metrics.rs`) exactly:

- `TRADING_DAYS_PER_YEAR = 365` (crypto runs 24/7; upstream's own
  recommendation over its 252 trad-fi default), `RISK_FREE_RATE = 0.0`
  (docs/09 §9.1, stated next to the figure in the UI per that section).
- Ratio metrics with `book_size = initial_capital` are scaled ×100 into the
  `*_pct` headline fields, matching `return_pct`/`maxDrawdownPct`.
- `slippage` is NaN until Block 2.5 captures per-fill expected-vs-fill prices
  (docs/09 §9.7); never fabricated.

Every figure here must agree with `engine/abstraction/src/metrics.rs` on the
same inputs — enforced by the parity test on the Block 2.2 fixture series.
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

import polars as pl

from ._vendor import load_stats_module

_metrics = load_stats_module("metrics")

TRADING_DAYS_PER_YEAR = 365.0
RISK_FREE_RATE = 0.0  # Assumed yield of cash; upstream SR/Sortino use no benchmark.

SAMPLE_KEYS = ("timestamp_ns", "price", "position", "balance", "fee", "num_trades")


def _as_float(value: Any) -> float:
    """Upstream may yield None (all-null frame) or numpy scalars; NaN either way."""
    if value is None:
        return math.nan
    try:
        return float(value)
    except (TypeError, ValueError):
        return math.nan


def build_record_frame(samples: Sequence[Mapping[str, Any]]) -> pl.DataFrame:
    """Recorder rows plus `equity_wo_fee`, mirroring upstream preparation.

    `equity_wo_fee = balance + position * price` is exactly
    `LinearAssetRecord.prepare` (`stats.py`, contract size 1.0). Integer ns
    timestamps go through `from_epoch(..., 'ns')` like upstream
    `Record.stats`; values must be microsecond-exact (true for every fixture
    and pipeline timestamp at ms resolution or coarser).
    """
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
    return frame.with_columns(
        (pl.col("balance") + pl.col("position") * pl.col("price")).alias("equity_wo_fee")
    )


def compute_headline(
    samples: Sequence[Mapping[str, Any]],
    *,
    initial_capital: float,
    orders_submitted: int,
) -> dict[str, float]:
    """Compute the 11 `HeadlineMetrics` fields (docs/09 §9.1, docs/15 §15.5).

    Args:
        samples: Recorder rows (docs/04 §4.6) in time order, each with
            `timestamp_ns, price, position, balance, fee, num_trades`.
        initial_capital: quote-currency starting capital (`book_size` upstream).
        orders_submitted: order count from the order path (fill-rate divisor).

    Upstream mapping: `Ret` → return, `MaxDrawdown` → drawdown magnitude,
    `SR` → Sharpe, `Sortino` → Sortino (all `compute(df, {})`); `trades` from
    cumulative `num_trades` and `fees` from cumulative `fee`
    (`num_trades[-1]`, `fee[-1]` per docs/09 §9.1, differenced against the
    first row so a mid-run series still counts only its own fills).
    """
    rows = list(samples)
    if not rows:
        raise ValueError("samples must hold at least one Recorder row")
    if not initial_capital > 0:
        raise ValueError("initial_capital must be positive")

    frame = build_record_frame(rows)
    context: dict[str, Any] = {}

    ret_ratio = _as_float(_metrics.Ret(book_size=initial_capital).compute(frame, context)["Return"])
    net_pnl = ret_ratio * initial_capital
    mdd_ratio = _as_float(
        _metrics.MaxDrawdown(book_size=initial_capital).compute(frame, context)["MaxDrawdown"]
    )

    if frame.height < 2:
        # Upstream SR/Sortino index the second timestamp; a lone observation
        # has no dispersion to annualize (Rust mirror returns NaN too).
        sharpe = math.nan
        sortino = math.nan
    else:
        sharpe = _as_float(
            _metrics.SR(trading_days_per_year=TRADING_DAYS_PER_YEAR).compute(frame, context)["SR"]
        )
        sortino = _as_float(
            _metrics.Sortino(trading_days_per_year=TRADING_DAYS_PER_YEAR).compute(
                frame, context
            )["Sortino"]
        )

    first_trades = int(rows[0]["num_trades"])
    last_trades = int(rows[-1]["num_trades"])
    trades = max(0, last_trades - first_trades)
    fees = float(rows[-1]["fee"]) - float(rows[0]["fee"])
    fill_rate_pct = (
        100.0 * trades / orders_submitted if orders_submitted > 0 else math.nan
    )

    return {
        "initial_capital": float(initial_capital),
        "final_capital": float(initial_capital) + net_pnl,
        "net_pnl": net_pnl,
        "return_pct": ret_ratio * 100.0,
        "max_drawdown_pct": mdd_ratio * 100.0,
        "sharpe": sharpe,
        "sortino": sortino,
        "trades": float(trades),
        "fill_rate_pct": fill_rate_pct,
        "fees": fees,
        "slippage": math.nan,  # Block 2.5 (docs/09 §9.7).
    }
