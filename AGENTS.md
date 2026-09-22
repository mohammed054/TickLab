# AGENTS.md — Read This Before You Touch Anything

This file is the constitution of this repository. Every AI model, agent, or automated
process that works on this codebase — human-supervised or fully autonomous — **must
read this file in full before writing a single line of code, before reading any other
doc, and before resuming any previous session.**

If you are an AI agent and you have not read this file in this session, stop and read
it now. Do not skim. Do not assume you already know the rules from a previous run —
this file can change between sessions.

---

## 1. The Two Roles

This project is built by two classes of agent working together. You are one of them.
Know which one before you do anything else.

### 1.1 The Planner

The Planner is a high-capability reasoning model (currently: Claude, operated directly
by the project owner). The Planner:

- Is the **only** role allowed to create or modify files under `docs/`.
- Writes every specification down to the level of: exact component names, exact props/
  fields, exact file paths, exact function signatures, exact API contracts, exact
  visual/interaction behavior, exact acceptance criteria.
- Breaks all work into **Phases → Blocks → Tasks** (see `docs/16-implementation-roadmap.md`).
- Reviews Executor output against the spec and either approves it, or writes a
  correction note back into `STATE.md` under the relevant task and re-opens the task.
- Does **not** assume the Executor can infer intent. If it isn't written down, the
  Executor is not allowed to invent it — the Executor must stop and flag it instead
  (see §4).

### 1.2 The Executor

The Executor is any other model working on this repo (Nemotron 3.5 Lightning, or any
other lower-reasoning-effort/lower-cost model, including future ones). The Executor:

- Is the **only** role allowed to write code under `frontend/`, `backend/`, `engine/`,
  `data/`, `scripts/`, and `tests/`.
- Must **never** write to `docs/`. If a doc seems wrong, incomplete, or contradictory,
  the Executor logs the conflict in `STATE.md` (see §4) and either skips the ambiguous
  part or makes the smallest safe assumption necessary to keep moving, explicitly
  flagged as an assumption in the log entry.
- Must implement **exactly** what the current task in `STATE.md` says — no more, no
  less. Do not "improve" scope. Do not refactor unrelated code. Do not upgrade
  dependencies unless the task says to.
- Must run the task's acceptance checks (defined in the relevant `docs/` file and
  echoed into the task entry in `STATE.md`) before marking a task complete.

Any agent can be asked to act as either role in a given session — the role is
determined by what you were asked to do, not by which model you are. If you are asked
to "plan" or "write docs," you are the Planner for that session, and the Planner rules
in §1.1 govern you regardless of your model identity.

---

## 2. The Golden Rule

> **`docs/` is the single source of truth. Code must match docs. If code and docs
> disagree, docs win — and the disagreement gets logged, not silently resolved.**

Never let an implementation detail exist only in someone's head, only in a chat
message, or only in code comments. If it matters, it goes in `docs/`, written by the
Planner, before an Executor builds it.

---

## 3. Resuming Work — Read `STATE.md` First, Every Time

*(Running as one of several parallel instances? See §9 for how task assignment
works there — you still log to `STATE.md` on your own branch exactly as below.)*

`STATE.md` (repo root) is the single append-only log of project progress. It is not a
doc — it is a diary. Before writing any code in a new session, every Executor **must**:

1. Open `STATE.md`.
2. Read from the bottom up until you find the most recent entry with status
   `IN_PROGRESS` or `BLOCKED`, or, if none exists, the most recent `DONE` entry.
3. Identify the exact **Phase.Block.Task** ID of that entry (e.g. `2.1.A`).
4. Open the corresponding section of `docs/16-implementation-roadmap.md` and re-read
   the full task definition, not just the `STATE.md` summary.
5. Open every doc file referenced by that task (each task lists its "Spec files" —
   see the roadmap template).
6. Resume from exactly where the log says work stopped. Do not restart the task from
   scratch unless the log explicitly says the prior attempt was abandoned.

If `STATE.md` says:

