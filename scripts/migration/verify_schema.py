#!/usr/bin/env python3
"""verify_schema.py — literal diff-check of the Block 2.1 Postgres DDL against the
spec (AGENTS.md §2 and the Block 2.1 acceptance bar in
docs/16-implementation-roadmap.md: "every field name matches §15.5 exactly (a
literal diff-check against the doc)").

Reads every NNNN_*.sql migration in scripts/migration/, extracts the columns each
CREATE TABLE declares, and asserts they equal the field names transcribed below
from the spec docs (each entry cites its source section). Pure stdlib — no
dependencies.

Exit code 0 == PASS, 1 == FAIL (deviations printed).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MIGRATION_DIR = Path(__file__).resolve().parent

# Field sources (camelCase on purpose — the Postgres column names must match the
# spec interfaces/field lists verbatim):
#   strategies          docs/15 §15.5 StrategyRef {id, version, codeHash};
#                       docs/08 §8.3 (name/status/environment); §8.4 (code);
#                       §8.5 (templateId); docs/12 §12.5 riskLimits; §12.1 env;
#                       docs/10 §10.5.3 description.
#   experiments         docs/10 §10.1 Experiment interface (strategyRef flattened
#                       to strategyId/version/codeHash; dateRange flattened to
#                       dateRangeStart/dateRangeEnd; createdBy flattened to
#                       createdByAgentType/createdById).
#   datasets            docs/13 §13.2 (Data Center columns: Dataset/Exchange/
#                       Symbol/Market/Date range/Size/Format/Status) + docs/05
#                       §5.3 dataset_id; pipelineVersion from docs/05 §5.2;
#                       qualityReport carries the §15.5 DataQualityReport.
#   notes               docs/15 §15.5 Note interface (authoredBy flattened).
#   alert_history       docs/15 §15.5 AlertRecord interface (linkedView flattened
#                       to a single JSONB of {path, params}).
#   workspace_presets   docs/15 §15.5 WorkspacePreset interface.
#   instrument_metadata docs/05 §5.2 (tickSize/lotSize from exchange metadata);
#                       identity (exchange, market, symbol) per docs/13 §13.1.
#   user_chart_prefs    docs/07 §7.2.4 (per-user overlay visibility; settings is
#                       the chart-prefs remainder).
#   audit_log           docs/14 §14.5 (timestamp, actor identity, action, affected
#                       object/value).
EXPECTED = {
    "strategies": {
        "id", "name", "version", "codeHash", "code", "description", "templateId",
        "status", "environment", "parameters", "riskLimits", "executionModel",
        "createdAt", "updatedAt",
    },
    "datasets": {
        "datasetId", "exchange", "market", "symbol", "dateRangeStart",
        "dateRangeEnd", "source", "pipelineVersion", "format", "status",
        "fileSizeBytes", "qualityReport",
    },
    "experiments": {
        "id", "strategyId", "version", "codeHash", "parameters", "datasetId",
        "dateRangeStart", "dateRangeEnd", "exchange", "symbol", "market",
        "executionModel", "riskLimits", "randomSeed", "createdAt",
        "createdByAgentType", "createdById", "parentExperimentId", "status",
        "results",
    },
    "notes": {
        "id", "targetType", "targetId", "body", "authoredByAgentType",
        "authoredById", "createdAt",
    },
    "alert_history": {
        "id", "type", "severity", "message", "linkedView", "createdAt",
        "acknowledged",
    },
    "workspace_presets": {
        "id", "userId", "name", "mainMonitorLayout", "secondaryMonitorLayout",
    },
    "instrument_metadata": {"exchange", "market", "symbol", "tickSize", "lotSize", "updatedAt"},
    "user_chart_prefs": {
        "id", "userId", "symbol", "exchange", "overlays", "settings", "createdAt",
        "updatedAt",
    },
    "audit_log": {
        "id", "timestamp", "actorAgentType", "actorId", "action", "objectType",
        "objectId", "details",
    },
}

TABLE_CONSTRAINT_KEYWORDS = {"primary", "unique", "constraint", "foreign", "check", "references"}


def split_top_level(body: str) -> list[str]:
    """Split a table body on top-level commas (ignoring parens and quotes)."""
    parts = []
    depth = 0
    in_single = False
    cur = []
    for ch in body:
        if in_single:
            cur.append(ch)
            if ch == "'":
                in_single = False
            continue
        if ch == "'":
            in_single = True
            cur.append(ch)
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            parts.append("".join(cur).strip())
            cur = []
            continue
        cur.append(ch)
    parts.append("".join(cur).strip())
    return parts


def parse_create_tables(sql_text: str) -> dict[str, set[str]]:
    tables: dict[str, set[str]] = {}
    for match in re.finditer(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(", sql_text, re.I):
        name = match.group(1)
        depth = 1
        i = match.end()
        while i < len(sql_text) and depth > 0:
            if sql_text[i] == "(":
                depth += 1
            elif sql_text[i] == ")":
                depth -= 1
            i += 1
        body = sql_text[match.end(): i - 1]
        columns: set[str] = set()
        for chunk in split_top_level(body):
            first = chunk.split(None, 1)[0].lower() if chunk else ""
            if first in TABLE_CONSTRAINT_KEYWORDS:
                continue
            columns.add(chunk.split(None, 1)[0])
        tables[name] = columns
    return tables


def main() -> int:
    migrations = sorted(
        p for p in MIGRATION_DIR.glob("[0-9][0-9][0-9][0-9]_*.sql")
    )
    if not migrations:
        print("FAIL: no NNNN_*.sql migrations found", file=sys.stderr)
        return 1

    failures = 0
    declared: dict[str, set[str]] = {}
    for path in migrations:
        declared.update(parse_create_tables(path.read_text(encoding="utf-8")))

    actual_tables = set(declared)
    expected_tables = set(EXPECTED)
    if actual_tables != expected_tables:
        failures += 1
        missing = sorted(expected_tables - actual_tables)
        extra = sorted(actual_tables - expected_tables)
        if missing:
            print(f"FAIL: tables missing from migrations: {missing}")
        if extra:
            print(f"FAIL: unexpected tables in migrations: {extra}")

    for table, expected_cols in sorted(EXPECTED.items()):
        actual_cols = declared.get(table, set())
        missing_cols = sorted(expected_cols - actual_cols)
        extra_cols = sorted(actual_cols - expected_cols)
        if missing_cols or extra_cols:
            failures += 1
            print(f"FAIL: {table}")
            if missing_cols:
                print(f"  expected but missing: {missing_cols}")
            if extra_cols:
                print(f"  present but not in spec: {extra_cols}")
        else:
            print(f"PASS: {table} ({len(actual_cols)} columns)")

    if failures:
        print(f"\nFAIL: {failures} deviation(s) against docs/15 §15.5 and the "
              "referenced spec sections.")
        return 1
    print("\nPASS: all table/column names match the spec exactly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())