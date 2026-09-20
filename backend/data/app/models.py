"""Data Pipeline service data models.

Mirror of the Block 2.1 PostgreSQL schema created by `scripts/migration`:
- `datasets` (`0002_datasets.sql`), grounded in `docs/13` §13.2 and
  `docs/05` §5.2–§5.3.
- `instrument_metadata` (`0007_instrument_metadata.sql`), grounded in
  `docs/05` §5.2.
- `DataQualityReport`, the canonical `docs/15` §15.5 interface stored inside
  `datasets.qualityReport`.

Field names match the spec interfaces literally (camelCase, `AGENTS.md` §2).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional, TypeAlias

from pydantic import BaseModel, Field

# docs/13 §13.2 — mirrors the pipeline stages exactly (docs/05 §5.2)
DatasetStatus: TypeAlias = Literal[
    "RAW", "VALIDATING", "NORMALIZING", "RECONSTRUCTING", "ALIGNING", "READY",
    "FAILED",
]

# docs/14 §14.3 / docs/15 §15.5 AlertRecord.severity (used by Data Quality rollup)
QualityStatus: TypeAlias = Literal["green", "yellow", "red"]


class DataQualityReport(BaseModel):
    """docs/15 §15.5 DataQualityReport — verbatim field names.

    Stored as `datasets.qualityReport` (JSONB); served by
    `GET /api/v1/datasets/{id}/quality` (docs/15 §15.2).
    """

    datasetId: str
    totalEvents: int
    trades: int
    orderBookUpdates: int
    snapshots: int
    missingIntervals: dict[str, Any]  # {count, status, ranges:[number, number][]}
    duplicateEvents: dict[str, Any]  # {count, status}
    sequenceGaps: dict[str, Any]  # {count, status}
    timestampRange: list[int]
    fileSizeBytes: int
    source: str
    normalizationVersion: str
    tickSize: float
    lotSize: float
    l3ActiveOrderCount: int = 0  # L3: count of active orders (backtest-only data type, docs/05 §5.4)


class Dataset(BaseModel):
    """`datasets` row — content-addressed per docs/05 §5.3."""

    datasetId: str
    exchange: str
    market: str
    symbol: str
    dateRangeStart: int
    dateRangeEnd: int
    source: str
    pipelineVersion: str
    format: str = "hftbacktest"
    status: DatasetStatus = "RAW"
    fileSizeBytes: int = 0
    qualityReport: Optional[DataQualityReport] = None


class InstrumentMetadata(BaseModel):
    """`instrument_metadata` row — cache for the Normalization stage (docs/05 §5.2)."""

    exchange: str
    market: str
    symbol: str
    tickSize: float
    lotSize: float
    updatedAt: datetime = Field(default_factory=datetime.utcnow)