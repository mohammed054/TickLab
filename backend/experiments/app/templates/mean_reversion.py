"""Mean Reversion strategy template.

A basic mean-reversion strategy that trades against extreme moves,
expecting price to return to the mean. Uses parameters for entry thresholds
and exit conditions.
"""

from typing import Literal
from ....engine.abstraction.hftbacktest_impl import StrategyBase, MarketEvent


class MeanReversionStrategy(StrategyBase):
    """Mean reversion strategy that trades price extremes.

    Enters positions when price deviates beyond the threshold,
    expecting reversal back toward the mean. Exit via take-profit
    or stop-loss levels.
    """

    name: str = "mean_reversion"
    description: str = "Trades against extreme moves, expecting reversal to mean"

    # Parameters
    entry_threshold: float = 2.0  # standard deviations
    exit_threshold: float = 0.5  # standard deviations
    order_size: float = 0.1  # BTC
    max_position: float = 10.0  # BTC
    stop_loss_pct: float = 2.0  # percent of entry price

    def on_market_event(self, event: MarketEvent) -> Literal["submit", "cancel", "hold"]:
        """React to market events and decide on order actions.

        Args:
            event: The latest market data event

        Returns:
            Order action: "submit", "cancel", or "hold"
        """
        # Calculate distance from mean (simplified)
        price = event.last_price
        mean_price = self._calculate_mean(price)

        deviation = (price - mean_price) / mean_price if mean_price != 0 else 0

        # If price is beyond entry threshold, take counter-position
        if abs(deviation) > self.entry_threshold:
            # Mean reversion: fade the move
            side = "sell" if deviation > 0 else "buy"
            self.submit_order(
                price=price,
                size=self.order_size,
                side=side,
                order_type="market",
            )
            return "submit"

        # If position is open and beyond exit threshold, close it
        if self.position > 0 and deviation > self.exit_threshold:
            self.submit_order(
                price=price,
                size=self.position,
                side="sell",
                order_type="market",
            )
            return "submit"
        if self.position < 0 and deviation < -self.exit_threshold:
            self.submit_order(
                price=price,
                size=abs(self.position),
                side="buy",
                order_type="market",
            )
            return "submit"

        return "hold"

    def _calculate_mean(self, price: float) -> float:
        """Simple mean calculation - in production would use rolling window."""
        # Placeholder: use last few prices from event stream
        return price  # simplified for template