# BTC Quant Workstation

A professional, dual-monitor **quantitative trading laboratory** for Bitcoin: live
market observation, market-microstructure research, strategy development, backtesting,
event-level replay, experiment management, paper trading, and (eventually) live
execution — all as one synchronized instrument.

This is not a dashboard. It is a research workstation built around one loop:

```
OBSERVE → HYPOTHESIS → STRATEGY → DATA → EXECUTION MODEL → BACKTEST → RESULT
→ ATTRIBUTION → REPLAY → UNDERSTAND → MODIFY → EXPERIMENT → COMPARE → PAPER → LIVE
```

The backtesting/execution-simulation core is built on top of
[hftbacktest](https://github.com/nkaz001/hftbacktest) (vendored under `/engine`),
wrapped behind an internal abstraction layer so the simulator can be swapped or
extended later without rewriting the product.

---

## Status

This repository is at **Phase 0**: specification complete, implementation not yet
started. See `STATE.md` for the live progress log and
`docs/16-implementation-roadmap.md` for the full phased plan.

## Who should read what

| You are... | Start here |
|---|---|
| A human owner/reviewer | This file, then `docs/00-vision-and-principles.md` |
| An AI agent about to do any work | **`AGENTS.md` first — mandatory, no exceptions** |
| Resuming a previous session | `AGENTS.md` §3, then `STATE.md` |
| Building UI | `docs/07`–`docs/11` |
| Building the engine/backend integration | `docs/04`, `docs/05`, `docs/06` |
| Building execution/risk/live | `docs/12` |
| Planning the next phase of work | `docs/16-implementation-roadmap.md` |

## Repository layout

```
/AGENTS.md      Rules every AI agent must follow (planner/executor protocol)
/README.md      This file
/STATE.md       Append-only session log — always read before resuming work
/docs/          Full specification, numbered in reading order (see below)
/engine/        Vendored hftbacktest (Rust) + our abstraction layer
/backend/       Gateway API, data pipeline, job runner, live connectors
/frontend/      The two-monitor workstation UI
/data/          Local datasets and cache (not committed — see .gitignore)
/scripts/       Collectors, one-off tooling, migration scripts
/tests/         Cross-cutting integration and end-to-end tests
```

## Documentation index

| # | File | Covers |
|---|---|---|
| 00 | `00-vision-and-principles.md` | Product philosophy, the central loop, what this is not |
| 01 | `01-architecture-overview.md` | System architecture, services, data flow |
| 02 | `02-two-monitor-workspace-spec.md` | Monitor 1 / Monitor 2 roles, linked workspace, sync bus |
| 03 | `03-tech-stack-and-repo-structure.md` | Every technology choice, full file tree |
| 04 | `04-hftbacktest-engine-analysis.md` | Deep analysis of the vendored engine |
| 05 | `05-engine-abstraction-and-data-pipeline.md` | Simulator abstraction layer, data pipeline stages |
| 06 | `06-realtime-live-data-architecture.md` | Low-latency live data path vs. backtest throughput path |
| 07 | `07-main-monitor-components.md` | Every Monitor 1 panel, spec-level detail |
| 08 | `08-secondary-monitor-components.md` | Every Monitor 2 panel, spec-level detail |
| 09 | `09-analytics-and-investigation-suite.md` | Equity, drawdown, attribution, fill/queue/latency/adverse-selection analysis |
| 10 | `10-experiment-management-and-ai-research.md` | Experiment tree, reproducibility, AI research assistant |
| 11 | `11-design-system.md` | Color, type, components, density rules |
| 12 | `12-execution-modes-and-risk.md` | Research/Paper/Live isolation, risk controls, kill switch |
| 13 | `13-data-management-and-monitoring.md` | Data center, real-time data monitor |
| 14 | `14-cross-cutting-systems.md` | Search, shortcuts, alerts, logging, error/empty/loading states, export, presets |
| 15 | `15-api-and-data-model-spec.md` | REST/WebSocket contracts, core data models |
| 16 | `16-implementation-roadmap.md` | Phases → Blocks → Tasks, acceptance criteria, current status |

## Quick start (once implementation begins)

Implementation has not started yet — this section will be filled in during
Phase 1 (`docs/16-implementation-roadmap.md`) once the repo actually has a
buildable `frontend/` and `backend/`. Until then, there is nothing to run.

## License

Inherits the license of the vendored `hftbacktest` engine (MIT) for `/engine`.
Everything under `/frontend`, `/backend`, `/docs` is licensed by the project owner
(set your license here before going public).
