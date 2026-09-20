-- 0008_user_chart_prefs.sql
-- Block 2.1, docs/16-implementation-roadmap.md.
-- Per-user chart preference persistence per docs/07-main-monitor-components.md
-- §7.2.4 ("Overlay visibility is per-user, persisted (...) user_chart_prefs").
-- overlays stores the toggleable overlay visibility flags from §7.2.4; settings
-- stores the remaining chart preferences (mode, colors, etc.).

CREATE TABLE user_chart_prefs (
    id        UUID PRIMARY KEY,
    userId    TEXT NOT NULL,
    symbol    TEXT NOT NULL,
    exchange  TEXT NOT NULL,
    overlays  JSONB NOT NULL DEFAULT '{}'::jsonb,
    settings  JSONB NOT NULL DEFAULT '{}'::jsonb,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT now(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (userId, symbol, exchange)
);