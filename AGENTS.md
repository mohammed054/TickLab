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

- `CLAIMED` — used only in multi-instance execution (§9); a single-line reservation
  of a task, committed straight to `main`, before any real work begins.
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

Multiple Executor instances may work simultaneously. This requires three things
beyond everything above: a **claim** step so two instances never take the same
task, a **directory partition** so simultaneous instances rarely touch the same
files, and a **git workflow** where independent commits don't collide.

### 9.1 Identity

Each running instance is given a short-lived label for the session:
`executor-1`, `executor-2`, `executor-3`, `executor-4` (the project owner assigns
these when launching each instance — see §9.5 for the exact kickoff prompt). This
label is what goes in every `STATE.md` entry's `Agent:` field for that session
(e.g., `Agent: executor-2 (claude-sonnet-4-6)`). It resets between sessions — it is
not a permanent identity, just a way to tell concurrent work apart in the log.

### 9.2 Git workflow — one worktree per instance, `STATE.md` claims arbitrated by git

```
main                          ← Planner-owned docs/, protected; Executors don't push here directly
 ├─ exec/executor-1           ← instance 1's branch
 ├─ exec/executor-2           ← instance 2's branch
 ├─ exec/executor-3           ← instance 3's branch
 └─ exec/executor-4           ← instance 4's branch
```

Set up once, from the repo root:

```bash
git checkout -b exec/executor-1 main && git worktree add ../ws-executor-1 exec/executor-1
git checkout -b exec/executor-2 main && git worktree add ../ws-executor-2 exec/executor-2
git checkout -b exec/executor-3 main && git worktree add ../ws-executor-3 exec/executor-3
git checkout -b exec/executor-4 main && git worktree add ../ws-executor-4 exec/executor-4
```

Each instance is pointed at its own `../ws-executor-N` directory — a real, separate
folder on disk, same repo, own branch, so four instances can run `cargo build` /
`npm run dev` / edit files at the same time with zero filesystem collision.

**The claim itself is a small, fast, separately-committed change to `STATE.md`,
pushed and merged to `main` immediately, before any real work starts:**

1. Instance pulls `main`, reads `STATE.md`, picks the next unclaimed task for its
   lane (§9.3).
2. Appends a `CLAIMED` entry (new status, used only for this purpose):
   ```
   ### [2.1.A] CLAIMED — Postgres DDL
   Timestamp: <ISO-8601 UTC>
   Agent: executor-1
   Status: CLAIMED
   ```
3. Commits *only that change* to `STATE.md` on `main` directly (not on its exec
   branch) and pushes immediately.
4. If the push is rejected (someone else pushed first): pull, check whether the
   task it wanted is now claimed by someone else. If yes, pick a different task and
   retry step 2. If the conflict was on an unrelated task, just re-push.
5. Once its claim is the one on `main`, the instance switches to its own
   `exec/executor-N` branch and does the actual work there, logging normal
   `IN_PROGRESS`/`DONE` entries to `STATE.md` on its own branch as it goes (these
   merge into `main` at the end of the task, §9.4).

This makes `git push`'s built-in conflict rejection the lock — two instances racing
for the same task can't both land a `CLAIMED` entry on `main` first.

### 9.3 Directory partitioning — assign lanes, not just tasks

Picking tasks that touch disjoint parts of the tree is what actually prevents merge
pain (the claim in §9.2 prevents duplicate *work*, this prevents merge *conflicts*).
Use `docs/16-implementation-roadmap.md`'s Blocks as lanes and check which top-level
directories each one owns before assigning two instances to run concurrently:

| Block | Directories it owns | Safe to run alongside |
|---|---|---|
| 2.1 Data Models | `backend/*/models.py` (schema files only), migration files | 2.2, 2.6, 2.7 |
| 2.2 Engine Abstraction | `engine/abstraction/` | 2.1, 2.6, 2.7 |
| 2.6 Strategy Templates | `backend/experiments/app/templates/` | 2.1, 2.2, 2.7 |
| 2.7 Data Pipeline | `backend/data/app/` | 2.1, 2.2, 2.6 |
| 2.3, 2.4, 2.5, 2.8 | `engine/abstraction/`, `backend/jobs/` | **Not parallel with 2.2** — all depend on 2.2 landing on `main` first |

Never assign two instances to Blocks that read "depends on" the same not-yet-merged
Block. If Phase 2's dependency chain is unclear for a specific task, that's a
`BLOCKED` entry, not a guess.

### 9.4 Merging back

An instance merges its branch to `main` at natural checkpoints — a `DONE` task, not
mid-task — via a normal PR/fast-forward merge, small and frequent (finishing one
Task, not batching an entire Block into one giant merge). Before merging, it rebases
onto the latest `main` so it picks up any docs or `STATE.md` changes from other
instances first. Whoever merges resolves `STATE.md` conflicts by **keeping both
sides** (it's append-only, per `AGENTS.md` §3.2 — a "conflict" in an append-only log
is almost always just "two people added different lines," not a real conflict).

### 9.5 Kickoff prompt template (paste into each of your 4 instances)

```
You are executor-<N> in this project. Read AGENTS.md in full, including §9
(Multi-Instance Parallel Execution). Your working directory is
../ws-executor-<N>, on branch exec/executor-<N>.

Before doing anything else:
1. Pull main, read STATE.md bottom-up to see what's claimed/done.
2. Per docs/16-implementation-roadmap.md and AGENTS.md §9.3, claim Block <X.Y>
   (or the next unclaimed task in it) by committing a CLAIMED entry to STATE.md
   on main, per §9.2. If it's already claimed, tell me and stop.
3. Once your claim lands, switch to your branch and begin the task, logging
   progress to STATE.md exactly per AGENTS.md §3.1.
4. Stop and log BLOCKED rather than guessing on anything AGENTS.md §4 says to stop
   on, or anything that touches a directory outside your assigned Block.
```

Fill in `<N>` and `<X.Y>` per instance. For your first real parallel run, once
Phase 1 (Blocks 1.1–1.2) is done by a single instance, a good 4-way split is:

- executor-1 → Block 2.1 (Data Models)
- executor-2 → Block 2.2 (Engine Abstraction Layer Core)
- executor-3 → Block 2.6 (Strategy Templates)
- executor-4 → Block 2.7 (Data Pipeline)

These four don't depend on each other (per §9.3's table), so all four can start the
moment Phase 1 merges to `main`. Blocks 2.3/2.4/2.5/2.8 wait for 2.2 to merge, then
become the next 4-way (or fewer-way) split.

This document is itself under Planner ownership. If something here is unclear, that is
a `BLOCKED` entry addressed to the Planner — do not reinterpret these rules on your
own.
