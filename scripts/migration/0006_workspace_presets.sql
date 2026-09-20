-- 0006_workspace_presets.sql
-- Block 2.1, docs/16-implementation-roadmap.md.
-- Field names match the WorkspacePreset interface in
-- docs/15-api-and-data-model-spec.md §15.5 exactly: id, userId, name,
-- mainMonitorLayout, secondaryMonitorLayout. Preset default set per
-- docs/02-two-monitor-workspace-spec.md §2.5 (MARKET, RESEARCH, BACKTEST,
-- REPLAY, EXECUTION, PAPER, LIVE) or a custom string.

CREATE TABLE workspace_presets (
    id                     UUID PRIMARY KEY,
    userId                 TEXT NOT NULL DEFAULT 'local',
    name                   TEXT NOT NULL,
    mainMonitorLayout      JSONB NOT NULL DEFAULT '{}'::jsonb,
    secondaryMonitorLayout JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (userId, name)
);