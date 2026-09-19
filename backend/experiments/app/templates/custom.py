"""Custom strategy template.

A skeleton template that users can customize with their own parameters
and logic. This is the default template when no specific template is selected.
"""

from typing import Literal
from ....engine.abstraction.hftbacktest_impl import StrategyBase, MarketEvent


class CustomStrategy(StrategyBase):
    """Custom strategy template - starting point for user strategies.

    Users should override the parameter defaults and on_market_event
    method to implement their own strategy logic.
    """

    name: str = "custom"
    description: str = "Custom strategy - starting point for user-defined strategies"

    # Default parameters - users should override these
    custom_param_1: float = 1.0
    custom_param_2: float = 0.5
    order_size: float = 0.1  # BTC
    max_position: float = 10.0  # BTC

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Initialize any custom state here
        self.custom_state: dict = {}

    def on_market_event(self, event: MarketEvent) -> Literal["submit", "cancel", "hold"]:
        """React to market events with custom logic.

        Users should override this method with their own strategy logic.
        The default implementation does nothing (holds).

        Args:
            event: The latest market data event

        Returns:
            Order action: "submit", "cancel", or "hold"
        """
        # Default: do nothing (hold)
        # Users should implement their own logic here
        return "hold"

    def on_fill(self, fill_event) -> None:
        """Handle order fills for custom strategy state updates.

        Args:
            fill_event: The fill event from an executed order
        """
        # Update custom state based on fills
        super().on_fill(fill_event)