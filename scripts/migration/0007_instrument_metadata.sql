-- 0007_instrument_metadata.sql
-- Block 2.1, docs/16-implementation-roadmap.md.
-- Caches exchange metadata for the Normalization stage per
-- docs/05-engine-abstraction-and-data-pipeline.md §5.2 ("Normalizes tick
-- size and lot size per instrument (sourced from exchange metadata, cached in
-- Postgres instrument_metadata table)"). Identity (exchange, market, symbol)
-- follows the object-storage layout datasets/raw/{exchange}/{market}/{symbol}/
-- (docs/13-data-management-and-monitoring.md §13.1).

CREATE TABLE instrument_metadata (
    exchange  TEXT NOT NULL,
    market    TEXT NOT NULL,
    symbol    TEXT NOT NULL,
    tickSize  NUMERIC NOT NULL,
    lotSize   NUMERIC NOT NULL,
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (exchange, market, symbol)
);