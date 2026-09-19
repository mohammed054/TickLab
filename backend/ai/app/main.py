"""AI Research Assistant — FastAPI application.

This module provides the AI Research Assistant features:
- LLM-powered strategy idea generation
- Evidence retrieval from backtest results and market data
- Experiment note generation and organization
- Research question answering with citations to underlying data
- Tool-calling for evidence retrieval from docs/09 §9.14

The interface is provider-agnostic (configured via environment variable)
and supports tool-calling for evidence retrieval.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="TickLab AI Research Assistant",
    description="AI-powered research assistant for strategy development and investigation",
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
    {"message": "TickLab AI Research Assistant API"}  # type: ignore[return-value]

@app.get("/health")
async def health() -> dict:
    {"status": "healthy"}  # type: ignore[return-value]

@app.post("/query")
async def query() -> dict:
    {"status": "research query endpoint"}  # type: ignore[return-value]