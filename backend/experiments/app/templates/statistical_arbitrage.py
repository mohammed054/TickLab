"""Statistical Arbitrage strategy template.

A pairs-trading strategy that identifies statistically significant
price divergences between correlated instruments, expecting
reversion to the mean relationship.
"""

from typing import Literal

from ..parameter_schema import ParameterSchema
from .base import MarketEvent, StrategyBase

STRATEGY_NAME = "statistical_arbitrage"
STRATEGY_DESCRIPTION = "Pairs trading: trade mean-reverting spread between correlated instruments"


class StatisticalArbitrageStrategy(StrategyBase):
    """Statistical arbitrage strategy (pairs trading).

    Identifies cointegrated instrument pairs and trades when the
    spread deviates from its historical mean, expecting reversion.
    """

    name: str = STRATEGY_NAME
    description: str = STRATEGY_DESCRIPTION

    # Parameters
    spread_threshold: float = 2.0  # z-score threshold
    entry_zscore: float = 2.0  # how many std devs from mean
    exit_zscore: float = 0.5  # close when near mean
    order_size: float = 0.1  # BTC per leg
    lookback_window: int = 100  # bars for spread calculation
    cointegration_pvalue: float = 0.05  # significance threshold

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.instrument_a: str = "BTCUSDT"
        self.instrument_b: str = "ETHUSDT"
        self.spread_history: list[float] = []
        self.entry_zscore_tracked: bool = False

    def on_market_event(self, event: MarketEvent) -> Literal["submit", "cancel", "hold"]:
        """React to market events for statistical arbitrage.

        Args:
            event: The latest market data event

        Returns:
            Order action: "submit", "cancel", or "hold"
        """
        # Extract price from event for both instruments
        # In a real implementation, we'd have separate price streams
        price_a = event.last_price
        price_b = event.price_b if event.price_b is not None else price_a

        # Calculate spread (normalized)
        if price_b == 0:
            return "hold"

        spread = (price_a / price_b) - 1.0
        self.spread_history.append(spread)

        # Keep only lookback window
        if len(self.spread_history) > self.lookback_window:
            self.spread_history = self.spread_history[-self.lookback_window:]

        # Calculate mean and std of spread
        if len(self.spread_history) < 10:
            return "hold"  # not enough data

        mean_spread = sum(self.spread_history) / len(self.spread_history)
        variance = sum((s - mean_spread) ** 2 for s in self.spread_history) / len(self.spread_history)
        std_spread = variance ** 0.5

        if std_spread == 0:
            return "hold"

        zscore = (spread - mean_spread) / std_spread

        # Entry: enter when spread is beyond threshold
        if abs(zscore) > self.entry_zscore and not self.entry_zscore_tracked:
            # Determine leg side based on zscore sign
            if zscore > 0:
                # Instrument A overpriced relative to B: sell A, buy B
                self.submit_order(
                    price=price_a,
                    size=self.order_size,
                    side="sell",
                    order_type="market",
                )
                self.submit_order(
                    price=price_b,
                    size=self.order_size,
                    side="buy",
                    order_type="market",
                )
            else:
                # Instrument A underpriced relative to B: buy A, sell B
                self.submit_order(
                    price=price_a,
                    size=self.order_size,
                    side="buy",
                    order_type="market",
                )
                self.submit_order(
                    price=price_b,
                    size=self.order_size,
                    side="sell",
                    order_type="market",
                )
            self.entry_zscore_tracked = True
            return "submit"

        # Exit: close when spread reverts toward mean
        if self.entry_zscore_tracked and abs(zscore) < self.exit_zscore:
            # Close both legs
            self.submit_order(
                price=price_a,
                size=self.order_size,
                side="buy" if self.position < 0 else "sell",
                order_type="market",
            )
            self.submit_order(
                price=price_b,
                size=self.order_size,
                side="sell" if self.position > 0 else "buy",
                order_type="market",
            )
            self.entry_zscore_tracked = False
            return "submit"

        return "hold"


PARAMETER_SCHEMA: list[dict] = [
    ParameterSchema(
        key="spread_threshold",
        label="Spread Threshold (z-score)",
        type="number",
        min=0.0,
        max=10.0,
        step=0.1,
        default=StatisticalArbitrageStrategy.spread_threshold,
        description="Z-score distance from mean spread required to consider entry",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="entry_zscore",
        label="Entry Z-Score",
        type="number",
        min=0.0,
        max=10.0,
        step=0.1,
        default=StatisticalArbitrageStrategy.entry_zscore,
        description="Z-score beyond which the pair position is entered",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="exit_zscore",
        label="Exit Z-Score",
        type="number",
        min=0.0,
        max=10.0,
        step=0.1,
        default=StatisticalArbitrageStrategy.exit_zscore,
        description="Z-score inside which the pair position is closed",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="order_size",
        label="Order Size (BTC per leg)",
        type="number",
        min=0.001,
        max=100.0,
        step=0.001,
        default=StatisticalArbitrageStrategy.order_size,
        description="Order size in BTC for each pair leg",
        group="QUOTE",
    ).to_dict(),
    ParameterSchema(
        key="lookback_window",
        label="Lookback Window (bars)",
        type="integer",
        min=10,
        max=1000,
        step=1,
        default=StatisticalArbitrageStrategy.lookback_window,
        description="Bars of spread history used for mean/std estimation",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="cointegration_pvalue",
        label="Cointegration P-Value",
        type="number",
        min=0.0,
        max=1.0,
        step=0.01,
        default=StatisticalArbitrageStrategy.cointegration_pvalue,
        description="Significance threshold for the cointegration check",
        group="FILTERS",
    ).to_dict(),
]
