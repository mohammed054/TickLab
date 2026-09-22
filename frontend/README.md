# BTC Quant Workstation — Frontend

## ⚠️ THIS IS A FRONTEND-ONLY BUILD. ALL DATA IS FAKE. ⚠️

- There is **no backend**, **no exchange connection**, **no real market data**,
  **no HftBacktest integration**, and **no real order execution** anywhere in
  this codebase.
- Every price, candle, order-book row, trade, fill, strategy stat, backtest
  result, experiment, and log line you see is **randomly generated in the
  browser** by `src/mock/mockData.ts`.
- Every screen displays a persistent orange **"MOCK DATA ONLY"** banner at the
  top, and a small `MOCK` tag next to key numbers, so it's obvious at runtime
  too — not just in this file.
- Nothing here should be used to make real trading decisions.

This build implements the **UI, layout, information architecture, and
cross-panel interaction model** described in the "Dual-Monitor Bitcoin Quant
Trading Workstation" spec — not the actual trading/backtesting engine. Wiring
it to a real backend (market data feed, HftBacktest, exchange connectivity)
is a separate, much larger project.

## What's implemented

**Main Monitor** (`?monitor=main`)
- Header: price, bid/ask/spread, connection status, latency, UTC clock
- Candlestick chart with timeframe selector, VWAP overlay, hover OHLCV, click-to-sync
- Order book ladder with liquidity bars
- Live trade tape (click a trade to open it in the Event Inspector)
- Order flow panel (buy/sell pressure, delta, trades/sec)
- Strategy monitor panel (inventory, P&L, fills, latency)
- Bottom status bar

**Secondary Monitor** (`?monitor=secondary`)
- Tabs: Strategy, Parameters, Data, Backtest, Results, Compare, Sweeps, Walk-Forward, Experiments, Replay, Analytics, Risk, Report, Logs
- Strategy panel + code editor (textarea, not executed) + template picker
- Parameter sliders (spread, order size, requote interval, inventory limit/skew)
- Dataset selector + data-quality panel + pipeline visualization
- Backtest configuration, animated progress, and results (equity curve, P&L attribution)
- Strategy comparison table (pick experiments, compare metrics side by side — no "winner" badges)
- Parameter sweep heatmap (spread × inventory skew → P&L)
- Walk-forward / out-of-sample split viewer + robustness (perturbation) distribution
- Experiments list (click one to jump to its results)
- Replay controls + event inspector + trade markout view
- Volatility-bucketed analytics + a scripted "AI research assistant" card
- Risk panel with a two-step confirm kill switch
- Report builder (downloads a plain-text mock experiment report)
- Structured logs
- Alert Center (bell icon in the main header, top-right)
- Order book display modes: Ladder / Imbalance / Depth Profile

**Linking**
- `src/state/syncBus.ts` keeps both monitors on the same symbol / timestamp /
  selected trade / selected experiment / active secondary tab.
- If both monitors are opened as separate browser windows (buttons in the
  combined dev view), they stay in sync via `BroadcastChannel`.
- Clicking a candle or a trade on the Main Monitor jumps the Secondary
  Monitor to the Replay tab and opens the Event Inspector at that timestamp.
- `Ctrl/Cmd+K` opens a command palette that can jump the secondary tab.

## What's intentionally NOT implemented (out of scope for "frontend only")

- Real market data / WebSocket feeds / exchange connectivity
- Real backtest execution or HftBacktest integration
- Real order routing, paper trading, or live trading
- Persistence (experiments, notes, and results reset on reload)
- Multi-symbol support (ETH/SOL), derivatives panel (funding/OI/basis)
- Order-book heatmap-through-time and microstructure modes (Ladder/Imbalance/Depth Profile are implemented)
- Replay event-by-event stepping through raw events (controls are present but not wired to real event playback)
- AI strategy generation (the AI Research Assistant card is scripted text, not a model call)
- These are all real chunks of the original 110-section spec; happy to build
  any of them next as their own UI-only slices (still mock data) if useful.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173  (combined dev view, both monitors stacked)
npm run build     # production build to dist/
```

Open `?monitor=main` and `?monitor=secondary` in separate windows/screens for
the real two-monitor experience, or use the "Open Main/Secondary Monitor
window" buttons in the combined dev view.
