# TickLab transformation handoff

## Current product direction

Owner approved transforming the existing Electron app into a local-first Solana new-launch research workstation. Hosted data APIs may be used, but collection is stored locally and all model/research compute stays on the PC. Collect every launch shallowly; selectively collect expensive details. Capture runs while the desktop app is open. Free providers are preferred. Live trading is explicitly a separate future project requiring new written approval.

Authoritative specs: `docs/00-read-first.md`, `docs/09-research-system.md`, `docs/07-phases-and-tasks.md`, and `docs/08-qa-and-done.md`. Older `docs/01–06` files describe legacy implementation details where not superseded by docs/09.

## Phases 0-1 complete; Phase 2 in progress

**Executor handoff: continue at T2.2.** Read `AGENTS.md` (especially §2.1), then
`STATE.md`, then the full T2.2 card and cited sections in `docs/07-phases-and-tasks.md`
and `docs/09-research-system.md`. Implement only T2.2's listed files and acceptance
check. Continue the remaining Phase 2 tasks (T2.3-T2.7) one card at a time.

Phase 0 (real 24-hour capture, provider bake-off, terms, storage projection) and
Phase 1 (pinned worker environment, JSONL supervisor, job lifecycle, real-money and
hosted-AI removal) are complete per `STATE.md`. The T0.5 owner `go` is recorded
retroactively in `STATE.md` ([T0.5-GO] entry). T2.1 (versioned file catalog and
dataset versions) is applied and verified; T2.2 raw gzip JSONL writer and manifest
is next.

The repo currently contains a substantial TickLab Radar implementation: Electron/TypeScript/React UI, SQLite, GeckoTerminal/RPC collection, risk rules, Rules Lab, journal, and a local-data explanatory AI integration. The old implementation and documentation are not evidence that the transformed data/model pipeline is complete.

**Current blocker/gate:** none within Phase 2 scope. Phase 2 continues at T2.2 per
`STATE.md`; disk-cap policy (T2.4) and the Phase 2 gate checks remain ahead.

## Owner-confirmed environment and defaults

- Windows PC, RTX 2060, 16 GB system RAM; exact GPU variant/VRAM to measure in T0.1.
- Approximately 200 GB storage available; planned managed data cap is 150 GiB, leaving at least 50 GB free outside the allocation.
- Prefer free data/model sources; paid sources require separate approval.
- Current app process is the capture uptime boundary.
- Local ML + controlled strategy search + optional local LLM; Kronos is a benchmark candidate, not a presumed useful predictor.
- Research rank should be a single integrated opportunity output that accounts for returns and risk, with risk evidence visible.
- Live trading and real-money tests are not part of this roadmap.

## Legacy validation evidence (not re-run during planning)

Previous handoff entries report 159 unit tests, typecheck, lint, Electron build, provider smoke capture, and Windows installer launch. The prior real-data gate remained incomplete: provider fields were not verified, fixtures were synthetic, Phase 0 terms/storage projections were TODO, and the E2E suite/soak were incomplete. Re-run applicable checks during the task cards; do not rely on these historical claims as current verification.

## Next step

Implement T2.2 (raw gzip JSONL writer and manifest), then the remaining Phase 2
cards one at a time.
