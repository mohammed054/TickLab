"""Arbitrage strategy template.

A basic spatial arbitrage strategy that profits from price
differences between exchanges or market segments.
"""

from typing import Literal

from ..parameter_schema import ParameterSchema
from .base import MarketEvent, StrategyBase

STRATEGY_NAME = "arbitrage"
STRATEGY_DESCRIPTION = "Spatial arbitrage: profit from price differences between markets"


class ArbitrageStrategy(StrategyBase):
    """Spatial arbitrage strategy.

    Profits from price differences between two markets or exchanges,
    executing simultaneous offsetting trades.
    """

    name: str = STRATEGY_NAME
    description: str = STRATEGY_DESCRIPTION

    # Parameters
    spread_threshold: float = 0.5  # minimum spread percentage
    order_size: float = 0.1  # BTC
    max_spread_pct: float = 5.0  # maximum acceptable spread
    execution_speed_tolerance_ms: int = 100  # max allowed time between legs

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.exchange_a: str = "binance"
        self.exchange_b: str = "bybit"
        self.last_execution_time: float = 0.0

    def on_market_event(self, event: MarketEvent) -> Literal["submit", "cancel", "hold"]:
        """React to market events for arbitrage opportunities.

        Args:
            event: The latest market data event (may contain prices from multiple exchanges)

        Returns:
            Order action: "submit", "cancel", or "hold"
        """
        # Get prices from both exchanges from the event
        price_a = event.last_price
        price_b = event.price_b if event.price_b is not None else price_a

        if price_b == 0:
            return "hold"

        # Calculate spread between the two markets
        spread_pct = abs(price_a - price_b) / ((price_a + price_b) / 2) * 100

        # Check if spread exceeds threshold
        if spread_pct < self.spread_threshold:
            return "hold"  # not enough spread

        # Check execution speed tolerance
        current_time = event.timestamp_ms / 1000.0  # convert to seconds
        if current_time - self.last_execution_time < self.execution_speed_tolerance_ms / 1000.0:
            return "hold"  # too soon after last execution

        # Execute arbitrage: buy at lower price, sell at higher price
        if price_a < price_b:
            # Buy on exchange A (lower), sell on exchange B (higher)
            self.submit_order(
                price=price_a,
                size=self.order_size,
                side="buy",
                order_type="limit",
            )
            self.submit_order(
                price=price_b,
                size=self.order_size,
                side="sell",
                order_type="limit",
            )
        else:
            # Buy on exchange B (lower), sell on exchange A (higher)
            self.submit_order(
                price=price_b,
                size=self.order_size,
                side="buy",
                order_type="limit",
            )
            self.submit_order(
                price=price_a,
                size=self.order_size,
                side="sell",
                order_type="limit",
            )

        self.last_execution_time = current_time
        return "submit"


PARAMETER_SCHEMA: list[dict] = [
    ParameterSchema(
        key="spread_threshold",
        label="Spread Threshold (%)",
        type="number",
        min=0.0,
        max=100.0,
        step=0.01,
        default=ArbitrageStrategy.spread_threshold,
        description="Minimum cross-market spread percent required to trade",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="order_size",
        label="Order Size (BTC)",
        type="number",
        min=0.001,
        max=100.0,
        step=0.001,
        default=ArbitrageStrategy.order_size,
        description="Base order size in BTC per leg",
        group="QUOTE",
    ).to_dict(),
    ParameterSchema(
        key="max_spread_pct",
        label="Max Spread (%)",
        type="number",
        min=0.0,
        max=100.0,
        step=0.1,
        default=ArbitrageStrategy.max_spread_pct,
        description="Maximum acceptable spread percent (wider spreads are skipped)",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="execution_speed_tolerance_ms",
        label="Execution Speed Tolerance (ms)",
        type="integer",
        min=0,
        max=60000,
        step=10,
        default=ArbitrageStrategy.execution_speed_tolerance_ms,
        description="Minimum ms between arbitrage executions",
        group="FILTERS",
    ).to_dict(),
]
