"""Block 2.4 acceptance (parity half): headline metrics on the Block 2.2
fixture backtest match hand-computed expected values (AGENTS.md §5.7).

The same figures are asserted from the Rust side
(`engine/abstraction/src/hftbacktest_impl.rs::headline_metrics_are_hand_computed`
plus `tests/roundtrip.rs`) — two independent implementations, one calling
upstream's `Metric` classes directly (this file) and one porting their
formulas to std-only Rust, agreeing to 1e-9 relative on identical inputs.

Run from the repo root: `python -m pytest backend/experiments/app/metrics/tests`.
"""

import math

import pytest

from backend.experiments.app.metrics.headline import compute_headline

# Block 2.2 fixture Recorder series (docs/04 §4.6): post-drain flat,
# post-buy-fill, terminal. buy 1 @ 101 (taker fee 0.05% → 0.0505),
# sell 1 @ 99 (fee 0.0495); timestamps: last feed ts, then +60µs per fill
# (30µs order entry + 30µs response, ConstantLatency).
FIXTURE_SAMPLES = [
    {"timestamp_ns": 1_001_000_000, "price": 100.0, "position": 0.0,
     "balance": 0.0, "fee": 0.0, "num_trades": 0},
    {"timestamp_ns": 1_001_060_000, "price": 100.0, "position": 1.0,
     "balance": -101.0, "fee": 0.0505, "num_trades": 1},
    {"timestamp_ns": 1_001_120_000, "price": 100.0, "position": 0.0,
     "balance": -2.0, "fee": 0.1, "num_trades": 2},
]
INITIAL_CAPITAL = 100_000.0
ORDERS_SUBMITTED = 2


def _rel(actual: float, expected: float) -> float:
    return abs(actual - expected) / abs(expected)


def test_fixture_headline_matches_hand_computed_values():
    headline = compute_headline(
        FIXTURE_SAMPLES,
        initial_capital=INITIAL_CAPITAL,
        orders_submitted=ORDERS_SUBMITTED,
    )
    # docs/09 §9.1: Return = (equity − fee) − 0 = −2.10.
    assert headline["net_pnl"] == pytest.approx(-2.10, abs=1e-9)
    assert headline["return_pct"] == pytest.approx(-2.1e-3, abs=1e-12)
    assert headline["final_capital"] == pytest.approx(99_997.90, abs=1e-9)
    assert headline["fees"] == pytest.approx(0.10, abs=1e-9)
    assert headline["trades"] == 2.0
    assert headline["fill_rate_pct"] == 100.0
    # docs/09 §9.3: equity never recovers above 0 → |min dd| = 2.10 → 0.0021%.
    assert headline["max_drawdown_pct"] == pytest.approx(0.0021, abs=1e-12)
    # Diffs [−1.0505, −1.0495], mean −1.05, sample std 0.0005·√2, 60µs
    # sampling → c = 5.256e11: Sharpe −1_076_544_471.91…,
    # Sortino −724_982.68… (hand-derived; Rust side asserts the same).
    assert _rel(headline["sharpe"], -1_076_544_471.91) < 1e-9
    assert _rel(headline["sortino"], -724_982.6762) < 1e-9
    # Block 2.5 owns slippage: NaN, never fabricated.
    assert math.isnan(headline["slippage"])


def test_empty_series_is_rejected():
    with pytest.raises(ValueError):
        compute_headline([], initial_capital=INITIAL_CAPITAL, orders_submitted=0)


def test_single_observation_has_no_dispersion():
    headline = compute_headline(
        [FIXTURE_SAMPLES[0]], initial_capital=INITIAL_CAPITAL, orders_submitted=0
    )
    assert headline["net_pnl"] == pytest.approx(0.0, abs=1e-12)
    assert headline["max_drawdown_pct"] == pytest.approx(0.0, abs=1e-12)
    assert math.isnan(headline["sharpe"])
    assert math.isnan(headline["sortino"])
    assert math.isnan(headline["fill_rate_pct"])
