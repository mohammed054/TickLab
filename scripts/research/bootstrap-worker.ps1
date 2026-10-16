# T1.2 -- Add pinned local Python worker environment
# Creates the per-user virtualenv that the local research worker (docs/09
# sec 9.2) runs with. Installs ONLY the exact pins in research-worker/
# requirements.txt -- no extras, no model downloads (docs/09 sec 9.8).
# This is a one-time setup step; it is the only research-worker script allowed
# to reach package registries (PyPI + the PyTorch cu118 wheel index).
# Offline health verification afterwards: scripts/research/worker-health.ps1
# Task card: docs/07-phases-and-tasks.md T1.2. Spec: docs/09-research-system.md
# sec 9.2, 9.8.

param(
    [string]$VenvDir = "D:\moham\tickLab\research-worker-venv",
    [string]$PythonExe = "python",
    [string]$RequirementsPath = "",
    # Delete and rebuild an existing venv instead of reusing it.
    [switch]$Recreate
)

$ErrorActionPreference = "Stop"

# Repo root = two levels up from scripts/research/.
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $RequirementsPath) {
    $RequirementsPath = Join-Path $RepoRoot "research-worker\requirements.txt"
}

function Info($msg)  { Write-Host "[bootstrap] $msg" }
function Fail($msg)  { throw "[bootstrap] FAILED: $msg" }
function Test-Pin($p) { return (Test-Path $p) }
function Format-GiB($bytes) { return ("{0:N2} GiB" -f ($bytes / 1GB)) }

# --- Pre-flight -----------------------------------------------------------
if (-not (Test-Pin $RequirementsPath)) { Fail "requirements file not found: $RequirementsPath" }

try {
    $pyLine = & $PythonExe -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}')" 2>&1
    $pyLine = ($pyLine | Select-Object -Last 1).ToString().Trim()
} catch {
    Fail "python not found via '$PythonExe' -- put Python 3.11.x on PATH (T0.1 measured 3.11.9)."
}
if ($pyLine -notmatch '^3\.11\.(\d+)$') {
    Fail "python is $pyLine; these pins are chosen for 3.11.x (T0.1 measured 3.11.9). -PythonExe PATH."
}
Info "system python: $pyLine  ($PythonExe)"

# Target drive space: venv with the pinned torch cu118 wheel is >4 GiB; warn
# below 8 GiB free, hard-fail below 6 GiB.
$driveLetter = $VenvDir.Substring(0, 1)
try {
    $drive = New-Object System.IO.DriveInfo($driveLetter)
    if (-not $drive.IsReady) { Fail "drive ${driveLetter}: is not ready." }
    $free = $drive.AvailableFreeSpace
    if ($free -lt 6GB) { Fail ("only {0} free on ${driveLetter}: -- at least {1} needed." -f (Format-GiB $free), (Format-GiB 6GB)) }
    elseif ($free -lt 8GB) { Info ("WARNING: only {0} free on ${driveLetter}: (8 GiB recommended)." -f (Format-GiB $free)) }
    else { Info ("target drive ${driveLetter}: free {0}" -f (Format-GiB $free)) }
} catch {
    Fail "cannot stat drive ${driveLetter}: for venv target '$VenvDir'."
}

# --- Venv -----------------------------------------------------------------
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $VenvDir) | Out-Null
$venvExisted = Test-Pin (Join-Path $VenvDir "Scripts\python.exe")
if ($venvExisted -and $Recreate) {
    Info "removing existing venv (Recreate): $VenvDir"
    Remove-Item -Recurse -Force $VenvDir
    $venvExisted = $false
}
if (-not $venvExisted) {
    Info "creating venv..."
    & $PythonExe -m venv $VenvDir
    if ($LASTEXITCODE -ne 0 -or -not (Test-Pin (Join-Path $VenvDir "Scripts\python.exe"))) {
        Fail "venv creation failed (exit $LASTEXITCODE) at $VenvDir"
    }
} else {
    Info "reusing existing venv: $VenvDir  (pass -Recreate to rebuild)"
}
$venvPy = Join-Path $VenvDir "Scripts\python.exe"

# --- Pinned install -------------------------------------------------------
# Errors stay visible; progress bars are noise in captured logs.
Info "installing pinned packages (pip registries ONLY -- no models) ..."
$venvPip = & $venvPy -m pip --version
Info "venv pip: $venvPip"
& $venvPy -m pip install --progress-bar off -r $RequirementsPath
if ($LASTEXITCODE -ne 0) {
    Fail "pip install of pinned requirements failed (exit $LASTEXITCODE). Inspect output above; do not loosen pins without a new task card."
}

# Self-consistency of installed metadata (no network, no model downloads).
& $venvPy -m pip check
if ($LASTEXITCODE -ne 0) { Fail "pip check reports broken dependency metadata (exit $LASTEXITCODE)." }

# --- Record requirements hash + env record --------------------------------
$hash = (Get-FileHash -Algorithm SHA256 $RequirementsPath).Hash.ToLowerInvariant()

# Repo-side record (git-tracked, so any checkout can verify pin integrity).
Set-Content -Path (Join-Path $RepoRoot "research-worker\requirements.sha256") `
            -Value "$hash  requirements.txt`n" -Encoding ascii
# Venv-side copy survives even if the working tree moves.
Set-Content -Path (Join-Path $VenvDir "requirements.sha256") `
            -Value "$hash  requirements.txt`n" -Encoding ascii

$lockPath = Join-Path $VenvDir "requirements-lock-from-bootstrap.txt"
& $venvPy -m pip freeze | Set-Content -Path $lockPath -Encoding ascii

$record = [ordered]@{
    kind                = "t1.2-worker-env-record-v1"
    createdAtUtc        = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    requirementsSha256  = $hash
    venvDir             = $VenvDir
    venvPythonVersion   = (& $venvPy --version).ToString()
    venvPip             = $venvPip
    systemPythonVersion = $pyLine
    installExitCode     = 0
    note                = "Pins only; no model downloads. See research-worker/README.md and docs/09 sec 9.2/9.8."
}
$recordPath = Join-Path $VenvDir "worker-env-record.json"
($record | ConvertTo-Json -Depth 3) | Set-Content -Path $recordPath -Encoding ascii

Info "requirements.sha256 = $hash  (recorded in repo + venv)"
Info "env record: $recordPath"
Info "bootstrap OK"