```
[2.1.A] IN_PROGRESS — Order Book Ladder component
Last updated: <timestamp> by <agent-id>
Files touched: frontend/src/features/orderbook/OrderBookLadder.tsx
Notes: Row rendering + price/size columns done. Liquidity bars (see
docs/07-main-monitor-components.md §8.3) NOT started. Next step: implement
horizontal liquidity bar width = size / maxVisibleSize, per spec.
```

...then the correct next action is: open `OrderBookLadder.tsx`, open
`docs/07-main-monitor-components.md` §8.3, and implement the liquidity bars. Nothing
else. Do not jump to a different task because it looks more interesting or more
finished.

### 3.1 Logging Format (mandatory)

Every time an agent starts, pauses, blocks on, or finishes a task, it appends — never
edits or deletes — an entry to `STATE.md` in this exact format:

```
### [<Phase>.<Block>.<Task>] <STATUS> — <short task name>
Timestamp: <ISO-8601 UTC>
Agent: <model name / id>
Status: NOT_STARTED | IN_PROGRESS | BLOCKED | NEEDS_PLANNER_REVIEW | DONE | REJECTED
Files touched:
  - <path>
  - <path>
Spec files read:
  - docs/<file>.md §<section>
Summary: <2-6 sentences of what was actually done, in plain language>
Deviations from spec: <none, or exact description of any deviation + why>
Open questions for Planner: <none, or the exact question>
Next step: <the precise next action, written so a different agent could pick it up
cold>
```

`STATUS` values:

- `NOT_STARTED` — task exists in the roadmap, nothing built yet.
- `IN_PROGRESS` — actively being worked, safe to resume mid-task.
- `BLOCKED` — cannot proceed without a decision, missing dependency, or missing data.
  Must include exactly what is blocking it.
- `NEEDS_PLANNER_REVIEW` — Executor believes the task is complete but a spec ambiguity
  was resolved by assumption and needs Planner sign-off before downstream tasks build
  on top of it.
- `DONE` — implemented, self-tested against the acceptance criteria in the roadmap,
  and no open deviations.
- `REJECTED` — Planner reviewed and sent it back. The rejection entry must state
  exactly what must change, referencing the doc section that was not honored.

### 3.2 Never Skip Logging

An agent that finishes a working session without writing a `STATE.md` entry has, for
the purposes of this project, not done the work — the next agent has no way to know
what happened and must treat the state as whatever the last logged entry says. **Log
before you stop, not "later."**

---

## 4. When the Spec Is Ambiguous or Missing

This will happen. When it does, an Executor must never silently guess on anything that
affects data shape, financial calculation, risk logic, or an API contract. Instead:

1. Make the smallest, most conservative assumption that lets you keep moving on
   non-critical details only (e.g., a specific shade of a color not defined in
   `docs/11-design-system.md`, a spacing value, a placeholder loading message).
2. For anything involving money, risk, order logic, execution assumptions, or data
   correctness: **stop that specific sub-task**, log it as `BLOCKED` or
   `NEEDS_PLANNER_REVIEW` with the exact open question, and move to the next
   independent task instead of guessing.
3. Never invent a new library, a new architecture pattern, or a new file-structure
   convention that isn't in `docs/03-tech-stack-and-repo-structure.md`. Flag the gap
   instead.

---

## 5. Non-Negotiable Engineering Rules

These apply to every Executor, on every task, with no exceptions:

1. **No panic/`unwrap`-without-context in Rust engine code.** All fallible paths return
   `Result` with a typed error (see `docs/04-hftbacktest-engine-analysis.md` and
   `docs/05-engine-abstraction-and-data-pipeline.md`).
2. **No blocking the UI thread.** Any operation over ~50ms (backtest run, dataset load,
   large table render) goes through the async job system defined in
   `docs/03-tech-stack-and-repo-structure.md` and `docs/15-api-and-data-model-spec.md`.
