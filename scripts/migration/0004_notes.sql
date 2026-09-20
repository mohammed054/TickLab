-- 0004_notes.sql
-- Block 2.1, docs/16-implementation-roadmap.md.
-- Field names match the Note interface in docs/15-api-and-data-model-spec.md
-- §15.5 exactly: id, targetType, targetId, body, authoredBy {agentType, id},
-- createdAt. The authoredBy composite is flattened to authoredByAgentType /
-- authoredById. Keyed by (targetType, targetId) per
-- docs/10-experiment-management-and-ai-research.md §10.4.

CREATE TABLE notes (
    id                  UUID PRIMARY KEY,
    targetType          TEXT NOT NULL
                        CHECK (targetType IN ('strategy', 'experiment', 'timestamp',
                                             'trade', 'fill', 'chart_view')),
    targetId            TEXT NOT NULL,
    body                TEXT NOT NULL,
    authoredByAgentType TEXT NOT NULL DEFAULT 'human'
                        CHECK (authoredByAgentType IN ('human', 'ai-assistant')),
    authoredById        TEXT NOT NULL DEFAULT '',
    createdAt           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_target    ON notes (targetType, targetId);
CREATE INDEX idx_notes_created_at ON notes (createdAt);