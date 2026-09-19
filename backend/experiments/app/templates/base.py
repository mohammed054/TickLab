"""Shared template runtime stub for Block 2.6 strategy templates.

Scope note (Task 2.6, docs/08 §8.5): templates must be real, runnable starter
strategies whose imports resolve under VALIDATE (docs/08 §8.4). The engine
abstraction (`engine/abstraction/`) is Rust owned by Block 2.2, and the
strategy SDK type definitions are generated later (Block 4.1) — so templates
must not import either. This module provides the minimal duck-type interface
every template builds on:

- `MarketEvent`: synthetic market data event used by the fixture dry-run.
- `StrategyBase`: position/order bookkeeping with an immediate-fill
  assumption that exists ONLY so templates complete a fixture BACKTEST
  without modification. It is not production fill modeling; real fills come
  from the engine via the Job Runner (Block 2.8). No P&L, fee, slippage, or
  markout math lives here.

Assumption flagged for Planner review: the required strategy entry points
are `on_market_event` (+ optional `on_fill`) and a module-level
`PARAMETER_SCHEMA` export. Exact VALIDATE entry-point names and the final
SDK import path are Block 2.8/4.1 decisions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

OrderSide = Literal["buy", "sell"]
OrderAction = Literal["submit", "cancel", "hold"]
OrderType = Literal["limit", "market", "ioc", "fok", "gtc", "post-only", "reduce-only"]

ALLOWED_ORDER_TYPES: tuple[str, ...] = (
    "limit",
    "market",
    "ioc",
    "fok",
    "gtc",
    "post-only",
    "reduce-only",
)


@dataclass
class Snapshot:
    """Minimal order-book snapshot for the fixture dry-run."""

    bid_sizes: list[float] = field(default_factory=list)
    ask_sizes: list[float] = field(default_factory=list)


@dataclass
class MarketEvent:
    """Synthetic market data event for the fixture dry-run."""

    mid_price: float = 100.0
    last_price: float = 100.0
    timestamp_ms: int = 0
    side: str | None = None
    snapshot: Snapshot | None = None
    price_b: float | None = None


class StrategyBase:
    """Minimal strategy base: position/order bookkeeping for templates."""

    name: str = "base"
    description: str = "Template base class (not a runnable strategy)"

    def __init__(self, **kwargs) -> None:
        self.position: float = 0.0
        self.orders: list[dict] = []
        for key, value in kwargs.items():
            setattr(self, key, value)

    def submit_order(self, *, price: float, size: float, side: OrderSide, order_type: OrderType) -> dict:
        """Record an order and apply an immediate-fill position update.

        Fixture-harness simplification only: assumes the full size fills
        instantly so templates can complete a dry-run BACKTEST. Real
        backtests fill through the engine (Block 2.8).
        """
        if side not in ("buy", "sell"):
            raise ValueError(f"Invalid side: {side!r}")
        if order_type not in ALLOWED_ORDER_TYPES:
            raise ValueError(f"Invalid order_type: {order_type!r}")
        if size <= 0:
            raise ValueError(f"Order size must be positive, got {size!r}")
        order = {"price": price, "size": size, "side": side, "order_type": order_type}
        self.orders.append(order)
        if side == "buy":
            self.position += size
        else:
            self.position -= size
        return order

    def on_fill(self, fill_event) -> None:
        """Apply a fill event to the tracked position."""
        if isinstance(fill_event, dict):
            side = fill_event.get("side")
            size = fill_event.get("size", 0.0)
        else:
            side = getattr(fill_event, "side", None)
            size = getattr(fill_event, "size", 0.0)
        if side == "buy":
            self.position += size
        elif side == "sell":
            self.position -= size

    def on_market_event(self, event: MarketEvent) -> OrderAction:
        """React to a market event. Every template overrides this."""
        raise NotImplementedError
