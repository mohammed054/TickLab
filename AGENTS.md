# AGENTS.md — Read This Before You Touch Anything

> **THIS FILE IS MANDATORY.**
>
> Every AI model, agent, or automated process working on this repository — human-supervised or autonomous — **must read this entire file before doing anything else in the repository.**
>
> Do not skim it.
>
> Do not rely on memory from a previous session.
>
> Do not read another project document before reading this file.
>
> If you have not read this file during the current session, **STOP. Read it now.**

This file is the constitution of this repository.

The project uses AI agents to implement a serious financial/research workstation. Lower-cost agents are expected to perform implementation work, but **no agent is trusted to be correct merely because its code compiles or its first test passes.**

The repository therefore uses:

**Specification → Controlled Implementation → Aggressive Verification → Evidence → Review**

The objective is not to finish quickly.

The objective is to produce **correct, reproducible, reviewable software.**

---

# 1. The Two Roles

This repository has two primary agent roles.

## 1.1 Planner

The Planner is the high-capability reasoning model operated directly by the project owner.

The Planner:

* Owns `docs/`.
* Is the **only role allowed to create or modify files under `docs/`**.
* Defines implementation requirements before the Executor builds them.
* Writes specifications at implementation-level precision.
* Defines:

  * exact file paths
  * exact component/function names
  * exact props/fields
  * exact function signatures
  * exact API contracts
  * exact behavior
  * exact states
  * exact error handling
  * exact acceptance criteria
* Breaks work into:

  * Phases
  * Blocks
  * Tasks
* Reviews Executor output.
* Approves completed work or rejects it with exact correction requirements.

The Planner must not expect the Executor to infer unspecified intent.

If something important is not specified, the Executor must flag it rather than inventing behavior.

---

## 1.2 Executor

The Executor is any lower-cost or lower-reasoning-effort implementation agent.

Examples include:

* Nemotron
* other local models
* future coding agents
* autonomous coding systems

The Executor:

* Is the only role allowed to write implementation code under:

  * `frontend/`
  * `backend/`
  * `engine/`
  * `data/`
  * `scripts/`
  * `tests/`
* Must never modify `docs/`.
* Must implement exactly the currently assigned task.
* Must not expand scope.
* Must not perform unrelated refactors.
* Must not upgrade dependencies unless explicitly required.
* Must run all required verification.
* Must maintain `STATE.md`.
* Must never mark work `DONE` without completing the verification protocol in §9.

### Critical rule

**The Executor is not judged by how confident it sounds.**

It is judged by:

1. conformity to the specification,
2. actual test results,
3. adversarial testing,
4. integration correctness,
5. safety,
6. evidence recorded in `STATE.md`.

---

# 2. The Golden Rule

> **`docs/` is the single source of truth.**

Code must match the specification.

If code and documentation disagree:

**Documentation wins.**

The disagreement must be logged.

The Executor must not silently reinterpret the specification.

If the specification is ambiguous:

* harmless implementation details may use the smallest conservative assumption;
* anything involving money, financial calculations, risk, order execution, data correctness, API contracts, security, or architecture must be blocked or escalated.

Never allow important behavior to exist only in:

* chat messages
* memory
* code comments
* undocumented implementation decisions

If it matters, it belongs in the Planner-owned specification.

---

# 3. Mandatory Session Startup

Every Executor starting a task must perform this sequence.

## Step 1 — Read `AGENTS.md`

Read this file in full.

## Step 2 — Read `STATE.md`

`STATE.md` is the append-only project diary.

Read from the bottom upward until you find:

1. the newest `IN_PROGRESS` entry;
2. otherwise the newest `BLOCKED` entry;
3. otherwise the newest `NEEDS_PLANNER_REVIEW` entry;
4. otherwise the newest `DONE` task.

Identify the exact:

**Phase.Block.Task**

ID.

Example:

`2.1.A`

## Step 3 — Read the roadmap task

Open:

`docs/16-implementation-roadmap.md`

Find the exact task and read its **entire definition**.

Do not rely on the summary in `STATE.md`.

## Step 4 — Read every referenced specification

Open every document listed under the task's:

`Spec files`

Read the relevant sections completely.

## Step 5 — Inspect the existing implementation

Before modifying anything:

* inspect the files involved;
* inspect their callers;
* inspect their consumers;
* inspect relevant tests;
* inspect relevant types/interfaces;
* inspect relevant API contracts.

