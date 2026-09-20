-- 0005_alert_history.sql
-- Block 2.1, docs/16-implementation-roadmap.md.
-- Field names match the AlertRecord interface in
-- docs/15-api-and-data-model-spec.md §15.5 exactly: id, type, severity,
-- message, linkedView {path, params}, createdAt, acknowledged. Persisted per
-- docs/14-cross-cutting-systems.md §14.3 so the Alert Center doubles as a
-- historical record.

CREATE TABLE alert_history (
    id          UUID PRIMARY KEY,
    type        TEXT NOT NULL,
    severity    TEXT NOT NULL
                CHECK (severity IN ('info', 'warning', 'critical')),
    message     TEXT NOT NULL,
    linkedView  JSONB,
    createdAt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_alert_history_created_at   ON alert_history (createdAt);
CREATE INDEX idx_alert_history_acknowledged ON alert_history (acknowledged);