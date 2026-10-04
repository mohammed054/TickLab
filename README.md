# TickLab Desktop App

A native Windows **quantitative research app** for Bitcoin: verified market-data
ingestion, strategy research, real-engine backtesting when compatible depth data is
available, and a desktop research workflow.

Users launch the packaged TickLab application from its desktop shortcut or installer.
The interface is bundled into the Tauri desktop app; a browser tab or hosted website is
not part of the launch flow. React and Vite are internal UI implementation/build tools.

The long-term research loop is:

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

Implementation is in progress. The current application shell contains the real
Binance BTCUSDT USDⓈ-M aggregate-trade importer and a provenance view for verified
datasets. Its backtest step is deliberately disabled: hftbacktest fill behavior needs
compatible historical order-book depth, which the public trade archives do not
include. Obtain approved Binance historical L2 data or choose another compatible
source before enabling engine runs. Strategy generation, OpenRouter integration,
experiment persistence, and paper/live execution are not available in this shell yet.
See `STATE.md` for the progress log and `docs/16-implementation-roadmap.md` for the
active plan. The mock-first plan in `docs/17-frontend-first-transition-plan.md` is
superseded; mock surfaces are not mounted in the running app shell.

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
/frontend/      TickLab native desktop application and bundled UI
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

## Run TickLab as a desktop app

For development, open a native TickLab window from `frontend`:

```powershell
cd frontend
npm ci
npm run tauri:dev
```

To build the Windows desktop executable and installer, run `npm run tauri:build` from
`frontend`. Outputs are under `frontend/src-tauri/target/release/`.

The data service is a separate local process. Start it from the repository root before
using market-data import:


```powershell
python -m uvicorn backend.data.app.main:app --host 127.0.0.1 --port 8000
```

The desktop app connects to that local service at `127.0.0.1:8000`. The DATA step
imports real Binance BTCUSDT USD-M aggregate trades. The BACKTEST step stays disabled
for trade-only datasets until compatible historical L2 depth data and a validated
adapter are available; no mock backtest can be submitted.

## License

Inherits the license of the vendored `hftbacktest` engine (MIT) for `/engine`.
Everything under `/frontend`, `/backend`, `/docs` is licensed by the project owner
(set your license here before going public).