3. **No silent financial math.** Every P&L, fee, slippage, or markout calculation must
   cite which formula in `docs/09-analytics-and-investigation-suite.md` it implements,
   as a code comment referencing the doc section.
4. **No live-trading code path may be reachable from Research or Paper environments.**
   The three environments (`RESEARCH`, `PAPER`, `LIVE`) are hard-isolated per
   `docs/12-execution-modes-and-risk.md` — this is a safety rule, not a style
   preference.
5. **No new top-level dependency** without it being listed in
   `docs/03-tech-stack-and-repo-structure.md`. If you need one that isn't listed, that
   is a `NEEDS_PLANNER_REVIEW`, not a `pip install` / `cargo add` / `npm install`.
6. **Every component matches its spec file's props/behavior table exactly**, including
   naming. Renaming a prop "because it reads better" is a spec deviation and must be
   logged as one.
7. **Tests are part of the task, not a follow-up.** A task is not `DONE` until the
   acceptance criteria listed for it in `docs/16-implementation-roadmap.md` pass.
8. **Commit messages reference the task ID**: `[2.1.A] Implement order book liquidity
   bars`.

---

## 6. Directory Map (see `docs/03-tech-stack-and-repo-structure.md` for full detail)

```
/AGENTS.md                 ← you are here
/README.md                 ← project overview, quick start
/STATE.md                  ← append-only session log (read every time)
/docs/                     ← Planner-owned specs, numbered reading order
/engine/                   ← vendored + wrapped hftbacktest (Rust)
/backend/                  ← Rust/Python services: gateway, data pipeline, job runner
/frontend/                 ← the two-monitor workstation UI
/data/                     ← local datasets, cache (gitignored, see .gitignore)
/scripts/                  ← one-off tooling, collectors, migration scripts
/tests/                    ← cross-cutting integration/e2e tests
```

---

## 7. Reading Order for a New Agent on a Fresh Task

1. `AGENTS.md` (this file)
2. `STATE.md` (find where to resume)
3. `docs/16-implementation-roadmap.md` (find the current Phase/Block/Task)
4. The specific numbered doc(s) that task references
5. `docs/03-tech-stack-and-repo-structure.md` (if you need to know where a file goes
   or which library to use)
6. `docs/11-design-system.md` (if you are touching anything visual)

Do not read every doc in the repo before starting a small task — read what the task
tells you to read. The docs are organized so that each task's "Spec files" list is
sufficient.

---

## 8. What "Production Level" Means Here

A task is not done when it "looks right." It is done when:

- It matches its spec file exactly (props, behavior, states, edge cases).
- It handles the error/loading/empty states defined in
  `docs/14-cross-cutting-systems.md`.
- It performs acceptably under the data volumes defined in
  `docs/03-tech-stack-and-repo-structure.md` (millions of events, virtualized
  rendering, no UI-thread blocking).
- It is logged in `STATE.md` with `DONE` and no open deviations.
- If it's a financial calculation, it's covered by a unit test with a known
  hand-computed expected value.

---

## 9. Multi-Instance Parallel Execution

Multiple Executor instances can work at the same time. Coordination happens
through **one shared SQLite database** (`coordination.py` + `coordination.db`),
kept **outside all repo clones** and **outside git entirely** — git is used only
for code, never for coordinating who is doing what. This replaced an earlier
git-push-based "claim" scheme that cost real time fighting over a shared file;
SQLite gives real atomic transactions instead of push/reject races, so claiming is
now a non-event.

### 9.1 Where it lives and why not on the network drive

Place `coordination.py` and its `coordination.db` in one folder **outside** the
`ws-executor-N` clones, and confirm that folder is on a **local disk**, not a
network share or cloud-sync folder (SQLite's locking depends on real filesystem
locks, which are unreliable over SMB/network drives and sync clients). If your
repos live under a mapped drive (e.g. `Z:\...`), put the coordination folder
somewhere verified local instead, e.g. `C:\ticklab-coord\`.

```
C:\ticklab-coord\
  coordination.py
  coordination.db      ← created by `init`; never committed to any repo
