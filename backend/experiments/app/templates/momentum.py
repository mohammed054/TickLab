"""Momentum strategy template.

A momentum strategy that rides trending moves, entering on breakout
and exiting when momentum flags or reverses.
"""

from typing import Literal

from ..parameter_schema import ParameterSchema
from .base import MarketEvent, StrategyBase

STRATEGY_NAME = "momentum"
STRATEGY_DESCRIPTION = "Rides trending moves, entering on breakout"


class MomentumStrategy(StrategyBase):
    """Momentum strategy that rides trending moves.

    Enters on breakout of a price range/volume threshold,
    holds while momentum is positive, exits on reversal.
    """

    name: str = STRATEGY_NAME
    description: str = STRATEGY_DESCRIPTION

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
        if self.bars_since_entry >= self.max_hold_bars and self.position != 0:
            # Force close after max hold time
            self.submit_order(
                price=price,
                size=abs(self.position),
                side="sell" if self.position > 0 else "buy",
                order_type="market",
            )
            self.bars_since_entry = 0
            return "submit"

        return "hold"


PARAMETER_SCHEMA: list[dict] = [
    ParameterSchema(
        key="lookback_period",
        label="Lookback Period (bars)",
        type="integer",
        min=1,
        max=500,
        step=1,
        default=MomentumStrategy.lookback_period,
        description="Number of bars used to establish the breakout range",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="entry_threshold",
        label="Entry Threshold (% move)",
        type="number",
        min=0.0,
        max=100.0,
        step=0.1,
        default=MomentumStrategy.entry_threshold,
        description="Percent change from range edge required to enter",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="exit_threshold",
        label="Exit Threshold (% move)",
        type="number",
        min=0.0,
        max=100.0,
        step=0.1,
        default=MomentumStrategy.exit_threshold,
        description="Percent change from entry at which to take profit",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="order_size",
        label="Order Size (BTC)",
        type="number",
        min=0.001,
        max=100.0,
        step=0.001,
        default=MomentumStrategy.order_size,
        description="Base order size in BTC",
        group="QUOTE",
    ).to_dict(),
    ParameterSchema(
        key="max_hold_bars",
        label="Max Hold (bars)",
        type="integer",
        min=1,
        max=1000,
        step=1,
        default=MomentumStrategy.max_hold_bars,
        description="Maximum bars to hold before force-closing",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="trailing_stop_pct",
        label="Trailing Stop (%)",
        type="number",
        min=0.0,
        max=100.0,
        step=0.1,
        default=MomentumStrategy.trailing_stop_pct,
        description="Adverse percent move from entry that triggers exit",
        group="FILTERS",
    ).to_dict(),
]
