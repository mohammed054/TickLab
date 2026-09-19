# TickLab — Parallel Executor Workflow

Run 4 `opencode` executors in parallel, each in its own Windows Terminal window, each on its own branch and work block. Task assignment is coordinated through a shared SQLite database (`coordination.py`), not git — this avoids the push/reject races a git-based claim scheme runs into with 4 concurrent writers.

## Prerequisites

- Windows with **Windows Terminal** (`wt.exe`) installed and on PATH
- **opencode** CLI installed and authenticated
- **git** + push access to `https://github.com/mohammed054/TickLab.git`
- **Python 3** on PATH (used only for `coordination.py` — stdlib only, no extra packages)
- The scripts below saved in one folder (the TickLab root), next to each other
- `AGENTS.md` at the repo root already includes §9 (Multi-Instance Parallel Execution) — this workflow assumes it does

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

| Folder | Branch | Work block (as of Phase 2) |
|---|---|---|
| `ws-executor-1` | `exec/executor-1` | 2.1 (Data Models) |
| `ws-executor-2` | `exec/executor-2` | 2.2 (Engine Abstraction Layer Core) |
| `ws-executor-3` | `exec/executor-3` | 2.6 (Strategy Templates) |
| `ws-executor-4` | `exec/executor-4` | 2.7 (Data Pipeline) |

These are the Blocks `coordination.py` (Step 2) will actually hand out — the table is just the expected outcome, not something you configure by hand.

## Step 2 — Set up shared task coordination (`coordination.py`)

This is the piece that replaced git-push-based claiming. It lives **outside all four clones**, on a **local disk** — not the same network/mapped drive the repos might live on, since SQLite's locking depends on real filesystem locks, which network shares and cloud-sync folders don't reliably provide.

Create the folder and save the script:

```bat
mkdir C:\ticklab-coord
```

Save as `C:\ticklab-coord\coordination.py`:

