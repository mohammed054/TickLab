"""Strategy parameter schema format.

Finalized in Task 2.6A per docs/08-secondary-monitor-components.md §8.6.
Each parameter must carry at minimum: key, label, type, min, max, step, default, description, group.
"""

from __future__ import annotations
from typing import Literal

ParameterType = Literal["number", "integer", "string", "dropdown", "bool", "range"]

class ParameterSchema:
    """A single strategy parameter definition.

    Attributes:
        key: Unique identifier used in strategy code (e.g. "spread"): str
        label: Human-readable display name (e.g. "Spread (ticks)"): str
        type: Data type from ParameterType: ParameterType
        min: Minimum allowed value (optional for string/bool): float | None
        max: Maximum allowed value (optional for string/bool): float | None
        step: Increment step for number types (optional for string/bool): float | None
        default: Default value: float | int | str | bool
        description: Inline help text shown as tooltip: str
        group: UI grouping name, e.g. "QUOTE", "FILTERS": str
    """

    def __init__(
        self,
        *,
        key: str,
        label: str,
        type: ParameterType,
        min: float | int | None = None,
        max: float | int | None = None,
        step: float | int | None = None,
        default: float | int | str | bool = 0.0,
        description: str = "",
        group: str = "UNGROUPED",
    ) -> None:
        self.key = key
        self.label = label
        self.type = type
        self.min = min
        self.max = max
        self.step = step
        self.default = default
        self.description = description
        self.group = group

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization / API transmission."""
        return {
            "key": self.key,
            "label": self.label,
            "type": self.type,
            "min": self.min,
            "max": self.max,
            "step": self.step,
            "default": self.default,
            "description": self.description,
            "group": self.group,
        }


# Default parameter groupings per docs/08 §8.122 QUOTE group
QUOTE_PARAMETERS = [
    ParameterSchema(
        key="spread",
        label="Spread (ticks)",
        type="number",
        min=0.0,
        max=1000.0,
        step=0.5,
        default=1.0,
        description="Minimum spread in ticks for order placement",
        group="QUOTE",
    ),
    ParameterSchema(
        key="order_size",
        label="Order Size (BTC)",
        type="number",
        min=0.001,
        max=100.0,
        step=0.001,
        default=0.1,
        description="Base order size in BTC",
        group="QUOTE",
    ),
    ParameterSchema(
        key="requote_ms",
        label="Requote (ms)",
        type="integer",
        min=0,
        max=5000,
        step=10,
        default=100,
        description="Maximum time in ms before requoting",
        group="QUOTE",
    ),
    ParameterSchema(
        key="inventory_limit",
        label="Inventory Limit (BTC)",
        type="number",
        min=0.0,
        max=500.0,
        step=0.1,
        default=10.0,
        description="Maximum inventory exposure in BTC",
        group="QUOTE",
    ),
    ParameterSchema(
        key="inventory_skew",
        label="Inventory Skew (0-1)",
        type="number",
        min=0.0,
        max=1.0,
        step=0.01,
        default=0.0,
        description="Inventory skew factor for asymmetric sizing",
        group="QUOTE",
    ),
]

# FILTERS group per docs/08 §8.131
FILTERS_PARAMETERS = [
    ParameterSchema(
        key="min_spread",
        label="Min Spread (ticks)",
        type="number",
        min=0.0,
        max=1000.0,
        step=0.5,
        default=0.5,
        description="Minimum spread threshold for trade execution",
        group="FILTERS",
    ),
    ParameterSchema(
        key="max_volatility",
        label="Max Volatility",
        type="number",
        min=0.0,
        max=100.0,
        step=0.1,
        default=20.0,
        description="Maximum annualized volatility percentage",
        group="FILTERS",
    ),
    ParameterSchema(
        key="min_liquidity",
        label="Min Liquidity",
        type="number",
        min=0.0,
        max=1e6,
        step=100.0,
        default=1000.0,
        description="Minimum liquidity (order book depth) required",
        group="FILTERS",
    ),
    ParameterSchema(
        key="min_expected_edge",
        label="Min Expected Edge",
        type="number",
        min=0.0,
        max=1.0,
        step=0.001,
        default=0.01,
        description="Minimum expected edge (as decimal) for trade entry",
        group="FILTERS",
    ),
]


def get_parameters_by_group(group: str) -> list[ParameterSchema]:
    """Return all parameters belonging to a given group."""
    all_params = QUOTE_PARAMETERS + FILTERS_PARAMETERS
    return [p for p in all_params if p.group == group]