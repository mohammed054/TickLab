-- 0001_strategies.sql
-- Block 2.1, docs/16-implementation-roadmap.md.
-- Field names match docs/15-api-and-data-model-spec.md §15.5 (StrategyRef
-- {id, version, codeHash}), docs/08-secondary-monitor-components.md §8.3
-- (name/version/status/environment), docs/08 §8.4 (code), docs/08 §8.5
-- (templateId), docs/12-execution-modes-and-risk.md §12.5 (riskLimits) and
-- §12.1 (environment), and docs/10 §10.5.3 (description).

CREATE TABLE strategies (
    id             UUID PRIMARY KEY,
    name           TEXT NOT NULL,
    version        TEXT NOT NULL DEFAULT '1',
    codeHash       TEXT NOT NULL DEFAULT '',
    code           TEXT NOT NULL DEFAULT '',
    description    TEXT,
    templateId     TEXT,
    status         TEXT NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT', 'TESTING', 'BACKTESTED', 'VALIDATED',
                                    'PAPER', 'LIVE', 'PAUSED', 'STOPPED', 'ARCHIVED')),
    environment    TEXT NOT NULL DEFAULT 'RESEARCH'
                   CHECK (environment IN ('RESEARCH', 'PAPER', 'LIVE')),
    parameters     JSONB NOT NULL DEFAULT '{}'::jsonb,
    riskLimits     JSONB NOT NULL DEFAULT '{}'::jsonb,
    executionModel JSONB NOT NULL DEFAULT '{}'::jsonb,
    createdAt      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updatedAt      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_strategies_status ON strategies (status);
CREATE INDEX idx_strategies_name   ON strategies (name);