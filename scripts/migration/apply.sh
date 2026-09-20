#!/bin/sh
# apply.sh — POSIX counterpart of apply.ps1: apply pending SQL migrations to the
# TickLab Postgres database via the docker-compose `postgres:16` service.
#
# Usage (from any directory; the script resolves the repo root):
#   scripts/migration/apply.sh
# Optional env overrides: TICKLAB_DB_USER, TICKLAB_DB_NAME (defaults: ticklab).

set -eu

DB_USER="${TICKLAB_DB_USER:-ticklab}"
DB_NAME="${TICKLAB_DB_NAME:-ticklab}"

REPO_ROOT="$(CDPATH= cd "$(dirname "$0")/../.." && pwd)"
MIGRATION_DIR="$REPO_ROOT/scripts/migration"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"

PSQL() {
    docker compose -f "$COMPOSE_FILE" exec -T postgres psql \
        -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -At -f /dev/stdin
}

echo "TickLab migrations -> $DB_NAME (user: $DB_USER)"

docker compose -f "$COMPOSE_FILE" up -d postgres

for i in $(seq 1 60); do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

echo "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, appliedAt timestamptz NOT NULL DEFAULT now());" | PSQL

for f in "$MIGRATION_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
    [ -e "$f" ] || continue
    version="$(basename "$f" .sql)"
    applied="$(printf "SELECT 1 FROM schema_migrations WHERE version='%s';" "$version" | PSQL)"
    if [ "$applied" = "1" ]; then
        echo "SKIP  $version (already applied)"
        continue
    fi
    echo "APPLY $version"
    {
        echo "BEGIN;"
        cat "$f"
        printf "INSERT INTO schema_migrations (version) VALUES ('%s');\n" "$version"
        echo "COMMIT;"
    } | PSQL
done

echo "All migrations applied."