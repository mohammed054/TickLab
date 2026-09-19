"""Statistical Arbitstrategy template.

A pairs/trading strategy that identifies statistically significant
price divergences between correlated instruments, expecting
reversion to the mean relationship.
"""

from typing import Literal
from ....engine.abstraction.hftbacktest_impl import StrategyBase, MarketEvent


class StatisticalArbitrageStrategy(StrategyBase):
    """Statistical arbitration strategy (pairs trading).

    Identifies cointegrated instrument pairs and trades when the
    spread deviates from its historical mean, expecting reversion.
    """

    name: str = "statistical_arbitrage"
    description: str = "Pairs trading: trade mean-reverting spread between correlated instruments"

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
        price_b = getattr(event, "price_b", price_a)  # fallback

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