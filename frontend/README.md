# BTC Quant Workstation — Frontend

This package is a frontend-only, offline mock implementation. It contains no exchange connection, real market feed, HftBacktest integration, order router, or LLM provider. All runtime values are deterministic simulated data and must not be used for trading decisions.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173/`. The single-display development shell switches between Main Monitor and Research Lab. Separate browser windows can be opened from the shell toolbar.

For the native Tauri shell:

```bash
npm run tauri:dev
npm run tauri:build
```

The native build requires Rust, Cargo, and Visual Studio Build Tools with the MSVC SDK. `npx tauri info` reports the local toolchain status.

## Verification

```bash
npm run typecheck
npm run build
npm run check
```

The deterministic runtime and workbench can be checked directly with the repository's temporary `tsx` command; no backend or network service is required.

## Main Monitor

One fixed layout, each fact shown once:

- **Top bar:** symbol, last price, session change/high/low/volume, environment, simulation clock, alerts. "Session" means since the simulation started, not a rolling 24h window.
- **Chart:** candles/line/area, 1s to 5m, indicators in a menu (VWAP, EMA 9, volume, cumulative delta, your fills). Hover highlights the bar and shows a tooltip (OHLC, change, volume, buy/sell split, trades, your fills and position after). Drag to pan, wheel to zoom at the cursor, arrow keys step bar by bar, End jumps to latest, F fits.
- **Order book:** ladder with your resting orders marked, or cumulative depth. 5/10/20 levels, all real levels from the feed.
- **Bottom strip:** Trades, Position & P&L, Risk (current / limit / usage for every limit), Execution (order lifecycle), Market (microprice, imbalance, flow delta, volatility, depth).
- **Status bar:** the single place for health: simulated-data badge, Feed, Engine, Risk, each as words.

## Data integrity

`src/mock/runtime/runtime.ts` derives everything from one source: candles are aggregated from the simulated trades, the book is built around the last trade (spread = ask - bid), strategy fills only occur when the market traded through the quote, P&L uses average-cost accounting, and risk limits are enforced (a breach stops the strategy).

```bash
npm run verify:sim   # 4,000 ticks, checks every invariant, exits non-zero on violation
```

Formatting rules live in `src/shared/format.ts`; risk state is computed once in `src/shared/risk.ts`.

## Research Lab

The Secondary Monitor includes:

- Monaco-based strategy editor with local persistence, validation state, human validation gate, Research/Paper controls, and backtest launch.
- Quote and execution parameters with presets, fee controls, latency/queue model selectors, and partial-fill setting.
- Dataset selector, local data catalog, deterministic pipeline progress/retry, quality report, per-check red-quality overrides, justification, and audit history.
- Backtest configuration, dataset quality gate, animated job progress, cancellation, retry, and result routing.
- Results, P&L attribution, experiment management, reproduction, comparison selection, parameter sweeps, and walk-forward/robustness views.
- Replay transport with speed control, event stepping, start/end range selection, event inspection, and markout context.
- Analytics surfaces for equity, drawdown, attribution, trades, fills, adverse selection, slippage, queue, latency, imbalance, volatility, liquidity, time, and strategy comparison.
- Risk controls with two-step stop confirmation, structured logs, alert center, research notes, event inspector, Why Investigation routing, and deterministic local AI Research responses with evidence links and experiment drafts.
- Global workspace search, command palette, keyboard shortcuts, environment presets, report text/JSON/CSV export, and cross-window workspace synchronization.

## Architecture

- `src/contracts/` contains the canonical TypeScript data contracts.
- `src/mock/runtime/` contains the seeded virtual clock, deterministic RNG, candles, trades, events, order book, and strategy state.
- `src/mock/workbench.ts` contains persistent mock jobs, experiments, results, notes, alerts, logs, and audit records.
- `src/state/` contains the external stores and the typed workspace synchronization bus.
- `src/shared/design-system/` contains semantic tokens and reusable UI primitives.
- `src-tauri/` contains the Tauri 2 desktop shell and capabilities.

The current synchronization layer uses `BroadcastChannel` and local storage for same-origin windows. A real cross-device Gateway/WebSocket sync layer remains a later backend-integration task.

## Intentionally deferred

- Real market data, exchange connectors, and live order paths.
- Real HftBacktest execution and financial result calculation; displayed results are mock templates.
- Real paper/live environments; Paper/Live controls are simulated UI states only.
- Real LLM calls; the Research Assistant uses deterministic local responses.
- Native Tauri compilation on machines without the Rust/MSVC toolchain.
