# T1.2 -- offline health check for the pinned research worker environment.
# Purely local: zero network I/O, zero model downloads. Prints and saves
# (default data/p0/worker-health.json, gitignored) the status that the T1.2
# acceptance criteria require: Python version, pinned-package versions, GPU
# status, requirements hash, and the docs/09 sec 9.2 "no listening socket"
# invariant for any process running this venv's python.exe.
# Task card: docs/07-phases-and-tasks.md T1.2. Spec: docs/09-research-system.md
# sec 9.2, 9.8.

param(
    [string]$VenvDir = "D:\moham\tickLab\research-worker-venv",
    [string]$RequirementsPath = "",
    [string]$OutJson = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $RequirementsPath) { $RequirementsPath = Join-Path $RepoRoot "research-worker\requirements.txt" }
if (-not $OutJson) { $OutJson = Join-Path $RepoRoot "data\p0\worker-health.json" }

$venvPy = Join-Path $VenvDir "Scripts\python.exe"
$results = [ordered]@{}
$failures = New-Object System.Collections.Generic.List[string]

function Check([string]$name, [bool]$ok, [object]$detail) {
    $results[$name] = [ordered]@{ status = ($(if ($ok) { "pass" } else { "fail" })); detail = $detail }
    if (-not $ok) { $script:failures.Add($name) }
}

# --- 1. venv present ------------------------------------------------------
if (-not (Test-Path $venvPy)) {
    Write-Host "[health] FAIL: venv not found at $VenvDir -- run scripts/research/bootstrap-worker.ps1 first."
    exit 1
}

# --- 2. requirements hash vs recorded hashes ------------------------------
$hashCurrent = ""
if (Test-Path $RequirementsPath) {
    $hashCurrent = (Get-FileHash -Algorithm SHA256 $RequirementsPath).Hash.ToLowerInvariant()
}
$hashRecordedRepo = ""
$repoHashPath = Join-Path $RepoRoot "research-worker\requirements.sha256"
if (Test-Path $repoHashPath) { $hashRecordedRepo = (Get-Content $repoHashPath -TotalCount 1).Split(" ")[0].Trim().ToLowerInvariant() }
Check "requirements_hash_vs_repo_record" `
    ($hashCurrent -and $hashRecordedRepo -and ($hashCurrent -eq $hashRecordedRepo)) `
    "current=$hashCurrent recorded=$hashRecordedRepo"

$hashRecordedVenv = ""
$venvHashPath = Join-Path $VenvDir "requirements.sha256"
if (Test-Path $venvHashPath) { $hashRecordedVenv = (Get-Content $venvHashPath -TotalCount 1).Split(" ")[0].Trim().ToLowerInvariant() }
Check "requirements_hash_vs_venv_record" `
    ($hashCurrent -and $hashRecordedVenv -and ($hashCurrent -eq $hashRecordedVenv)) `
    "current=$hashCurrent recorded=$hashRecordedVenv"

# --- 3. interpreter + pins + GPU: one python call, fully offline -----------
# The program is handed to the interpreter on STDIN and the pin table comes in
# base64-encoded via argv, so no quoting of code/JSON ever reaches the Windows
# command line. The python script prints exactly one JSON line to stdout.
$pyCode = @'
import json, sys, importlib, importlib.metadata as md, base64

pins = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))   # [[name, pinned], ...]
if not (isinstance(pins, list) and pins and all(isinstance(t, list) and len(t) == 2 for t in pins)):
    print(json.dumps({"python": sys.version.split()[0], "pip": None, "packages": [{
        "name": "pin-table-shape", "pinned": None, "import_ok": False, "installed": None,
        "version_match": False, "error": "malformed pin table"}], "cuda": {"available": None}}))
    sys.exit(0)
IMPORT_NAMES = {"scikit-learn": "sklearn"}

out = {"python": "Unknown", "pip": "Unknown", "packages": [], "cuda": {"available": None}}

out["python"] = sys.version.split()[0]
try:
    out["pip"] = md.version("pip")
except Exception:
    pass

for name, pinned in pins:
    item = {"name": name, "pinned": pinned, "import_ok": False, "installed": None, "version_match": False}
    try:
        mod = importlib.import_module(IMPORT_NAMES.get(name, name))
        item["import_ok"] = True
        item["installed"] = getattr(mod, "__version__", None)
        if item["installed"] is None:
            item["installed"] = md.version(name)
        item["version_match"] = (item["installed"] == pinned)
    except Exception as exc:
        item["error"] = "%s: %s" % (type(exc).__name__, exc)
    out["packages"].append(item)

