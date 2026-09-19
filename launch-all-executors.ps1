# launch-all-executors.ps1
# Coordination is via coordination.py + coordination.db (SQLite), NOT git.
# Each instance claims its own next task atomically at startup - no hardcoded
# Block assignment needed, and no risk of two instances getting the same task.
#
# Opens 4 SEPARATE Windows Terminal windows (via `wt -w -1`), one per executor,
# each cd'd into its own ws-executor-N and running opencode with its own prompt.
# Per-executor prompt/launcher files are written to %TEMP%\ticklab-executors\,
# not the repo root, so the root stays clean.
#
# BEFORE RUNNING:
#   1. Put coordination.py somewhere on a LOCAL disk (not a network drive),
#      e.g. C:\ticklab-coord\coordination.py
#   2. Run once:  python C:\ticklab-coord\coordination.py init
#   3. Set $coordScript below to that path.
#   4. Confirm `wt` (Windows Terminal) is on PATH.

$base = $PSScriptRoot   # folder this script lives in - should be TickLab root
$coordScript = "C:\ticklab-coord\coordination.py"

$tempDir = Join-Path $env:TEMP "ticklab-executors"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

$instanceCount = 4

for ($n = 1; $n -le $instanceCount; $n++) {
    $dir = Join-Path $base "ws-executor-$n"

    if (-not (Test-Path $dir)) {
        Write-Host "Skipping executor-$n - folder not found: $dir" -ForegroundColor Yellow
        continue
    }

    $promptText = @"
You are executor-$n. Your working directory is this one; you are on branch exec/executor-$n.
Read AGENTS.md in full, including section 9.

1. Run: python $coordScript claim executor-$n
   This prints your assigned Block ID. If it prints NONE, tell me and stop.
2. Look up that Block in docs/16-implementation-roadmap.md and its owned
   directories in AGENTS.md section 9.4. Work only inside them.
3. Log real progress to STATE.md on your OWN branch, per section 3.1.
4. Send short heartbeats as you go:
   python $coordScript heartbeat executor-$n <block_id> "<note>"
5. If genuinely stuck, run:
   python $coordScript blocked executor-$n <block_id> "<reason>"
   and stop.
6. When done, run:
   python $coordScript done executor-$n <block_id> "<summary>"
   and say so clearly.
"@

    $promptFile   = Join-Path $tempDir "prompt-executor-$n.txt"
    $launcherFile = Join-Path $tempDir "launch-executor-$n.ps1"

    Set-Content -Path $promptFile -Value $promptText -Encoding UTF8

    $launcherContent = @"
Set-Location '$dir'
`$p = Get-Content -Raw '$promptFile'
opencode . --prompt `$p
"@
    Set-Content -Path $launcherFile -Value $launcherContent -Encoding UTF8

    # -w -1 forces a brand-new Windows Terminal WINDOW (not a tab in an existing one).
    $wtArgs = @(
        "-w", "-1",
        "--title", "executor-$n",
        "powershell", "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $launcherFile
    )
    Start-Process -FilePath "wt.exe" -ArgumentList $wtArgs

    Start-Sleep -Milliseconds 700   # stagger so 4 wt/opencode boots don't collide
}

Write-Host "Launched $instanceCount Windows Terminal windows. Each claims its own task via SQLite." -ForegroundColor Green
Write-Host "Check progress any time with: python $coordScript status" -ForegroundColor Green
