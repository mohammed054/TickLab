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

from .parameter_schema import get_parameters_by_group
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

# Strategy template registry - maps template name to (module, class).
# Each template module exports STRATEGY_NAME, STRATEGY_DESCRIPTION, and
# PARAMETER_SCHEMA (Task 2.6, docs/08 §8.5-§8.6); the class exposes the
# matching `name`/`description` attributes and on_market_event entry point.
TEMPLATE_MODULES = (
    market_making,
    mean_reversion,
    momentum,
    order_book_imbalance,
    statistical_arbitrage,
    execution,
    arbitrage,
    custom,
)

TEMPLATE_REGISTRY = {mod.STRATEGY_NAME: mod for mod in TEMPLATE_MODULES}


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
                "name": mod.STRATEGY_NAME,
                "description": mod.STRATEGY_DESCRIPTION,
                "parameters": mod.PARAMETER_SCHEMA,
            }
            for mod in TEMPLATE_MODULES
        ]
    }

@app.get("/parameters/{group}")
async def get_parameters(group: str) -> dict:
    """Return all parameters for a given group."""
    params = get_parameters_by_group(group)
    return {"parameters": [p.to_dict() for p in params]}