```python
#!/usr/bin/env python3
"""
coordination.py — shared SQLite-based task coordination for parallel TickLab
executor instances.

Lives OUTSIDE all four repo clones, on a LOCAL disk (not a network drive/cloud-sync
folder — SQLite's locking depends on real filesystem locks, which are unreliable
over network shares). Every executor instance runs this same script, pointed at
the same coordination.db, to claim work atomically. No git involved in
coordination at all — git is only used for code, per AGENTS.md §9.

Usage:
  python coordination.py init
      Create and seed the tasks table. Idempotent — safe to run every time an
      instance starts; only inserts rows that don't already exist.

  python coordination.py claim <agent_id>
      Atomically claim the next available, dependency-satisfied task. Prints
      the block_id it got, or NONE if nothing is currently claimable.

  python coordination.py done <agent_id> <block_id> "<note>"
      Mark a task done. Only the owning agent can do this.

  python coordination.py blocked <agent_id> <block_id> "<reason>"
      Mark a task blocked, with why. Only the owning agent can do this.

  python coordination.py heartbeat <agent_id> <block_id> "<note>"
      Append a short progress note without changing status. Use this instead of
      writing to any shared markdown file.

  python coordination.py release <agent_id> <block_id>
      Put a claimed task back to available (use if an instance crashed/restarted
      and needs to give up a task it never actually started).

  python coordination.py status
      Print the whole task table. Safe to run from any instance, or from a
      human's own terminal, at any time.
"""
import sqlite3
import sys
import os
import datetime

DB_PATH = os.environ.get(
    "TICKLAB_COORD_DB",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "coordination.db"),
)

# block_id, description, owned_dirs, depends_on (single block_id or None)
SEED = [
    ("2.1", "Data Models & Persistence",     "backend/*/models.py, migrations",                        None),
    ("2.2", "Engine Abstraction Layer Core", "engine/abstraction/",                                     None),
    ("2.6", "Strategy Templates",            "backend/experiments/app/templates/",                      None),
    ("2.7", "Data Pipeline",                 "backend/data/app/",                                       None),
    ("2.3", "Execution Model Wiring",        "engine/abstraction/",                                     "2.2"),
    ("2.4", "Metrics & Stats Integration",   "engine/abstraction/metrics/, backend/experiments/app/metrics/", "2.2"),
    ("2.5", "Extended Event/Fill Recording", "engine/abstraction/",                                     "2.2"),
    ("2.8", "Gateway & Job Runner",          "backend/gateway/, backend/jobs/",                         "2.2"),
]


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    return conn


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def init():
    conn = connect()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            block_id    TEXT PRIMARY KEY,
            description TEXT,
            owned_dirs  TEXT,
            depends_on  TEXT,
            status      TEXT NOT NULL DEFAULT 'available',
            owner       TEXT,
            claimed_at  TEXT,
            updated_at  TEXT,
            notes       TEXT NOT NULL DEFAULT ''
        )
        """
    )
    for block_id, desc, dirs, dep in SEED:
        conn.execute(
            "INSERT OR IGNORE INTO tasks (block_id, description, owned_dirs, depends_on) "
            "VALUES (?, ?, ?, ?)",
            (block_id, desc, dirs, dep),
        )
    conn.commit()
    conn.close()
    print(f"Initialized: {DB_PATH}")


def claim(agent_id):
    conn = connect()
    conn.execute("BEGIN IMMEDIATE")  # takes the write lock now, not lazily
    row = conn.execute(
        """
        SELECT block_id FROM tasks
        WHERE status = 'available'
          AND (depends_on IS NULL
               OR depends_on IN (SELECT block_id FROM tasks WHERE status = 'done'))
        ORDER BY block_id
        LIMIT 1
        """
    ).fetchone()
    if row is None:
        conn.execute("COMMIT")
        conn.close()
        print("NONE")
        return
    block_id = row[0]
    conn.execute(
        "UPDATE tasks SET status='claimed', owner=?, claimed_at=?, updated_at=? "
        "WHERE block_id=? AND status='available'",
        (agent_id, now(), now(), block_id),
    )
    conn.commit()
    conn.close()
    print(block_id)


def _require_owner(conn, agent_id, block_id):
    row = conn.execute("SELECT owner FROM tasks WHERE block_id=?", (block_id,)).fetchone()
    if row is None:
        print(f"ERROR: no such block {block_id}")
        return False
    if row[0] != agent_id:
        print(f"ERROR: {block_id} is owned by {row[0]!r}, not {agent_id!r}")
        return False
    return True


def set_status(agent_id, block_id, new_status, note):
    conn = connect()
    if not _require_owner(conn, agent_id, block_id):
        conn.close()
        return
    conn.execute(
        "UPDATE tasks SET status=?, updated_at=?, notes = notes || ? WHERE block_id=?",
        (new_status, now(), f"\n[{now()}] {agent_id} -> {new_status}: {note}", block_id),
    )
    conn.commit()
    conn.close()
    print(f"{block_id} -> {new_status}")


def heartbeat(agent_id, block_id, note):
    conn = connect()
    if not _require_owner(conn, agent_id, block_id):
        conn.close()
        return
    conn.execute(
        "UPDATE tasks SET updated_at=?, notes = notes || ? WHERE block_id=?",
        (now(), f"\n[{now()}] {agent_id}: {note}", block_id),
    )
    conn.commit()
    conn.close()
    print(f"{block_id} heartbeat logged")


def release(agent_id, block_id):
    conn = connect()
    if not _require_owner(conn, agent_id, block_id):
        conn.close()
        return
    conn.execute(
        "UPDATE tasks SET status='available', owner=NULL, claimed_at=NULL, updated_at=?, "
        "notes = notes || ? WHERE block_id=?",
        (now(), f"\n[{now()}] {agent_id}: released back to available", block_id),
    )
    conn.commit()
    conn.close()
    print(f"{block_id} released")


def status():
    conn = connect()
    rows = conn.execute(
        "SELECT block_id, status, owner, description, depends_on FROM tasks ORDER BY block_id"
    ).fetchall()
    conn.close()
    print(f"{'BLOCK':6} {'STATUS':10} {'OWNER':14} {'DEPENDS':8} DESCRIPTION")
    for block_id, st, owner, desc, dep in rows:
        print(f"{block_id:6} {st:10} {(owner or '-'):14} {(dep or '-'):8} {desc}")


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    cmd = args[0]
    try:
        if cmd == "init":
            init()
        elif cmd == "claim":
            claim(args[1])
        elif cmd == "done":
            set_status(args[1], args[2], "done", args[3] if len(args) > 3 else "")
        elif cmd == "blocked":
            set_status(args[1], args[2], "blocked", args[3] if len(args) > 3 else "")
        elif cmd == "heartbeat":
            heartbeat(args[1], args[2], args[3] if len(args) > 3 else "")
        elif cmd == "release":
            release(args[1], args[2])
        elif cmd == "status":
            status()
        else:
            print(__doc__)
    except IndexError:
        print("Missing arguments.\n")
        print(__doc__)


if __name__ == "__main__":
    main()
```