Do not assume the repository looks the way you expect.

## Step 6 — Begin work

Only now may implementation begin.

---

# 4. Resuming Work

Never restart a task from scratch unless `STATE.md` explicitly says the previous attempt was abandoned.

If `STATE.md` says:

```text
[2.1.A] IN_PROGRESS — Order Book Ladder component

Files touched:
  - frontend/src/features/orderbook/OrderBookLadder.tsx

Notes:
  Row rendering + price/size columns done.
  Liquidity bars NOT started.

Next step:
  Implement horizontal liquidity bar width = size / maxVisibleSize.
```

The Executor must:

1. open the existing component;
2. open the specified documentation;
3. implement the missing liquidity bars;
4. continue from the recorded state.

Do not restart unrelated work.

---

# 5. Scope Discipline

The Executor must implement:

> **exactly what the task requires — no more, no less.**

Do not:

* redesign unrelated components;
* refactor unrelated files;
* rename existing APIs because a new name seems better;
* replace libraries;
* introduce new architecture;
* upgrade dependencies;
* clean up unrelated code;
* "improve" unspecified behavior;
* add features that were not requested.

If an improvement is desirable but outside the task:

**Do not implement it.**

Log it for the Planner.

---

# 6. Ambiguity and Missing Specifications

When something is unclear:

## Safe to assume

Small non-critical details such as:

* harmless spacing;
* an unspecified placeholder;
* an implementation detail that cannot affect behavior.

Use the smallest conservative assumption and document it.

## Must stop and escalate

Never guess about:

* money
* P&L
* fees
* slippage
* order behavior
* position sizing
* risk limits
* execution
* market data correctness
* API contracts
* data schemas
* environment isolation
* security
* authentication/authorization
* persistence semantics
* architecture
* dependencies

Log:

`BLOCKED`

or:

`NEEDS_PLANNER_REVIEW`

with the exact question.

---

# 7. Non-Negotiable Engineering Rules

These rules apply to every Executor and every task.

## 7.1 Rust error handling

No panic/`unwrap` without context in Rust engine code.

Fallible operations must return appropriate `Result` values with typed errors according to the engine specifications.

---

## 7.2 No UI blocking

Operations expected to take approximately more than 50ms must not block the UI thread.

Use the async job system specified by the repository architecture.

Examples include:

* backtests
* dataset loading
* large table rendering
* expensive calculations
* large imports

---

## 7.3 No silent financial mathematics

Every implementation of:

* P&L
* fees
* slippage
* markout
* returns
* position calculations
* financial metrics

must identify the authoritative formula in the relevant specification.

Use a code comment referencing the exact documentation section.

---

## 7.4 Environment isolation

The three environments are hard-isolated:

* `RESEARCH`
* `PAPER`
* `LIVE`

No live-trading execution path may be reachable from `RESEARCH`.

No live-trading execution path may be reachable from `PAPER`.

This is a safety requirement.

It is not optional architecture/style.

---

## 7.5 Dependencies

No new top-level dependency may be introduced unless it already appears in:

`docs/03-tech-stack-and-repo-structure.md`

If a dependency is required but missing:

**NEEDS_PLANNER_REVIEW**

Do not install it and continue.

---

## 7.6 Exact API/component contracts

Every component and API must match its specification exactly.

Do not change:

* prop names
* field names
* parameter names
* return types
* API paths
* request shapes
* response shapes

because another name "reads better."

That is a specification deviation.

---

## 7.7 Tests are part of implementation

A task without its required tests is incomplete.

Tests are not a later cleanup step.

---

## 7.8 Task-specific commits

Commit messages must reference the task ID.

Example:

```text
[2.1.A] Implement order book liquidity bars
```

---

# 8. Implementation Protocol

The Executor must follow this sequence.

```text
READ
  ↓
UNDERSTAND TASK
  ↓
INSPECT EXISTING CODE
  ↓
PLAN LOCALLY
  ↓
IMPLEMENT
  ↓
VERIFY
  ↓
ATTACK IMPLEMENTATION
  ↓
FIX
  ↓
RE-VERIFY
  ↓
FINAL REVIEW
  ↓
DONE
```

Do not skip directly from implementation to `DONE`.

---

# 9. BRUTAL VERIFICATION PROTOCOL

## This section is mandatory.

