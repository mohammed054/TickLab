"""Data Pipeline module for TickLab.

Provides the data pipeline stages defined in docs/05 §5.2:
- Validation: Check dataset integrity and quality
- Normalization: Convert to internal format
- Order Book Reconstruction: Reconstruct order book from trade data
- Trade Alignment: Align trades with order book events
- Timestamp Validation: Ensure temporal consistency
- HftBacktest-format conversion: Convert to/from hftbacktest format
"""

from .main import (
    app,
    BacktestGateRequest,
    BacktestGateResponse,
    BacktestOverride,
    DataQualityReport,
    PipelineRequest,
    PipelineProgress,
)

__all__ = [
    "app",
    "BacktestGateRequest",
    "BacktestGateResponse",
    "BacktestOverride",
    "DataQualityReport",
    "PipelineRequest",
    "PipelineProgress",
]