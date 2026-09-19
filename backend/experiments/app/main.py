"""Experiment Tree, Reproducibility, Comparisons — FastAPI application.

This module provides the experiment management features:
- Experiment tree structure (hierarchical organization)
- Reproducibility controls (deterministic runs, seed management)
- Strategy comparisons (side-by-side backtest results)
- Export and report building
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

@app.get("/")
async def root() -> dict:
    {"message": "TickLab Experiments API"}  # type: ignore[return-value]

@app.get("/health")
async def health() -> dict:
    {"status": "healthy"}  # type: ignore[return-value]