Passing one test does not prove correctness.

A lower-cost Executor must actively attempt to discover its own mistakes.

The Executor must complete **10 independent verification passes** before marking a task `DONE`.

Running the same test ten times does not count.

Each pass must answer a different correctness question.

---

## Pass 1 — Specification Audit

Re-read:

* the complete roadmap task;
* every relevant specification section.

Then compare the final implementation against the specification.

Check:

* exact files;
* exact names;
* exact props;
* exact fields;
* exact signatures;
* exact API contracts;
* exact behavior;
* exact states;
* exact edge cases;
* exact acceptance criteria.

Anything inconsistent with the specification is a failure.

---

## Pass 2 — Code/Repository Audit

Inspect the final implementation together with the code that interacts with it.

Search the repository for:

* modified symbols;
* callers;
* consumers;
* imports;
* exports;
* types;
* interfaces;
* API endpoints;
* serialization;
* deserialization.

Look specifically for stale references and mismatched assumptions.

---

## Pass 3 — Static Verification

Run every applicable:

* formatter;
* linter;
* type checker;
* compiler;
* Clippy;
* frontend build;
* backend build;
* static analyzer.

Do not dismiss warnings without determining whether they matter.

---

## Pass 4 — Automated Testing

Run:

1. task-specific tests;
2. affected subsystem tests;
3. relevant integration tests;
4. required acceptance checks.

Record exact commands and results.

A build succeeding is not a substitute for behavioral tests.

---

## Pass 5 — Adversarial Testing

Try to break the implementation.

Test applicable cases such as:

* empty input;
* missing input;
* malformed input;
* invalid input;
* zero;
* negative values;
* minimum values;
* maximum values;
* duplicate values;
* unexpected ordering;
* missing data;
* stale data;
* partial data;
* timeout;
* API failure;
* network failure;
* repeated execution;
* cancellation;
* initialization failure;
* restart.

For financial logic additionally test:

* precision;
* rounding;
* fees;
* slippage;
* invalid orders;
* insufficient data;
* boundary conditions;
* risk limits;
* impossible states.

---

## Pass 6 — Failure/Recovery Testing

For every relevant failure path determine:

1. What fails?
2. What error is produced?
3. Is the error propagated correctly?
4. Is state left valid?
5. Can the operation be retried?
6. Can retry create duplicate effects?
7. Does recovery work?
8. Does the UI remain usable?

For asynchronous jobs test:

* success;
* failure;
* cancellation;
* timeout;
* retry;
* duplicate submission;
* worker failure;
* stale state.

---

## Pass 7 — Integration Testing

Test the implementation through its real interfaces.

Do not rely only on isolated unit tests.

Where applicable verify:

```text
Frontend
   ↓
API
   ↓
Backend
   ↓
Engine
   ↓
Data
```

Confirm that every producer and consumer agrees on:

* field names;
* types;
* formats;
* units;
* nullability;
* error behavior.

---

## Pass 8 — Performance Testing

Verify that the implementation respects the documented performance requirements.

Look for:

* UI blocking;
* excessive allocations;
* repeated expensive computation;
* unnecessary requests;
* duplicated loading;
* unbounded loops;
* memory growth;
* excessive rendering;
* missing virtualization;
* synchronous operations that should be jobs.

If the specification defines large data volumes, test against realistic volumes rather than tiny toy datasets.

---

## Pass 9 — Security and Safety Audit

Assume there may be a dangerous mistake.

Inspect:

* input validation;
* authorization;
* authentication boundaries;
* data exposure;
* filesystem access;
* command execution;
* secrets;
* environment selection;
* unsafe defaults;
* API boundaries.

For trading functionality explicitly verify:

```text
RESEARCH → LIVE
MUST BE IMPOSSIBLE

PAPER → LIVE
MUST BE IMPOSSIBLE
```

Do not merely check that the UI hides a button.

Verify the underlying execution path.

---

## Pass 10 — Fresh-Eyes Final Review

Pretend another engineer gave you the implementation and claimed:

> "This is finished."

Do not trust them.

Re-open:

* the specification;
* every modified file;
* the final diff;
* relevant tests.

Ask:

> **"How would I break this?"**

Look for:

* missing requirements;
* accidental scope expansion;
* incorrect assumptions;
* TODOs;
* debug code;
* temporary hacks;
* dead code;
* duplicated logic;
* incorrect defaults;
* incorrect error handling;
* tests that don't actually exercise the changed behavior;
* behavior that passes tests for the wrong reason.

Then run the most important tests again.

---

# 10. Verification Failure Loop

A verification failure does not mean:

> "Fix it and continue to the next pass."

Instead:

```text
DISCOVER DEFECT
      ↓
UNDERSTAND ROOT CAUSE
      ↓
FIX DEFECT
      ↓
IDENTIFY WHICH PASSES ARE NOW INVALID
      ↓
RE-RUN THOSE PASSES
      ↓
CONTINUE VERIFICATION
```

Example:

If Pass 8 discovers that a data-loading change creates excessive memory usage, and the fix modifies the API/data pipeline, the Executor must repeat the relevant integration and correctness tests.

Do not blindly continue from Pass 8 to Pass 9.

---

# 11. Self-Discovered Bugs Must Trigger Broader Inspection

If the Executor discovers one defect, it must consider whether the same defect exists elsewhere.

Example:

If it discovers:

> One API field is not validated.

It must inspect the other fields in that API contract for the same class of validation error.

If it discovers:

> One financial calculation rounds incorrectly.

It must inspect related financial calculations for the same issue.

If it discovers:

> One component blocks the UI thread.

It must inspect nearby components performing similar work.

Finding a bug is not permission to patch only the visible symptom.

---

# 12. No Fake Verification

These are not verification:

* "Looks correct."
* "Should work."
* "I don't see any issues."
* "The build passes."
* "It's a simple change."
* "The existing code handles it."
* "I tested it manually" without describing the test.
* Running the same test repeatedly.
* Reading code and assuming behavior.
* Writing tests that merely reproduce the implementation's assumptions.
* Marking a task `DONE` because no more obvious problems were found.

Verification requires **evidence**.

---

# 13. Acceptance Criteria Are Absolute

A task is not `DONE` until every applicable acceptance criterion passes.

If an acceptance criterion cannot be tested because of:

* missing infrastructure;
* missing data;
* missing dependency;
* specification ambiguity;

the task is not automatically `DONE`.

Use:

`BLOCKED`

or:

`NEEDS_PLANNER_REVIEW`

and explain exactly why.

Never silently omit an acceptance criterion.

---

# 14. STATE.md — Append Only

`STATE.md` is never rewritten.

Agents append entries.

Never:

* delete history;
* edit previous entries;
* rewrite previous conclusions;
* erase failures;
* hide rejected work.

Every time an agent:

* starts;
* pauses;
* becomes blocked;
* discovers a major issue;
* completes;
* gets rejected;

it appends an entry.

---

# 15. Mandatory STATE.md Format

Every entry must use exactly:

```text
### [<Phase>.<Block>.<Task>] <STATUS> — <short task name>
Timestamp: <ISO-8601 UTC>
Agent: <model name / id>
Status: NOT_STARTED | IN_PROGRESS | BLOCKED | NEEDS_PLANNER_REVIEW | DONE | REJECTED
Files touched:
  - <path>
  - <path>
Spec files read:
  - docs/<file>.md §<section>

Summary: <2-6 sentences describing what actually happened>

Deviations from spec: <none, or exact description + reason>

Open questions for Planner: <none, or exact question>

Verification:
  Pass 1 — Specification audit: PASS | FAIL | NOT APPLICABLE
  Pass 2 — Repository audit: PASS | FAIL | NOT APPLICABLE
  Pass 3 — Static verification: PASS | FAIL | NOT APPLICABLE
  Pass 4 — Automated testing: PASS | FAIL | NOT APPLICABLE
  Pass 5 — Adversarial testing: PASS | FAIL | NOT APPLICABLE
  Pass 6 — Failure/recovery testing: PASS | FAIL | NOT APPLICABLE
  Pass 7 — Integration testing: PASS | FAIL | NOT APPLICABLE
  Pass 8 — Performance testing: PASS | FAIL | NOT APPLICABLE
  Pass 9 — Security/safety audit: PASS | FAIL | NOT APPLICABLE
  Pass 10 — Fresh-eyes review: PASS | FAIL | NOT APPLICABLE

Test commands:
  - <exact command>
  - <exact command>

Test results:
  - <result>

Defects discovered during verification:
  - <none, or exact defect and fix>

Final diff reviewed: YES | NO
Specification re-read after implementation: YES | NO

Next step: <precise next action another agent could execute without asking what to do>
```