Initialize it once (creates and seeds `C:\ticklab-coord\coordination.db`):

```bat
python C:\ticklab-coord\coordination.py init
```

Sanity-check it worked:

```bat
python C:\ticklab-coord\coordination.py status
```

You should see all 8 Blocks listed as `available`, with 2.3/2.4/2.5/2.8 showing `2.2` under `DEPENDS` (they won't be claimable until Block 2.2 is marked `done`).

**This database is the live source of truth for "who is doing what" from now on** — check it any time with the `status` command above, from any terminal, without needing to ask any of the 4 executors directly.

## Step 3 — Create `launch-all-executors.ps1`

Save as `launch-all-executors.ps1` in the TickLab root. It writes per-executor prompts/launchers to `%TEMP%\ticklab-executors\` (so the root stays clean) and opens **4 separate Windows Terminal windows** — `-w -1` forces a genuinely new window each time rather than a tab in an existing one — staggered 700 ms so the opencode boots don't collide.

```powershell
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
```

## Step 4 — Create `run-executors.bat`

Save as `run-executors.bat` in the TickLab root, next to the `.ps1`.

```bat
@echo off
REM Run this from any terminal (cmd, PowerShell, Windows Terminal) or double-click it.
REM It bootstraps launch-all-executors.ps1, which opens 4 SEPARATE Windows
REM Terminal windows, one per executor (ws-executor-1..4) running opencode.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-all-executors.ps1"
```

## Step 5 — Launch

From the TickLab root (or double-click the `.bat`):

```bat
.\run-executors.bat
```

Expected output: `Launched 4 Windows Terminal windows. Each claims its own task via SQLite.` Each window is titled `executor-N`, starts in `ws-executor-N`, and runs `opencode . --prompt …` with that executor's instructions (claim block → work → log progress, per `AGENTS.md` §9).

The first thing each `opencode` session should do is run its `claim` command and get back a Block ID (`2.1`, `2.2`, `2.6`, or `2.7` on a fresh run). If one prints `NONE`, either everything unblocked is already claimed, or `coordination.db` wasn't initialized — check with `status` (Step 6).

## Step 6 — Monitor progress

From any terminal, any time, without interrupting the 4 running instances:

```bat
python C:\ticklab-coord\coordination.py status
```

This shows every Block's `status` (`available` / `claimed` / `blocked` / `done`), which executor owns it, and its dependency. If a Block shows `blocked`, check that instance's window or its branch's `STATE.md` for the reason it logged.

## Step 7 — Merge finished work

`coordination.db` tracks task ownership, not code — it never gets merged itself. When `status` shows a Block as `done`:

```bat
git fetch origin exec/executor-<N>
git log origin/exec/executor-<N>       REM review before merging
git merge origin/exec/executor-<N>
```

Then fold that branch's `STATE.md` entries into the canonical `STATE.md` on `main`. Once Block `2.2` specifically is merged and marked `done`, the dependent Blocks (`2.3`, `2.4`, `2.5`, `2.8`) become claimable — the freed-up executor can run `claim` again to pick up the next one, or you can launch a fresh window for it.