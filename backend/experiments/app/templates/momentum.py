"""Momentum strategy template.

A momentum strategy that rides trending moves, entering on breakout
and exiting when momentum flags or reverses.
"""

from typing import Literal
from ....engine.abstraction.hftbacktest_impl import StrategyBase, MarketEvent


class MomentumStrategy(StrategyBase):
    """Momentum strategy that rides trending moves.

    Enters on breakout of a price range/volume threshold,
    holds while momentum is positive, exits on reversal.
    """

    name: str = "momentum"
    description: str = "Rides trending moves, entering on breakout"

    # Parameters
    lookback_period: int = 20
    entry_threshold: float = 0.0  # percent change from lookback low/high
    exit_threshold: float = 0.5  # percent change from entry
    order_size: float = 0.1  # BTC
    max_hold_bars: int = 50
    trailing_stop_pct: float = 1.0  # percent trailing stop

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.breakout_high: float | None = None
        self.breakout_low: float | None = None
        self.entry_price: float | None = None
        self.bars_since_entry: int = 0

    def on_market_event(self, event: MarketEvent) -> Literal["submit", "cancel", "hold"]:
        """React to market events and decide on order actions.

        Args:
            event: The latest market data event

        Returns:
            Order action: "submit", "cancel", or "hold"
        """
        price = event.last_price

        # Initial breakout detection
        if self.breakout_high is None or self.breakout_low is None:
            # Use event window to establish range
            self.breakout_high = max(self.breakout_high or price, price)
            self.breakout_low = min(self.breakout_low or price, price)

        # Check for breakout
        if price > self.breakout_high:
            # Bullish breakout
            self.breakout_high = price
            self.entry_price = price
            self.bars_since_entry = 0
            self.submit_order(
                price=price,
                size=self.order_size,
                side="buy",
                order_type="market",
            )
            return "submit"
        elif price < self.breakout_low:
            # Bearish breakout
            self.breakout_low = price
            self.entry_price = price
            self.bars_since_entry = 0
            self.submit_order(
                price=price,
                size=self.order_size,
                side="sell",
                order_type="market",
            )
            return "submit"

        # Check exit conditions
        if self.entry_price is not None:
            pct_change = (price - self.entry_price) / self.entry_price if self.entry_price != 0 else 0

            # Take profit or trailing stop
            if pct_change > self.exit_threshold:
                self.submit_order(
                    price=price,
                    size=self.order_size,
                    side="sell" if self.position > 0 else "buy",
                    order_type="market",
                )
                return "submit"

            # Trailing stop
            if self.position > 0 and pct_change < -self.trailing_stop_pct:
                self.submit_order(
                    price=price,
                    size=self.order_size,
                    side="sell",
                    order_type="market",
                )
                return "submit"
            if self.position < 0 and pct_change > self.trailing_stop_pct:
                self.submit_order(
                    price=price,
                    size=self.order_size,
                    side="buy",
                    order_type="market",
                )
                return "submit"

        self.bars_since_entry += 1
        if self.bars_since_entry >= self.max_hold_bars:
            # Force close after max hold time
            self.submit_order(
                price=price,
                size=self.position,
                side="sell" if self.position > 0 else "buy",
                order_type="market",
            )
            self.bars_since_entry = 0
            return "submit"

        return "hold"