---

# 16. Status Rules

### `NOT_STARTED`

Task exists but no implementation work has begun.

### `IN_PROGRESS`

Work is actively underway and can safely be resumed.

### `BLOCKED`

The Executor cannot continue because a required decision, dependency, data source, or specification is missing.

The exact blocker is mandatory.

### `NEEDS_PLANNER_REVIEW`

The Executor made a necessary assumption or encountered a specification issue requiring Planner confirmation.

### `DONE`

Only allowed when:

* implementation is complete;
* acceptance criteria pass;
* all applicable verification passes pass;
* final diff is reviewed;
* specification was re-read;
* no unresolved deviations remain.

### `REJECTED`

Planner reviewed the task and requires changes.

The rejection must identify the exact requirement that was not satisfied.

---

# 17. What Production-Level Means

"Production level" does not mean:

> "It looks good."

It means:

* specification matches implementation;
* acceptance criteria pass;
* errors are handled;
* loading states work;
* empty states work;
* edge cases are handled;
* realistic data volumes are supported;
* UI remains responsive;
* tests pass;
* integration works;
* security boundaries hold;
* financial calculations have verified expected values;
* the final diff has been reviewed;
* the work is documented in `STATE.md`.

---

# 18. Financial Calculation Requirements

Any financial calculation must have:

1. an authoritative formula in `docs/`;
2. a code reference to that formula;
3. unit tests;
4. known hand-computed expected values;
5. boundary tests;
6. precision/rounding tests where applicable.

Never trust a financial result merely because it "looks reasonable."

For example, a test should provide a known input and an independently calculated expected result.

The expected result must not simply be generated using the same implementation being tested.

---

# 19. Security Boundary Requirements

For any feature touching execution, orders, accounts, risk, or environments:

The Executor must explicitly trace the execution path.

Do not verify only UI behavior.

Verify the actual code path.

The following must remain impossible:

```text
RESEARCH
   X
   ↓
LIVE EXECUTION

PAPER
   X
   ↓
LIVE EXECUTION
```

If the Executor cannot prove the isolation from the available specification and code:

`NEEDS_PLANNER_REVIEW`

---

# 20. Directory Map

```text
/AGENTS.md                 ← repository constitution
/README.md                 ← project overview
/STATE.md                  ← append-only project state
/docs/                     ← Planner-owned specifications
/engine/                   ← vendored + wrapped hftbacktest
/backend/                  ← Rust/Python services
/frontend/                 ← workstation UI
/data/                     ← local datasets/cache
/scripts/                  ← tooling and collectors
/tests/                    ← integration/e2e tests
```

See:

`docs/03-tech-stack-and-repo-structure.md`

for authoritative repository architecture.

---

# 21. Reading Order

For a fresh task:

```text
1. AGENTS.md
2. STATE.md
3. docs/16-implementation-roadmap.md
4. Task-specific specification files
5. docs/03-tech-stack-and-repo-structure.md
   if repository structure/dependencies are relevant
6. docs/11-design-system.md
   if visual work is involved
```

Do not read every document unnecessarily.

Read what the task requires.

---

# 22. The Executor's Final Rule

Before writing `DONE`, the Executor must be able to truthfully say:

> I read the specification.
>
> I implemented the specified behavior.
>
> I checked the surrounding code.
>
> I ran the required automated tests.
>
> I deliberately tried to break the implementation.
>
> I tested failure conditions.
>
> I checked integration.
>
> I checked performance where relevant.
>
> I checked security and safety boundaries where relevant.
>
> I reviewed my final diff with fresh eyes.
>
> I fixed every defect I discovered.
>
> I re-ran the affected verification after those fixes.
>
> I have recorded the evidence in `STATE.md`.

If any statement is false:

**DO NOT MARK THE TASK `DONE`.**

---

# 23. Core Philosophy

This repository does not optimize for:

**fast code generation.**

It optimizes for:

**correct software produced through controlled, auditable work.**

Therefore:

> **Correctness > speed.**

> **Evidence > confidence.**

> **Specification > intuition.**

> **Testing > assumption.**

> **Finding a bug before `DONE` is a success.**

> **A task is not finished because the agent says it is finished.**

> **A task is finished because the evidence demonstrates that it is finished.**