```

Every instance runs the same script against the same `coordination.db`, e.g.:
```powershell
python C:\ticklab-coord\coordination.py claim executor-1
```
(or set `$env:TICKLAB_COORD_DB = "C:\ticklab-coord\coordination.db"` once per
session so the plain filename form works from any working directory.)

### 9.2 The commands

- `init` — creates and seeds the task table from the Blocks in
  `docs/16-implementation-roadmap.md`. Idempotent; run it once, or every time,
  it doesn't matter.
- `claim <agent_id>` — atomically claims the next available task whose
  dependency (if any) is already `done`. This is a single SQL transaction
  (`BEGIN IMMEDIATE` + conditional `UPDATE`), so two instances calling this at the
  same instant can never both get the same task — verified under a 20-way
  concurrent stress test before this was adopted.
- `done <agent_id> <block_id> "<note>"` / `blocked <agent_id> <block_id> "<reason>"`
  / `heartbeat <agent_id> <block_id> "<note>"` — status updates. Only the owning
  agent can update its own task (enforced by the script, not by convention).
- `release <agent_id> <block_id>` — hands a claimed-but-not-yet-started task back
  to `available` (use this if an instance crashes or restarts mid-claim).
- `status` — prints the whole table. Safe to run from any instance or from your
  own terminal at any time, including mid-run, to see who's doing what.

### 9.3 What SQLite replaces vs. what stays the same

- **Replaces**: the git-push `CLAIMED`-entry scheme, and the per-instance
  `STATE.executor-N.md` files as the coordination signal.
- **Stays the same**: each instance still works in its own clone
  (`ws-executor-N`) on its own branch (`exec/executor-N`); still owns a specific
  set of directories per the table below (SQLite prevents two instances grabbing
  the same *task*, but disjoint directories are still what prevents two instances
  producing *merge conflicts* on the same files); a human still merges finished
  branches into `main` periodically (§9.5) — `coordination.db` tracks task
  ownership, not code, and is never itself part of a merge.
- Detailed narrative progress (what was actually built, decisions made, spec
  sections read) still belongs in `STATE.md` — an instance writes that on its own
  branch as normal per §3.1, since there's no contention on a file only that
  branch touches; `coordination.db`'s `notes` column is just a short live-status
  breadcrumb, not a replacement for the real log.

### 9.4 Directory ownership by Block

Phases 0–2 are complete (marked `done` in `coordination.db`, kept for the
dependency graph and audit trail). The live board covers Phases 3–6:

| Block | Description | Directories it owns | Depends on |
|---|---|---|---|
| 3.1 | Sync Bus and Shell | `frontend/src/shared/sync-bus/`, `frontend/src/app/` | — |
| 3.2 | Header and Chart | `frontend/src/features/header/`, `frontend/src/features/price-chart/` | 3.1 |
| 3.3 | Order Book | `frontend/src/features/order-book/` | 3.1 |
| 3.4 | Flow, Microstructure, Regime | `frontend/src/features/order-flow/`, `microstructure/`, `market-regime/` | 3.1 |
| 3.5 | Strategy/Inventory/Risk/Execution/BottomBar | `frontend/src/features/strategy-monitor/`, `inventory/`, `risk/`, `execution-monitor/`, `bottom-bar/` | 3.1 |
| 4.1 | Strategy Editor and Parameters | `frontend/src/features/strategy-editor/`, `parameters/` | 3.1 |
| 4.2 | Dataset Selector and Data Quality | `frontend/src/features/dataset-selector/`, `data-quality/` | 3.1 |
| 4.3 | Backtest Configuration/Progress/Results | `frontend/src/features/backtest-config/`, `backtest-progress/`, `results/` | 3.1 |
| 4.4 | Full Analytics Suite | `frontend/src/features/analytics/` | 4.3 |
| 4.5 | Replay, Event Inspector, Why Investigation | `frontend/src/features/replay/`, `event-inspector/`, `why-investigation/` | 4.2 |
| 4.6 | Experiment Management and Research Notes | `frontend/src/features/experiments/`, `research-notes/` | 4.3 |
| 4.7 | AI Research Assistant | `frontend/src/features/ai-research/`, `backend/ai/` | 4.4 |
| 4.8 | Logs, Alerts, Search, Command Palette | `frontend/src/features/logs/`, `alerts/`, `search/`, `command-palette/` | 3.1 |
| 4.9 | L3 (Market-By-Order) Backtest Support | `backend/data/app/`, `frontend/src/features/dataset-selector/` | 4.2, 2.7 |
| 5.1 | Live Market Data Ingestion (read-only) | `backend/connectors/`, `backend/market/` | 2.2 |
| 5.2 | Paper Fill Simulation | `backend/connectors/`, `engine/abstraction/` | 5.1 |
| 5.3 | Paper Mode Rollout | `frontend/src/features/paper-live/`, `backend/experiments/` | 5.2, 4.3 |
| 5.4 | Live Trading Enablement | `backend/connectors/`, `frontend/src/features/risk-controls/` | 5.3 |
| 5.5 | Initial Scale-Out | `infra/`, `docker-compose.yml`, k8s manifests | 5.4 |
| 6.1 | Multi-Symbol Support | `frontend/src/features/header/`, `dataset-selector/`, `backend/market/` | 4.4 |
| 6.2 | Derivatives Analytics Expansion | `frontend/src/features/analytics/`, `backend/market/` | 6.1 |
| 6.3 | Remaining Scale-Out (full k8s migration) | `infra/` | 5.5 |

`claim` enforces this dependency ordering directly — including multi-dependency
Blocks like 4.9 and 5.3, which need *all* comma-separated dependencies `done`
before they're claimable — so this table is only for telling an instance which
directories it's allowed to touch once it has its Block, not for checking
eligibility yourself.

Note: 5.1 depends only on 2.2, which is already `done` — it can be claimed and
worked on in parallel with Phase 3/4 frontend work, since read-only live-data
ingestion doesn't touch any frontend directory. If you'd rather sequence Phase 5
strictly after Phase 4 finishes instead, change 5.1's `depends_on` in
`coordination.py`'s `SEED` to `"4.4"` before running `init`.

### 9.5 Kickoff prompt template

```
You are executor-<N>. Your working directory is this one; you are on branch
exec/executor-<N>. Read AGENTS.md in full, including section 9.

