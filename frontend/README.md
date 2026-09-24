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

- Runtime-driven header with simulated feed status, environment, latency, and logical UTC time.
- Canvas price chart with candles, line/area/tick/trade/order-flow/footprint/depth/replay modes, timeframes, zoom, PNG export, fullscreen, VWAP, EMA, volume, CVD, imbalance, and strategy-quote overlays.
- Order book ladder with liquidity bars, depth selection, heatmap, depth profile, imbalance, microstructure, and replay views.
- Trade tape with side/size/notional filters, follow-latest behavior, and workspace timestamp selection.
- Order-flow, inventory, strategy, microstructure, market-regime, risk, and execution/system panels.
- Persistent mock-data banner and simulated/not-connected status indicators.

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
