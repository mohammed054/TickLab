"""Execution strategy template.

A basic execution-focused strategy that demonstrates order submission
logic, including various order types (limit, market, IOC, FOK, GTC, post-only, reduce-only)
as enumerated in docs/08 §8.7 Execution Model.
"""

from typing import Literal
from ....engine.abstraction.hftbacktest_impl import StrategyBase, MarketEvent


class ExecutionStrategy(StrategyBase):
    """Execution-focused strategy demonstrating order type usage.

    Tests various order types defined in the execution model:
    Limit, Market, IOC, FOK, GTC, Post-only, Reduce-only
    """

    name: str = "execution"
    description: str = "Execution strategy demonstrating order type usage"

    # Parameters
    order_type: Literal["limit", "market", "ioc", "fok", "gtc", "post-only", "reduce-only"] = "limit"
    order_size: float = 0.1  # BTC
    ticker: str = "BTCUSDT"
    max_execution_time_bars: int = 10

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.bars_waiting: int = 0

    def on_market_event(self, event: MarketEvent) -> Literal["submit", "cancel", "hold"]:
        """React to market events and submit orders based on order_type.

        Args:
            event: The latest market data event

        Returns:
            Order action: "submit", "cancel", or "hold"
        """
        # Submit an order based on the configured order_type
        if self.bars_waiting == 0:
            side = "buy" if self.position < 0 else "sell"

            if self.order_type == "market":
                self.submit_order(
                    price=event.last_price,
                    size=self.order_size,
                    side=side,
                    order_type="market",
                )
            elif self.order_type == "limit":
                # Post limit at current mid price
                self.submit_order(
                    price=event.last_price,
                    size=self.order_size,
                    side=side,
                    order_type="limit",
                )
            elif self.order_type == "ioc":
                # Immediate-or-cancel: submit market order that fills or cancels
                self.submit_order(
                    price=event.last_price,
                    size=self.order_size,
                    side=side,
                    order_type="ioc",
                )
            elif self.order_type == "fok":
                # Fill-or-kill: must fill entire quantity or cancel
                self.submit_order(
                    price=event.last_price,
                    size=self.order_size,
                    side=side,
                    order_type="fok",
                )
            elif self.order_type == "gtc":
                # Good-'til-cancelled (will be handled by the job runner)
                self.submit_order(
                    price=event.last_price,
                    size=self.order_size,
                    side=side,
                    order_type="gtc",
                )
            elif self.order_type == "post-only":
                # Post-only: ensure order provides liquidity, not taker
                # Post one tick away from current best
                post_price = event.last_price + (0.1 if side == "buy" else -0.1)
                self.submit_order(
                    price=post_price,
                    size=self.order_size,
                    side=side,
                    order_type="post-only",
                )
            elif self.order_type == "reduce-only":
                # Reduce-only: only reduce existing position, never increase
                if (side == "buy" and self.position > 0) or (side == "sell" and self.position < 0):
                    self.submit_order(
                        price=event.last_price,
                        size=abs(self.position) if abs(self.position) < self.order_size else self.order_size,
                        side=side,
                        order_type="reduce-only",
                    )

        self.bars_waiting = (self.bars_waiting + 1) % self.max_execution_time_bars
        return "submit" if self.bars_waiting == 0 else "hold"