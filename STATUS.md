# TickLab transformation handoff

## Current product direction

Owner approved transforming the existing Electron app into a local-first Solana new-launch research workstation. Hosted data APIs may be used, but collection is stored locally and all model/research compute stays on the PC. Collect every launch shallowly; selectively collect expensive details. Capture runs while the desktop app is open. Free providers are preferred. Live trading is explicitly a separate future project requiring new written approval.

Authoritative specs: `docs/00-read-first.md`, `docs/09-research-system.md`, `docs/07-phases-and-tasks.md`, and `docs/08-qa-and-done.md`. Older `docs/01–06` files describe legacy implementation details where not superseded by docs/09.

## Planning complete; execution not started

The repo currently contains a substantial TickLab Radar implementation: Electron/TypeScript/React UI, SQLite, GeckoTerminal/RPC collection, risk rules, Rules Lab, journal, and a local-data explanatory AI integration. The old implementation and documentation are not evidence that the transformed data/model pipeline is complete.

**Current blocker/gate:** Phase 0 is not complete. Real provider field fixtures, historical coverage comparison, terms for local storage/research, measured storage growth, GPU VRAM/CUDA profile, and owner `go` are required before implementation tasks begin. Existing P0 capture/RPC smoke notes do not satisfy the full Phase 0 gate.

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

Run T0.1–T0.4 evidence capture, then Planner/owner review T0.5. Do not start T1 until owner replies `go`.
