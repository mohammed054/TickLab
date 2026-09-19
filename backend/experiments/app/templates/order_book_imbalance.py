"""Order Book Imbalance strategy template.

A strategy that trades based on the imbalance between bid and ask side
of the order book, profiting from anticipated price movement toward
balance.
"""

from typing import Literal

from ..parameter_schema import ParameterSchema
from .base import MarketEvent, StrategyBase

STRATEGY_NAME = "order_book_imbalance"
STRATEGY_DESCRIPTION = "Trades based on order book bid/ask imbalance"


class OrderBookImbalanceStrategy(StrategyBase):
    """Order book imbalance strategy.

    Profits from persistent imbalances between bid and ask volume,
    expecting price to move toward equilibrium.
    """

    name: str = STRATEGY_NAME
    description: str = STRATEGY_DESCRIPTION

    # Parameters
    imbalance_threshold: float = 0.6  # ratio 0-1, threshold for imbalance
    order_size: float = 0.1  # BTC
    max_position: float = 5.0  # BTC
    imbalance_lookback: int = 10  # number of levels to check
    take_profit_pct: float = 0.5  # take profit percentage
    adverse_selection_pct: float = 0.2  # adverse selection filter

    def on_market_event(self, event: MarketEvent) -> Literal["submit", "cancel", "hold"]:
        """React to market depth events and decide on order actions.

        Args:
            event: The latest market depth/snapshot event

        Returns:
            Order action: "submit", "cancel", or "hold"
        """
        # Calculate imbalance: (ask_volume - bid_volume) / (ask_volume + bid_volume)
        snapshot = event.snapshot
        if snapshot is None:
            return "hold"

        total_bid = sum(snapshot.bid_sizes[: self.imbalance_lookback])
        total_ask = sum(snapshot.ask_sizes[: self.imbalance_lookback])

        if total_bid + total_ask == 0:
            return "hold"

        imbalance = (total_ask - total_bid) / (total_bid + total_ask)

        # Determine side based on imbalance sign
        if abs(imbalance) < self.imbalance_threshold:
            # Not enough imbalance to trade
            return "hold"

        side = "sell" if imbalance > 0 else "buy"

        # Check position limits
        if self.position > self.max_position and side == "buy":
            return "cancel"  # already long, don't add
        if self.position < -self.max_position and side == "sell":
            return "cancel"  # already short, don't add

        # Enter position on imbalance
        self.submit_order(
            price=event.mid_price,
            size=self.order_size,
            side=side,
            order_type="market",
        )

        return "submit"


PARAMETER_SCHEMA: list[dict] = [
    ParameterSchema(
        key="imbalance_threshold",
        label="Imbalance Threshold (0-1)",
        type="number",
        min=0.0,
        max=1.0,
        step=0.01,
        default=OrderBookImbalanceStrategy.imbalance_threshold,
        description="Minimum bid/ask volume imbalance ratio required to trade",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="order_size",
        label="Order Size (BTC)",
        type="number",
        min=0.001,
        max=100.0,
        step=0.001,
        default=OrderBookImbalanceStrategy.order_size,
        description="Base order size in BTC",
        group="QUOTE",
    ).to_dict(),
    ParameterSchema(
        key="max_position",
        label="Max Position (BTC)",
        type="number",
        min=0.0,
        max=500.0,
        step=0.1,
        default=OrderBookImbalanceStrategy.max_position,
        description="Maximum absolute position in BTC",
        group="QUOTE",
    ).to_dict(),
    ParameterSchema(
        key="imbalance_lookback",
        label="Imbalance Lookback (levels)",
        type="integer",
        min=1,
        max=50,
        step=1,
        default=OrderBookImbalanceStrategy.imbalance_lookback,
        description="Number of order-book levels included in the imbalance",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="take_profit_pct",
        label="Take Profit (%)",
        type="number",
        min=0.0,
        max=100.0,
        step=0.1,
        default=OrderBookImbalanceStrategy.take_profit_pct,
        description="Favorable percent move at which to take profit",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="adverse_selection_pct",
        label="Adverse Selection (%)",
        type="number",
        min=0.0,
        max=100.0,
        step=0.1,
        default=OrderBookImbalanceStrategy.adverse_selection_pct,
        description="Adverse-selection filter threshold in percent",
        group="FILTERS",
    ).to_dict(),
]
