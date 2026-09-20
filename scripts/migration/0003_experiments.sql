-- 0003_experiments.sql
-- Block 2.1, docs/16-implementation-roadmap.md.
-- Field names match the Experiment interface in
-- docs/10-experiment-management-and-ai-research.md §10.1 (strategyRef
-- {id, version, codeHash}, parameters, datasetId, dateRange {start, end},
-- exchange/symbol/market, executionModel, riskLimits, randomSeed,
-- createdBy {agentType, id}, parentExperimentId, status). The nested
-- dateRange {start, end} composite is flattened to dateRangeStart /
-- dateRangeEnd (nanosecond epoch integers). status uses the §10.1
-- vocabulary {QUEUED, RUNNING, COMPLETE, FAILED, CANCELLED}. results
-- holds a BacktestResult per docs/15 §15.5 (camelCase keys preserved).

CREATE TABLE experiments (
    id                 UUID PRIMARY KEY,
    strategyId         UUID NOT NULL REFERENCES strategies(id) ON DELETE RESTRICT,
    version            TEXT NOT NULL,
    codeHash           TEXT NOT NULL,
    parameters         JSONB NOT NULL DEFAULT '{}'::jsonb,
    datasetId          TEXT NOT NULL,
    dateRangeStart     BIGINT NOT NULL,
    dateRangeEnd       BIGINT NOT NULL,
    exchange           TEXT NOT NULL,
    symbol             TEXT NOT NULL,
    market             TEXT NOT NULL,
    executionModel     JSONB NOT NULL DEFAULT '{}'::jsonb,
    riskLimits         JSONB NOT NULL DEFAULT '{}'::jsonb,
    randomSeed         BIGINT,
    createdAt          TIMESTAMPTZ NOT NULL DEFAULT now(),
    createdByAgentType TEXT NOT NULL DEFAULT 'human'
                       CHECK (createdByAgentType IN ('human', 'ai-assistant')),
    createdById        TEXT NOT NULL DEFAULT '',
    parentExperimentId UUID REFERENCES experiments(id) ON DELETE SET NULL,
    status             TEXT NOT NULL DEFAULT 'QUEUED'
                       CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETE',
                                        'FAILED', 'CANCELLED')),
    results            JSONB
);

CREATE INDEX idx_experiments_strategy_id ON experiments (strategyId);
CREATE INDEX idx_experiments_dataset_id  ON experiments (datasetId);
CREATE INDEX idx_experiments_created_at  ON experiments (createdAt);