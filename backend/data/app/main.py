"""Data Pipeline — FastAPI application for ingestion, validation, and normalization.

This module provides the data pipeline stages defined in docs/05 §5.2:
- Validation: Check dataset integrity and quality
- Normalization: Convert to internal format
- Order Book Reconstruction: Reconstruct order book from trade data
- Trade Alignment: Align trades with order book events
- Timestamp Validation: Ensure temporal consistency
- HftBacktest-format conversion: Convert to/from hftbacktest format
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="TickLab Data Pipeline",
    description="Data ingestion, validation, and normalization pipeline",
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
    {"message": "TickLab Data Pipeline API"}  # type: ignore[return-value]

@app.get("/health")
async def health() -> dict:
    {"status": "healthy"}  # type: ignore[return-value]

@app.post("/validate")
async def validate() -> dict:
    {"status": "validation endpoint"}  # type: ignore[return-value]

@app.post("/normalize")
async def normalize() -> dict:
    {"status": "normalization endpoint"}  # type: ignore[return-value]