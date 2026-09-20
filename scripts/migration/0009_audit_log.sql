-- 0009_audit_log.sql
-- Block 2.1, docs/16-implementation-roadmap.md.
-- Append-only security/compliance log per
-- docs/14-cross-cutting-systems.md §14.5: "Every audit entry records:
-- timestamp, acting user/agent identity, action, and the specific
-- object/value affected." audit_log is never editable/deletable through the
-- normal application UI (§14.5).

CREATE TABLE audit_log (
    id             UUID PRIMARY KEY,
    timestamp      TIMESTAMPTZ NOT NULL DEFAULT now(),
    actorAgentType TEXT NOT NULL
                   CHECK (actorAgentType IN ('human', 'ai-assistant', 'system')),
    actorId        TEXT NOT NULL DEFAULT '',
    action         TEXT NOT NULL,
    objectType     TEXT,
    objectId       TEXT,
    details        JSONB
);

CREATE INDEX idx_audit_log_timestamp ON audit_log (timestamp);
CREATE INDEX idx_audit_log_action    ON audit_log (action);
CREATE INDEX idx_audit_log_actor     ON audit_log (actorAgentType, actorId);