torch_pkg = next((p for p in out["packages"] if p["name"] == "torch"), None)
if torch_pkg is not None and torch_pkg["import_ok"]:
    try:
        import torch
        out["cuda"]["available"] = torch.cuda.is_available()
        out["cuda"]["device_count"] = torch.cuda.device_count()
        if out["cuda"]["available"]:
            out["cuda"]["device_name"] = torch.cuda.get_device_name(0)
            free_b, total_b = torch.cuda.mem_get_info()
            out["cuda"]["free_bytes"], out["cuda"]["total_bytes"] = free_b, total_b
    except Exception as exc:
        out["cuda"]["error"] = "%s: %s" % (type(exc).__name__, exc)

print(json.dumps(out))
'@

$pins = New-Object System.Collections.Generic.List[object]
foreach ($line in (Get-Content $RequirementsPath)) {
    $line = $line -replace '#.*$', '' -replace '\s+$', ''
    if ($line -match '^([A-Za-z0-9._-]+)==([0-9][A-Za-z0-9.+_-]*)$') {
        $pins.Add(@( $Matches[1], $Matches[2] ))
    }
}
if ($pins.Count -eq 0) { Write-Host "[health] FAIL: no pins parsed from $RequirementsPath"; exit 1 }

# Pin names/versions are strictly regex-constrained identifiers (no quotes,
# backslashes or spaces), so the JSON table is built as a literal string -- the
# PS 5.1 ConvertTo-Json for generic collections produces the unreliable
# {"Count":...,"value":...} property-bag shape and must not be used here.
$rowStrings = foreach ($p in $pins) { '["{0}","{1}"]' -f $p[0], $p[1] }
$pinJson = '[' + ($rowStrings -join ',') + ']'
$pinB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pinJson))
$raw = ($pyCode | & $venvPy - $pinB64)
$statusJson = $null
try { $statusJson = ($raw | Select-Object -Last 1) | ConvertFrom-Json }
catch { Write-Host "[health] FAIL: unexpected worker status output: $raw"; exit 1 }

Check "interpreter_version" ($statusJson.python -match '^3\.11\.') "venv python $($statusJson.python) (pins target 3.11.x)"

foreach ($p in $statusJson.packages) {
    $ok = [bool]$p.import_ok -and [bool]$p.version_match
    $detail = "pinned=$($p.pinned) installed=$($p.installed)$(if (-not $ok) { " import_ok=$($p.import_ok) $($p.error)" })"
    Check "pin_$($p.name)" $ok $detail
}

# --- 4. GPU status (informational; CPU fallback is healthy) ---------------
if ($statusJson.cuda.available -eq $true) {
    Check "gpu_cuda_available" $true ("{0}; free {1:N2}/{2:N2} GiB VRAM" -f `
        $statusJson.cuda.device_name, ($statusJson.cuda.free_bytes / 1GB), ($statusJson.cuda.total_bytes / 1GB))
} else {
    Check "gpu_cuda_available" $true `
        "no usable CUDA device on this host; worker runs on CPU (documented fallback, research-worker/README.md sec 4, docs/09 sec 9.2)"
}

# --- 5. no-listener invariant (docs/09 sec 9.2) ----------------------------
$venvProcListening = New-Object System.Collections.Generic.List[string]
Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($VenvDir, [System.StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object {
        $conns = Get-NetTCPConnection -State Listen -OwningProcess $_.ProcessId -ErrorAction SilentlyContinue
        if ($conns) { $venvProcListening.Add(("{0} listening on {1}" -f $_.ProcessId, (($conns | Select-Object -ExpandProperty LocalPort) -join ","))) }
    }
Check "no_listening_socket_in_venv" ($venvProcListening.Count -eq 0) `
    ($(if ($venvProcListening.Count) { ($venvProcListening -join "; ") } else { "no venv python holds a listening TCP socket" }))

# --- Report ---------------------------------------------------------------
$healthy = $failures.Count -eq 0
$report = [ordered]@{
    kind         = "t1.2-worker-health-v1"
    checkedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    venvDir      = $VenvDir
    healthy      = $healthy
    checks       = $results
    interpreter  = [ordered]@{ python = $statusJson.python; pip = $statusJson.pip }
    cuda         = $statusJson.cuda
    checkOffline = "This check performs no network I/O (docs/09 sec 9.2 requires the worker to run offline)."
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutJson) | Out-Null
($report | ConvertTo-Json -Depth 5) | Set-Content -Path $OutJson -Encoding utf8
Write-Host "[health] report saved: $OutJson"

$requiredChecks = @("requirements_hash_vs_repo_record", "requirements_hash_vs_venv_record",
    "interpreter_version", "no_listening_socket_in_venv") +
    ($results.Keys | Where-Object { $_ -like "pin_*" })
$failing = $requiredChecks | Where-Object { -not $results.Contains($_) -or $results[$_].status -ne "pass" }

if ($failing.Count -eq 0) {
    Write-Host "[health] OK: $($results['interpreter_version'].detail); $($pins.Count) pins import at pinned versions; hash match; no listening socket. GPU: $($results['gpu_cuda_available'].detail)"
    exit 0
} else {
    Write-Host "[health] FAIL: $($failing -join ", ")"
    exit 1
}
