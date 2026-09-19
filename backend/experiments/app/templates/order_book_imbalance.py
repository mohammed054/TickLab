"""Order Book Imbalance strategy template.

A strategy that trades based on the imbalance between bid and ask side
of the order book, profiting from anticipated price movement toward
balance.
"""

from typing import Literal
from ....engine.abstraction.hftbacktest_impl import StrategyBase, MarketEvent


class OrderBookImbalanceStrategy(StrategyBase):
    """Order book imbalance strategy.

    Profits from persistent imbalances between bid and ask volume,
    expecting price to move toward equilibrium.
    """

    name: str = "order_book_imbalance"
    description: str = "Trades based on order book bid/ask imbalance"

    # Parameters
    imbalance_threshold: float = 0.6  # ratio 0-1, threshold for imbalance
    order_size: float = 0.1  # BTC
    max_position: float = 5.0  # BTC
    imbalance_lookback: int = 10  # number of levels to check
    take_profit_pct: float = 0.5  % take profit percentage
    adverse_selection_pct: float = 0.2  % adverse selection filter

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