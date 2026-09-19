"""Market Making strategy template.

A basic market-making strategy that provides liquidity via spread-based orders.
Uses parameters from the QUOTE group (docs/08 §8.6).
"""

from typing import Literal

from ..parameter_schema import ParameterSchema
from .base import MarketEvent, StrategyBase

STRATEGY_NAME = "market_making"
STRATEGY_DESCRIPTION = "Provides liquidity via spread-based orders"


class MarketMakingStrategy(StrategyBase):
    """Market making strategy that profits from the spread.

    Places bid/ask orders around the mid-price using the spread parameter.
    Manages inventory exposure using the inventory_limit and inventory_skew parameters.
    """

    name: str = STRATEGY_NAME
    description: str = STRATEGY_DESCRIPTION

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

        if self.inventory_skew > 0 and event.side == "buy":
            # We've been selling too much, widen ask
            ask_price = mid_price + self.spread / 2 * (1 + self.inventory_skew)
            bid_price = mid_price - self.spread / 2
        elif self.inventory_skew > 0 and event.side == "sell":
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


PARAMETER_SCHEMA: list[dict] = [
    ParameterSchema(
        key="spread",
        label="Spread (ticks)",
        type="number",
        min=0.0,
        max=1000.0,
        step=0.5,
        default=MarketMakingStrategy.spread,
        description="Minimum spread in ticks for order placement",
        group="QUOTE",
    ).to_dict(),
    ParameterSchema(
        key="order_size",
        label="Order Size (BTC)",
        type="number",
        min=0.001,
        max=100.0,
        step=0.001,
        default=MarketMakingStrategy.order_size,
        description="Base order size in BTC",
        group="QUOTE",
    ).to_dict(),
    ParameterSchema(
        key="requote_ms",
        label="Requote (ms)",
        type="integer",
        min=0,
        max=5000,
        step=10,
        default=MarketMakingStrategy.requote_ms,
        description="Maximum time in ms before requoting",
        group="QUOTE",
    ).to_dict(),
    ParameterSchema(
        key="inventory_limit",
        label="Inventory Limit (BTC)",
        type="number",
        min=0.0,
        max=500.0,
        step=0.1,
        default=MarketMakingStrategy.inventory_limit,
        description="Maximum inventory exposure in BTC",
        group="QUOTE",
    ).to_dict(),
    ParameterSchema(
        key="inventory_skew",
        label="Inventory Skew (0-1)",
        type="number",
        min=0.0,
        max=1.0,
        step=0.01,
        default=MarketMakingStrategy.inventory_skew,
        description="Inventory skew factor for asymmetric sizing",
        group="QUOTE",
    ).to_dict(),
]
