"""Experiment Tree, Reproducibility, Comparisons — FastAPI application.

This module provides the experiment management features:
- Experiment tree structure (hierarchical organization)
- Reproducibility controls (deterministic runs, seed management)
- Strategy comparisons (side-by-side backtest results)
- Export and report building
- Strategy template registry
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .parameter_schema import get_parameters_by_group, QUOTE_PARAMETERS, FILTERS_PARAMETERS
from .templates import (
    market_making,
    mean_reversion,
    momentum,
    order_book_imbalance,
    statistical_arbitrage,
    execution,
    arbitrage,
    custom,
)

app = FastAPI(
    title="TickLab Experiments",
    description="Experiment management, reproducibility, and comparisons",
    version="0.1.0",
)

# Allow all origins for development; restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Strategy template registry - maps template name to template class
TEMPLATE_REGISTRY = {
    "market_making": market_making.MarketMakingStrategy,
    "mean_reversion": mean_reversion.MeanReversionStrategy,
    "momentum": momentum.MomentumStrategy,
    "order_book_imbalance": order_book_imbalance.OrderBookImbalanceStrategy,
    "statistical_arbitrage": statistical_arbitrage.StatisticalArbitrageStrategy,
    "execution": execution.ExecutionStrategy,
    "arbitrage": arbitrage.ArbitrageStrategy,
    "custom": custom.CustomStrategy,
}


@app.get("/")
async def root() -> dict:
    {"message": "TickLab Experiments API"}  # type: ignore[return-value]

@app.get("/health")
async def health() -> dict:
    {"status": "healthy"}  # type: ignore[return-value]

@app.get("/templates")
async def list_templates() -> dict:
    """Return list of available strategy templates with their parameters."""
    return {
        "templates": [
            {
                "name": name,
                "description": cls.description,
                "parameters": [p.to_dict() for p in get_parameters_by_group(
                    {"market_making": "QUOTE", "mean_reversion": "FILTERS",
                     "momentum": "FILTERS", "order_book_imbalance": "QUOTE",
                     "statistical_arbitrage": "FILTERS", "execution": "QUOTE",
                     "arbitrage": "QUOTE", "custom": "UNGROUPED"}[name]]
                ),
            }
            for name, cls in TEMPLATE_REGISTRY.items()
        ]
    }

@app.get("/parameters/{group}")
async def get_parameters(group: str) -> dict:
    """Return all parameters for a given group."""
    group_map = {
        "QUOTE": QUOTE_PARAMETERS,
        "FILTERS": FILTERS_PARAMETERS,
    }
    params = group_map.get(group, [])
    return {"parameters": [p.to_dict() for p in params]}