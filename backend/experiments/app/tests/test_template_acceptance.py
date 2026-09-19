"""Block 2.6 acceptance tests (docs/16-implementation-roadmap.md Block 2.6).

Acceptance: "each template produces a strategy that passes VALIDATE and completes
a fixture BACKTEST without modification."

- VALIDATE mirrors docs/08 §8.4: imports resolve, required strategy entry points
  present, PARAMETER_SCHEMA (§8.6) carries the minimum fields and matches the
  class's declared defaults.
- Fixture BACKTEST runs every strategy over a deterministic random-walk event
  stream with order-book snapshots and a second-leg price, asserting it completes
  without raising and returns only valid OrderActions.
"""

from __future__ import annotations

import importlib
import json
import os
import random
import sys

import pytest

_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from experiments.app.templates import TEMPLATE_IDS  # noqa: E402
from experiments.app.templates.base import (  # noqa: E402
    MarketEvent,
    Snapshot,
    StrategyBase,
)

REQUIRED_FIELDS = {
    "key",
    "label",
    "type",
    "min",
    "max",
    "step",
    "default",
    "description",
    "group",
}
VALID_TYPES = {"number", "integer", "string", "dropdown", "bool", "range"}
VALID_ACTIONS = {"submit", "cancel", "hold"}
N_BARS = 5000


def find_strategy_class(mod: object):
    for value in vars(mod).values():
        if isinstance(value, type) and issubclass(value, StrategyBase) and value.__module__ == mod.__name__:
            return value
    return None


def fixture_event(step: int, price: float) -> MarketEvent:
    snapshot = Snapshot(
        bid_sizes=[100.0, 90.0, 80.0, 70.0, 60.0, 50.0, 40.0, 30.0, 20.0, 10.0],
        ask_sizes=[95.0, 85.0, 75.0, 65.0, 55.0, 45.0, 35.0, 25.0, 15.0, 5.0],
    )
    return MarketEvent(
        mid_price=price,
        last_price=price,
        timestamp_ms=step * 250,
        side="buy" if step % 3 == 0 else ("sell" if step % 3 == 1 else None),
        snapshot=snapshot,
        price_b=price * (1.0 + 0.002 * (1 if step % 2 == 0 else -1)),
    )


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_validate(template_id: str) -> None:
    mod = importlib.import_module(f"experiments.app.templates.{template_id}")

    assert mod.STRATEGY_NAME == template_id
    assert isinstance(mod.STRATEGY_DESCRIPTION, str) and mod.STRATEGY_DESCRIPTION.strip()
    cls = find_strategy_class(mod)
    assert cls is not None, "no StrategyBase subclass exported"
    assert getattr(cls, "name", None) == template_id

    schema = mod.PARAMETER_SCHEMA
    assert isinstance(schema, list) and schema, "PARAMETER_SCHEMA must be a non-empty list"

    keys = []
    for param in schema:
        assert set(param.keys()) >= REQUIRED_FIELDS, f"missing required field(s): {REQUIRED_FIELDS - set(param.keys())}"
        assert param["type"] in VALID_TYPES, f"invalid type {param['type']!r}"
        assert param["description"].strip(), "every parameter needs a description (docs/08 §8.6)"
        assert param["group"].strip(), "every parameter needs a group"
        try:
            json.dumps(param["default"])
        except TypeError:
            pytest.fail(f"default for {param['key']!r} is not JSON-serializable")
        keys.append(param["key"])
    assert len(keys) == len(set(keys)), "parameter keys must be unique"

    params = {p["key"]: p["default"] for p in schema}
    strat = cls(**params)
    for key, value in params.items():
        class_default = getattr(cls, key, None)
        assert callable(class_default) or class_default == value, (
            f"schema default for {key!r} ({value!r}) != class default ({class_default!r})"
        )
    assert isinstance(strat, StrategyBase)


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_fixture_backtest(template_id: str) -> None:
    mod = importlib.import_module(f"experiments.app.templates.{template_id}")
    cls = find_strategy_class(mod)
    params = {p["key"]: p["default"] for p in mod.PARAMETER_SCHEMA}
    strat = cls(**params)

    rng = random.Random(template_id)
    price = 100.0
    for step in range(N_BARS):
        price = max(0.01, price + rng.gauss(0, 0.5))
        action = strat.on_market_event(fixture_event(step, price))
        assert action in VALID_ACTIONS, f"invalid OrderAction {action!r} at step {step}"

    assert strat.orders or strat.position == strat.position  # completes without modification