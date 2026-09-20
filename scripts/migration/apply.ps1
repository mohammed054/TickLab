# apply.ps1 — apply pending SQL migrations to the TickLab Postgres database.
#
# Block 2.1 Task B (docs/16-implementation-roadmap.md), migration tooling.
#
# Design constraints (driven by AGENTS.md §5.5: no new top-level dependency may be
# introduced without a Planner review, and docs/03 does not list an ORM/Alembic or
# a host psql): the runner shells into the already-declared `postgres:16` service
# of docker-compose.yml (docs/03 §3.7 local topology) and applies each numbered
# *.sql file exactly once inside its own transaction, recording the applied
# version in the `schema_migrations` table. No Python driver, no Alembic, no
# new dependency.
#
# Usage (from repo root or anywhere — the script resolves the repo root from its
# own path):
#   .\scripts\migration\apply.ps1
# Optional env overrides: TICKLAB_DB_USER, TICKLAB_DB_NAME
# (defaults match docker-compose.yml: ticklab / ticklab).
#
# Idempotent: already-applied migrations are skipped on re-run.

# NOTE: $ErrorActionPreference must stay 'Continue' (default). On Windows
# PowerShell 5.1, 'Stop' makes ANY stderr output from a native executable (docker
# compose's "obsolete version" warning, pull progress) a terminating
# NativeCommandError. Failures are instead detected explicitly via $LASTEXITCODE
# and explicit throws.
$dbUser = $env:TICKLAB_DB_USER
if (-not $dbUser) { $dbUser = 'ticklab' }
$dbName = $env:TICKLAB_DB_NAME
if (-not $dbName) { $dbName = 'ticklab' }

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$migrationDir = Join-Path $repoRoot 'scripts\migration'
$composeFile = Join-Path $repoRoot 'docker-compose.yml'

# NOTE: stderr from native calls is deliberately NOT merged with `2>&1` here —
# on PowerShell 5.1, `2>&1` combined with an 'Stop' preference turns any stderr
# text into a terminating NativeCommandError. Callers check $LASTEXITCODE instead.
function Invoke-Psql {
    param([string]$Sql, [switch]$TuplesOnly)
    $argsList = @('exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1',
                  '-U', $dbUser, '-d', $dbName)
    if ($TuplesOnly) { $argsList += @('-At') }
    $argsList += @('-f', '/dev/stdin')
    $output = $Sql | docker compose -f $composeFile $argsList
    if ($LASTEXITCODE -ne 0) { throw "psql failed: $Sql" }
    return $output
}

Write-Host "TickLab migrations -> $dbName (user: $dbUser)"

# Ensure the postgres service is running.
docker compose -f $composeFile up -d postgres
if ($LASTEXITCODE -ne 0) { throw 'docker compose up -d postgres failed' }

# Wait for readiness.
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    docker compose -f $composeFile exec -T postgres pg_isready -U $dbUser -d $dbName 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw 'postgres did not become ready' }

# Bootstrap the version-tracking table.
Invoke-Psql -Sql "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, appliedAt timestamptz NOT NULL DEFAULT now());"

# Apply each numbered migration once, in ascending order.
Get-ChildItem -LiteralPath $migrationDir -Filter '*.sql' |
    Where-Object { $_.BaseName -match '^\d{4}_' } |
    Sort-Object { [int]($_.BaseName.Substring(0, 4)) } |
    ForEach-Object {
        $migration = $_
        $version = $migration.BaseName
        $applied = Invoke-Psql -Sql "SELECT 1 FROM schema_migrations WHERE version = '$version';" -TuplesOnly
        if ($applied -match '(?m)^\s*1\s*$') {
            Write-Host "SKIP  $version (already applied)"
            return
        }
        Write-Host "APPLY $version"
        $body = Get-Content -LiteralPath $migration.FullName -Raw
        $tx = @"
BEGIN;
$body
INSERT INTO schema_migrations (version) VALUES ('$version');
COMMIT;
"@
        Invoke-Psql -Sql $tx
    }

Write-Host 'All migrations applied.'