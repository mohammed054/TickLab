-- 004_research_catalog.sql
-- Versioned research file catalog (docs/07-phases-and-tasks.md T2.1,
-- docs/09-research-system.md sec 9.3 storage layout, sec 9.5 data catalog).
-- Additive migration: preserves radar.db and every existing table/row.
--
-- Rules enforced here (docs/09 sec 9.3, 9.5):
--   * Raw/normalized files are never rewritten: data_files is append-only.
--   * A dataset version is an immutable, checksummed set of catalogued files.
--     Reprocessing writes a NEW dataset version; it never edits an old one.
--   * Source manifests record the exact files + checksums of one raw partition.
--
-- All timestamps are integer epoch milliseconds (same unit as the rest of radar.db).
-- `path` is always relative to <userData>/research/ and uses '/' separators.

CREATE TABLE data_files(
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,                      -- e.g. raw/provider=geckoterminal/date=2026-10-16/hour=14/part-0001.jsonl.gz
  layer TEXT NOT NULL CHECK(layer IN('raw','normalized')),
  source_id TEXT,                                 -- provider id; required for raw files
  entity TEXT,                                    -- normalized kind (trade, snapshot, ...); NULL for raw files
  partition_key TEXT NOT NULL,                    -- directory partition, e.g. provider=x/date=YYYY-MM-DD/hour=HH
  schema_version TEXT NOT NULL CHECK(length(schema_version) > 0),
  format TEXT NOT NULL CHECK(format IN('jsonl.gz','parquet')),
  byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
  row_count INTEGER NOT NULL CHECK(row_count >= 0),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  time_start INTEGER NOT NULL,                    -- earliest eventAt in file (epoch ms)
  time_end INTEGER NOT NULL,                      -- latest eventAt in file (epoch ms)
  registered_at INTEGER NOT NULL,
  CHECK(time_end >= time_start),
  CHECK(layer <> 'raw' OR (source_id IS NOT NULL AND entity IS NULL)),
  CHECK(layer <> 'normalized' OR entity IS NOT NULL)
);
CREATE INDEX idx_data_files_layer_part ON data_files(layer, partition_key);
CREATE INDEX idx_data_files_entity_time ON data_files(entity, time_start, time_end);
CREATE INDEX idx_data_files_source_time ON data_files(source_id, time_start, time_end);
CREATE INDEX idx_data_files_sha ON data_files(sha256);

-- One manifest per (source, partition, content): the exact file list + checksums.
CREATE TABLE source_manifests(
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256) = 64 AND manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  file_count INTEGER NOT NULL CHECK(file_count > 0),
  total_bytes INTEGER NOT NULL CHECK(total_bytes >= 0),
  created_at INTEGER NOT NULL,
  UNIQUE(source_id, partition_key, manifest_sha256)
);
CREATE TABLE source_manifest_files(
  manifest_id INTEGER NOT NULL REFERENCES source_manifests(id),
  data_file_id INTEGER NOT NULL REFERENCES data_files(id),
  PRIMARY KEY(manifest_id, data_file_id)
);
CREATE INDEX idx_manifest_files_file ON source_manifest_files(data_file_id);

-- Immutable normalized dataset versions. `fingerprint` is a deterministic sha256
-- over (entity, normalizer_version, schema_version, sorted member file sha256s),
-- so registering the same inputs twice is a no-op and any change in inputs or
-- normalizer produces a different version (docs/07 T2.5).
CREATE TABLE dataset_versions(
  id INTEGER PRIMARY KEY,
  version_id TEXT NOT NULL UNIQUE,                -- 'dsv_' + first 16 hex of fingerprint
  fingerprint TEXT NOT NULL UNIQUE CHECK(length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
  entity TEXT NOT NULL,
  normalizer_version TEXT NOT NULL CHECK(length(normalizer_version) > 0),
  schema_version TEXT NOT NULL CHECK(length(schema_version) > 0),
  file_count INTEGER NOT NULL CHECK(file_count > 0),
  row_count INTEGER NOT NULL CHECK(row_count >= 0),
  total_bytes INTEGER NOT NULL CHECK(total_bytes >= 0),
  time_start INTEGER NOT NULL,
  time_end INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK(time_end >= time_start)
);
CREATE INDEX idx_dataset_versions_entity ON dataset_versions(entity, created_at DESC);
CREATE TABLE dataset_version_files(
  dataset_version_id INTEGER NOT NULL REFERENCES dataset_versions(id),
  data_file_id INTEGER NOT NULL REFERENCES data_files(id),
  PRIMARY KEY(dataset_version_id, data_file_id)
);
CREATE INDEX idx_dataset_version_files_file ON dataset_version_files(data_file_id);

-- ===== append-only / immutability enforcement =====
CREATE TRIGGER data_files_no_update BEFORE UPDATE ON data_files BEGIN SELECT RAISE(ABORT,'append-only table'); END;
CREATE TRIGGER data_files_no_delete BEFORE DELETE ON data_files BEGIN SELECT RAISE(ABORT,'append-only table'); END;
CREATE TRIGGER source_manifests_no_update BEFORE UPDATE ON source_manifests BEGIN SELECT RAISE(ABORT,'append-only table'); END;
CREATE TRIGGER source_manifests_no_delete BEFORE DELETE ON source_manifests BEGIN SELECT RAISE(ABORT,'append-only table'); END;
CREATE TRIGGER source_manifest_files_no_update BEFORE UPDATE ON source_manifest_files BEGIN SELECT RAISE(ABORT,'append-only table'); END;
CREATE TRIGGER source_manifest_files_no_delete BEFORE DELETE ON source_manifest_files BEGIN SELECT RAISE(ABORT,'append-only table'); END;
CREATE TRIGGER dataset_versions_no_update BEFORE UPDATE ON dataset_versions BEGIN SELECT RAISE(ABORT,'append-only table'); END;
CREATE TRIGGER dataset_versions_no_delete BEFORE DELETE ON dataset_versions BEGIN SELECT RAISE(ABORT,'append-only table'); END;
CREATE TRIGGER dataset_version_files_no_update BEFORE UPDATE ON dataset_version_files BEGIN SELECT RAISE(ABORT,'append-only table'); END;
CREATE TRIGGER dataset_version_files_no_delete BEFORE DELETE ON dataset_version_files BEGIN SELECT RAISE(ABORT,'append-only table'); END;
