# TickLab — Parallel Executor Workflow

Run 4 `opencode` executors in parallel, each in its own Windows Terminal window, each on its own branch and work block.

## Prerequisites

- Windows with **Windows Terminal** (`wt.exe`) installed
- **opencode** CLI installed and authenticated
- **git** + push access to `https://github.com/mohammed054/TickLab.git`
- The two scripts below saved in one folder (the TickLab root), next to each other

## Step 1 — Clone four instances and create one branch each

Run from the TickLab root. (`git -C` works identically in cmd, PowerShell, and Windows Terminal — no `cd` juggling needed.)

```bat
git clone https://github.com/mohammed054/TickLab.git ws-executor-1
git clone https://github.com/mohammed054/TickLab.git ws-executor-2
git clone https://github.com/mohammed054/TickLab.git ws-executor-3
git clone https://github.com/mohammed054/TickLab.git ws-executor-4

git -C ws-executor-1 checkout -B exec/executor-1
git -C ws-executor-1 push -u origin exec/executor-1
git -C ws-executor-2 checkout -B exec/executor-2
git -C ws-executor-2 push -u origin exec/executor-2
git -C ws-executor-3 checkout -B exec/executor-3
git -C ws-executor-3 push -u origin exec/executor-3
git -C ws-executor-4 checkout -B exec/executor-4
git -C ws-executor-4 push -u origin exec/executor-4
```

> `checkout -B` (capital B) is intentional: re-running this doc resets the branch instead of erroring like lowercase `-b` would.

| Folder | Branch | Work block |
|---|---|---|
| `ws-executor-1` | `exec/executor-1` | 2.1 (Data Models) |
| `ws-executor-2` | `exec/executor-2` | 2.2 (Engine Abstraction Layer Core) |
| `ws-executor-3` | `exec/executor-3` | 2.6 (Strategy Templates) |
| `ws-executor-4` | `exec/executor-4` | 2.7 (Data Pipeline) |

## Step 2 — Create `launch-all-executors.ps1`

Save as `launch-all-executors.ps1` in the TickLab root. It writes per-executor prompts/launchers to `%TEMP%\ticklab-executors\` (so the root stays clean) and opens **4 separate Windows Terminal windows**, staggered 500 ms so the opencode boots don't collide.

```powershell
# launch-all-executors.ps1
# Run from a terminal (cmd / PowerShell / Windows Terminal):
#   .\run-executors.bat
# Opens 4 SEPARATE Windows Terminal windows, each running opencode
# in its ws-executor-N folder. The .bat bootstrap uses PowerShell only to
# execute this script; the executors themselves run inside Windows Terminal.
$base = $PSScriptRoot   # folder this script lives in -- should be TickLab root

# Runtime artifacts (per-executor prompts + launchers) go here, NOT the root,
# so the root only ever contains this script + run-executors.bat.
$workDir = Join-Path $env:TEMP "ticklab-executors"
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

$instances = @(
    @{ N = 1; Block = "2.1 (Data Models)" },
    @{ N = 2; Block = "2.2 (Engine Abstraction Layer Core)" },
    @{ N = 3; Block = "2.6 (Strategy Templates)" },
    @{ N = 4; Block = "2.7 (Data Pipeline)" }
)

$launched = 0

foreach ($inst in $instances) {
    $n     = $inst.N
    $block = $inst.Block
    $dir   = Join-Path $base "ws-executor-$n"

    if (-not (Test-Path $dir)) {
        Write-Host "Skipping executor-$n -- folder not found: $dir" -ForegroundColor Yellow
        continue
    }

    $promptText = @"
You are executor-$n in this project. You are already in your working directory on branch exec/executor-$n.
Read AGENTS.md in full, including section 9.
1. Pull main, read STATE.md bottom-up.
2. Claim Block $block per section 9.2 (commit a CLAIMED entry to STATE.md on main, push). If it is already claimed, tell me and stop.
3. Do the work here, logging progress per AGENTS.md section 3.1.
4. Log BLOCKED rather than guessing on anything outside your assigned Block.
"@

    $promptFile   = Join-Path $workDir "prompt-executor-$n.txt"
    $launcherFile = Join-Path $workDir "launch-executor-$n.ps1"

    Set-Content -Path $promptFile -Value $promptText -Encoding UTF8

    $launcherContent = @"
Set-Location '$dir'
`$p = Get-Content -Raw '$promptFile'
opencode . --prompt `$p
"@
    Set-Content -Path $launcherFile -Value $launcherContent -Encoding UTF8

    # One SEPARATE Windows Terminal window per executor.
    Start-Process wt -ArgumentList "-d", $dir, "--title", "executor-$n", "powershell", "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $launcherFile
    Start-Sleep -Milliseconds 500   # stagger so 4 opencode boots don't collide on startup

    $launched++
}

if ($launched -eq 0) {
    Write-Host "No executor folders found, nothing launched." -ForegroundColor Red
    exit 1
}

Write-Host "Launched $launched opencode instance(s) in separate Windows Terminal windows." -ForegroundColor Green
```

## Step 3 — Create `run-executors.bat`

Save as `run-executors.bat` in the TickLab root, next to the `.ps1`.

```bat
@echo off
REM Run this from any terminal (cmd, PowerShell, Windows Terminal) or double-click it.
REM It bootstraps launch-all-executors.ps1, which opens 4 SEPARATE Windows
REM Terminal windows, one per executor (ws-executor-1..4) running opencode.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-all-executors.ps1"
```

## Step 4 — Launch

From the TickLab root (or double-click the `.bat`):

```bat
.\run-executors.bat
```

Expected output: `Launched 4 opencode instance(s) in separate Windows Terminal windows.` Each window is titled `executor-N`, starts in `ws-executor-N`, and runs `opencode . --prompt …` with that executor's instructions (claim block → work → log progress, per AGENTS.md).
