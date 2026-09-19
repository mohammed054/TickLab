"""Custom strategy template.

A skeleton template that users can customize with their own parameters
and logic. This is the default template when no specific template is selected.
"""

from typing import Literal

from ..parameter_schema import ParameterSchema
from .base import MarketEvent, StrategyBase

STRATEGY_NAME = "custom"
STRATEGY_DESCRIPTION = "Custom strategy - starting point for user-defined strategies"


class CustomStrategy(StrategyBase):
    """Custom strategy template - starting point for user strategies.

    Users should override the parameter defaults and on_market_event
    method to implement their own strategy logic.
    """

    name: str = STRATEGY_NAME
    description: str = STRATEGY_DESCRIPTION

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


PARAMETER_SCHEMA: list[dict] = [
    ParameterSchema(
        key="custom_param_1",
        label="Custom Param 1",
        type="number",
        min=0.0,
        max=1000.0,
        step=0.1,
        default=CustomStrategy.custom_param_1,
        description="User-defined parameter 1 (override me)",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="custom_param_2",
        label="Custom Param 2",
        type="number",
        min=0.0,
        max=1000.0,
        step=0.1,
        default=CustomStrategy.custom_param_2,
        description="User-defined parameter 2 (override me)",
        group="FILTERS",
    ).to_dict(),
    ParameterSchema(
        key="order_size",
        label="Order Size (BTC)",
        type="number",
        min=0.001,
        max=100.0,
        step=0.001,
        default=CustomStrategy.order_size,
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
        default=CustomStrategy.max_position,
        description="Maximum absolute position in BTC",
        group="QUOTE",
    ).to_dict(),
]
