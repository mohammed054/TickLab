"""Market Making strategy template.

A basic market-making strategy that provides liquidity via spread-based orders.
Uses parameters from the QUOTE group (§8.6).
"""

from typing import Literal
from ....engine.abstraction.hftbacktest_impl import StrategyBase, MarketEvent


class MarketMakingStrategy(StrategyBase):
    """Market making strategy that profits from the spread.

    Places bid/ask orders around the mid-price using the spread parameter.
    Manages inventory exposure using the inventory_limit and inventory_skew parameters.
    """

    name: str = "market_making"
    description: str = "Provides liquidity via spread-based orders"

    # Parameters from the QUOTE group (see parameter_schema.py)
    spread: float = 1.0  # ticks
    order_size: float = 0.1  # BTC
    requote_ms: int = 100  # milliseconds
    inventory_limit: float = 10.0  # BTC
    inventory_skew: float = 0.0  # 0-1

    def on_market_event(self, event: MarketEvent) -> Literal["submit", "cancel", "hold"]:
        """React to market events and decide on order actions.

        Args:
            event: The latest market depth/snapshot event

        Returns:
            One of: "submit" (place new orders), "cancel" (cancel existing), "hold" (do nothing)
        """
        # Simple market making: post orders at mid +/- spread/2
        # Inventory-aware: widen spread on one side based on skew
        mid_price = event.mid_price

        if inventory_skew > 0 and event.side == "buy":
            # We've been selling too much, widen ask
            ask_price = mid_price + self.spread / 2 * (1 + self.inventory_skew)
            bid_price = mid_price - self.spread / 2
        elif inventory_skew > 0 and event.side == "sell":
            # We've been buying too much, widen bid
            bid_price = mid_price - self.spread / 2 * (1 - self.inventory_skew)
            ask_price = mid_price + self.spread / 2
        else:
            bid_price = mid_price - self.spread / 2
            ask_price = mid_price + self.spread / 2

        # Submit bid and ask orders
        self.submit_order(
            price=bid_price,
            size=self.order_size,
            side="buy",
            order_type="limit",
        )
        self.submit_order(
            price=ask_price,
            size=self.order_size,
            side="sell",
            order_type="limit",
        )

        return "submit"

    def on_fill(self, fill_event) -> None:
        """Handle order fills to update inventory tracking."""
        # Track inventory changes from fills
        super().on_fill(fill_event)