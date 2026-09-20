"""Experiment Store data models.

Mirror of the Block 2.1 PostgreSQL schema created by
`scripts/migration/*.sql`, grounded in the interfaces in
`docs/15-api-and-data-model-spec.md` §15.5 and
`docs/10-experiment-management-and-ai-research.md` §10.1.

Field names are camelCase to match the spec interfaces **literally**
(`AGENTS.md` §2; Block 2.1 acceptance bar in `docs/16`). The strategy's declared
parameter schema (§8.6) intentionally lives in the strategy code's exported
`PARAMETER_SCHEMA`, not in Postgres, so no `parameterSchema` column exists here.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional, TypeAlias

from pydantic import BaseModel, Field

AgentType: TypeAlias = Literal["human", "ai-assistant"]
Environment: TypeAlias = Literal["RESEARCH", "PAPER", "LIVE"]
# docs/08 §8.3 and docs/12 §12.6
StrategyStatus: TypeAlias = Literal[
    "DRAFT", "TESTING", "BACKTESTED", "VALIDATED", "PAPER", "LIVE",
    "PAUSED", "STOPPED", "ARCHIVED",
]
# docs/10 §10.1
ExperimentStatus: TypeAlias = Literal[
    "QUEUED", "RUNNING", "COMPLETE", "FAILED", "CANCELLED",
]
# docs/15 §15.5 Note.targetType
NoteTargetType: TypeAlias = Literal[
    "strategy", "experiment", "timestamp", "trade", "fill", "chart_view",
]
# docs/15 §15.5 AlertRecord.severity
AlertSeverity: TypeAlias = Literal["info", "warning", "critical"]
# docs/14 §14.5 ("acting user/agent identity" — 'system' added for risk/
#   emergency-stop actors, see docs/12 §12.5 emergencyStopEnabled / §12.8)
AuditActorType: TypeAlias = Literal["human", "ai-assistant", "system"]


class Strategy(BaseModel):
    """`strategies` row. Status graph enforced server-side per docs/12 §12.6."""

    id: str
    name: str
    version: str = "1"
    codeHash: str = ""
    code: str = ""
    description: Optional[str] = None
    templateId: Optional[str] = None
    status: StrategyStatus = "DRAFT"
    environment: Environment = "RESEARCH"
    parameters: dict[str, Any] = Field(default_factory=dict)
    riskLimits: dict[str, Any] = Field(default_factory=dict)  # docs/12 §12.5
    executionModel: dict[str, Any] = Field(default_factory=dict)  # docs/10 §10.1
    createdAt: datetime
    updatedAt: datetime


class Experiment(BaseModel):
    """`experiments` row — immutable reproduction record per docs/10 §10.1–§10.3.

    `results` holds a `BacktestResult` per `docs/15` §15.5 (jobId, experimentId,
    engineVersion, headline, recorderSeriesRef, fineGrainedEventsRef).
    """

    id: str
    strategyId: str
    version: str
    codeHash: str
    parameters: dict[str, Any]
    datasetId: str
    dateRangeStart: int
    dateRangeEnd: int
    exchange: str
    symbol: str
    market: str
    executionModel: dict[str, Any]
    riskLimits: dict[str, Any]
    randomSeed: Optional[int] = None
    createdAt: datetime
    createdByAgentType: AgentType = "human"
    createdById: str = ""
    parentExperimentId: Optional[str] = None
    status: ExperimentStatus = "QUEUED"
    results: Optional[dict[str, Any]] = None


class Note(BaseModel):
    """`notes` row. Keyed by (targetType, targetId) per docs/10 §10.4."""

    id: str
    targetType: NoteTargetType
    targetId: str
    body: str
    authoredByAgentType: AgentType = "human"
    authoredById: str = ""
    createdAt: datetime


class AlertRecord(BaseModel):
    """`alert_history` row per docs/15 §15.5 and docs/14 §14.3."""

    id: str
    type: str
    severity: AlertSeverity
    message: str
    linkedView: Optional[dict[str, Any]] = None  # {path, params}
    createdAt: datetime
    acknowledged: bool = False


class WorkspacePreset(BaseModel):
    """`workspace_presets` row per docs/15 §15.5 (preset set in docs/02 §2.5)."""

    id: str
    userId: str = "local"
    name: str
    mainMonitorLayout: dict[str, Any] = Field(default_factory=dict)
    secondaryMonitorLayout: dict[str, Any] = Field(default_factory=dict)


class UserChartPrefs(BaseModel):
    """`user_chart_prefs` row per docs/07 §7.2.4 (per-user overlay visibility)."""

    id: str
    userId: str
    symbol: str
    exchange: str
    overlays: dict[str, Any] = Field(default_factory=dict)
    settings: dict[str, Any] = Field(default_factory=dict)
    createdAt: datetime
    updatedAt: datetime


class AuditLogEntry(BaseModel):
    """`audit_log` row per docs/14 §14.5 — append-only, never editable via UI."""

    id: str
    timestamp: datetime
    actorAgentType: AuditActorType
    actorId: str = ""
    action: str
    objectType: Optional[str] = None
    objectId: Optional[str] = None
    details: Optional[dict[str, Any]] = None