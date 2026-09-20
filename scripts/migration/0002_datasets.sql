-- 0002_datasets.sql
-- Block 2.1, docs/16-implementation-roadmap.md.
-- Field names match docs/13-data-management-and-monitoring.md §13.2 (Data
-- Center row: Dataset | Exchange | Symbol | Market | Date range | Size |
-- Format | Status) and docs/05-engine-abstraction-and-data-pipeline.md §5.3
-- (content-addressed dataset_id). Status vocabulary mirrors the pipeline
-- stages exactly per docs/13 §13.2 ({RAW, VALIDATING, NORMALIZING,
-- RECONSTRUCTING, ALIGNING, READY, FAILED}). qualityReport carries the
-- DataQualityReport defined in docs/15 §15.5 verbatim.

CREATE TABLE datasets (
    datasetId       TEXT PRIMARY KEY,
    exchange        TEXT NOT NULL,
    market          TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    dateRangeStart  BIGINT NOT NULL,
    dateRangeEnd    BIGINT NOT NULL,
    source          TEXT NOT NULL,
    pipelineVersion TEXT NOT NULL,
    format          TEXT NOT NULL DEFAULT 'hftbacktest',
    status          TEXT NOT NULL DEFAULT 'RAW'
                    CHECK (status IN ('RAW', 'VALIDATING', 'NORMALIZING',
                                     'RECONSTRUCTING', 'ALIGNING', 'READY', 'FAILED')),
    fileSizeBytes   BIGINT NOT NULL DEFAULT 0,
    qualityReport   JSONB
);

CREATE INDEX idx_datasets_exchange_market_symbol
    ON datasets (exchange, market, symbol);