1. Run: python C:\ticklab-coord\coordination.py claim executor-<N>
   This prints your assigned Block ID. If it prints NONE, tell me and stop —
   there is nothing unblocked left to claim right now.
2. Look up that Block in docs/16-implementation-roadmap.md and its owned
   directories in AGENTS.md section 9.4. Work only inside them.
3. Log real progress to STATE.md on your OWN branch, per section 3.1, as normal.
4. Send short heartbeats as you go:
   python C:\ticklab-coord\coordination.py heartbeat executor-<N> <block_id> "<note>"
5. If genuinely stuck on something outside your Block or spec, run:
   python C:\ticklab-coord\coordination.py blocked executor-<N> <block_id> "<reason>"
   and stop — don't guess, don't message another instance directly.
6. When actually done, run:
   python C:\ticklab-coord\coordination.py done executor-<N> <block_id> "<summary>"
   and say so clearly so the human can merge your branch.
```

### 9.6 Merging — still a human step, still periodic

`coordination.db` tells you *when* a Block is done and *what depends on what*; it
doesn't merge anything. When `status` shows a Block as `done`:

1. `git fetch` that instance's branch.
2. Review the diff.
3. Merge into `main`.
4. Fold that branch's `STATE.md` entries into the canonical `STATE.md` on `main`.

Do this per finished Block, not continuously — there's no need to merge more often
than work actually completes.

This document is itself under Planner ownership. If something here is unclear, that is
a `BLOCKED` entry addressed to the Planner — do not reinterpret these rules on your
own.
