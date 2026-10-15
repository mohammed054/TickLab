# 16 — Implementation Roadmap Index

This roadmap index exists for compatibility with the repository's `AGENTS.md` reading order. The actual transformation phases, exact executor task cards, dependencies, and acceptance criteria are in [`docs/07-phases-and-tasks.md`](07-phases-and-tasks.md).

Read the product rules in `docs/00-read-first.md`, the research contracts in `docs/09-research-system.md` and `docs/09-analytics-and-investigation-suite.md`, and the QA gates in `docs/08-qa-and-done.md`. Do not create parallel task definitions in this index. `docs/07-phases-and-tasks.md` is canonical.

## Current executor handoff

- Planning is complete; implementation has not started.
- Start with **T0.1 — Machine and storage profile** in `docs/07-phases-and-tasks.md`.
- Complete T0.1, T0.2, T0.3, then T0.4 in order. Each card lists exact files, specs,
  and acceptance criteria. Log each task in `STATE.md` using `AGENTS.md` §3.1.
- Stop after T0.4. The Planner and owner must review the evidence at T0.5; Phase 1 is
  blocked until the owner explicitly replies `go`.
- Do not implement live trading, signing, order submission, wallet-secret handling,
  cloud inference, or paid data without separate owner approval.
- See `AGENTS.md` §2.1 for how current transformation instructions supersede legacy
  instructions elsewhere in that file and in older specs.
