# 02 — Two-Monitor Workspace Specification

## 2.1 Physical/logical setup

```
┌──────────────────────────────────────────────┐
│                MAIN MONITOR                   │   Large, landscape.
│           "Market Command Center"             │   Primary visual focus.
│                                                │
└──────────────────────────────────────────────┘
                     ╲
                      ╲
                ┌───────────────┐
                │   SECONDARY    │   Smaller, physically tilted toward the user.
                │  "Research Lab"│   Vertically stacked layout.
                └───────────────┘
```

- **Main window**: `frontend/src/app/main-monitor/` — designed for a large landscape
  display (target reference: 3840×1600 ultrawide or 2560×1440 standard; must degrade
  gracefully to 1920×1080).
- **Secondary window**: `frontend/src/app/secondary-monitor/` — designed for a
  smaller, portrait-leaning or standard display (target reference: 1920×1200 or
  1920×1080 in a taller aspect usage).
- Both are launched as two windows of **one application** (see
  `docs/03-tech-stack-and-repo-structure.md` §3.3 for the multi-window shell
  approach), not two separately deployed apps. They connect to the same WebSocket
  session and the same Sync Bus (below).
- The OS/window manager determines actual physical placement; the app does not need
  to detect monitor geometry, only to expose "open on monitor 1 / monitor 2" as a
  user action (menu item + keyboard shortcut) the first time the app runs, then
  remember the choice.

## 2.2 Division of responsibility

| | Main Monitor | Secondary Monitor |
|---|---|---|
| Mental model | LOOK | THINK |
| Primary content | Live/replay price chart, order book, trade tape, order flow, strategy quotes, inventory, P&L, risk, execution/system health | Strategy editor, parameters, dataset selection, backtest configuration/progress, results, analytics, experiments, replay controls, event inspector, logs, AI research |
| Update cadence | Sub-second, continuous | Mostly on-demand / event-driven (user action, job progress) |
| Never shown here | Strategy source code editor, experiment tree, parameter sweep heatmaps | The primary live price chart as the dominant element |

**Do not duplicate information between monitors.** If a number is the main
monitor's job to show (e.g., current position), the secondary monitor may show it
only in a compact/contextual way (e.g., inside a trade-investigation card), never as
a second copy of the same always-on widget.

Full component lists: `docs/07-main-monitor-components.md` (Main) and
`docs/08-secondary-monitor-components.md` (Secondary).

## 2.3 The Sync Bus — the most important interaction in the product

Both monitors subscribe to a shared, in-memory **Workspace Context** object,
replicated across both windows via the Gateway WebSocket session (see
`docs/15-api-and-data-model-spec.md` §15.3.4 `workspace.sync` topic). Any monitor
that changes a field publishes the change; the other monitor reacts to it. This is
implemented as a single Zustand (or equivalent) store synchronized over the
existing WebSocket connection — **not** `localStorage`/`BroadcastChannel`, so it
also works correctly when the two "monitors" are actually two devices on the same
session (e.g., laptop + external display, or a remote viewing client).

### 2.3.1 Workspace Context shape

```ts
interface WorkspaceContext {
  symbol: string;                 // "BTCUSDT"
  exchange: string;                // "binance-futures"
  environment: "RESEARCH" | "PAPER" | "LIVE";
  dataset: DatasetRef | null;      // active dataset for replay/backtest
  strategy: StrategyRef | null;    // active strategy being edited/run
  experiment: ExperimentRef | null;// active experiment being inspected
  timestamp: number | null;        // nanosecond epoch — the shared "cursor" in time
  selectedOrderId: string | null;
  selectedFillId: string | null;
  selectedTradeId: string | null;
  replay: {
    isPlaying: boolean;
    speed: number;                 // 0.01–1000
    rangeStart: number;
    rangeEnd: number;
  } | null;
  activeTab: {
    secondaryMonitor: SecondaryTabId; // see doc 08 §8.2
  };
}
```

### 2.3.2 Canonical sync interactions (must all be implemented exactly as described)

1. **User clicks a losing section of the equity curve (Secondary → both).**
   - Secondary sets `timestamp`, `experiment`, opens the "Trade Investigation" view
     (`docs/08-secondary-monitor-components.md` §8.20).
   - Main receives the `timestamp` change, jumps its chart/order-book/replay view to
     that instant (`docs/07-main-monitor-components.md` §7.2.6 "Jump to timestamp").

2. **User changes a strategy parameter and clicks Run Backtest (Secondary → Main).**
   - Secondary updates `strategy` and queues a job.
   - Once the job streams simulated market replay frames, Main enters Replay mode
     automatically and renders the replay (`docs/07-main-monitor-components.md` §7.19).

3. **User selects a timestamp on Main (via chart click, crosshair-lock, or "jump to
   trade") (Main → Secondary).**
   - Main sets `timestamp` and, if applicable, `selectedTradeId`/`selectedOrderId`.
   - Secondary opens the Event Inspector at that exact timestamp
     (`docs/08-secondary-monitor-components.md` §8.21).

4. **Crosshair hover on Main's chart (Main → Secondary, throttled).**
   - While hovering (not just clicking), Main publishes a throttled (max 20Hz)
     `timestamp` preview event distinct from a committed selection. Secondary panels
     that are timestamp-aware (event inspector, if open) preview the value but do
     not navigate away from the user's current tab. Only a committed click commits
     navigation.

5. **User changes environment (RESEARCH/PAPER/LIVE) (either → both).**
   - Both monitors immediately re-render their environment badge
     (`docs/12-execution-modes-and-risk.md` §12.1) and any environment-gated
     controls.

### 2.3.3 What is always shared vs. never shared

Always shared: `symbol`, `exchange`, `dataset`, `strategy`, `experiment`,
`timestamp`, `selectedOrderId`, `selectedFillId`, `selectedTradeId`, `environment`,
`replay`.

Never shared (local UI state only): which secondary-monitor tab sub-panel is
expanded/collapsed, scroll position, column widths, main-monitor chart zoom level
(zoom is local so investigating a trade doesn't fight the user's current chart
framing — only the timestamp cursor syncs, not the viewport).

## 2.4 Crosshair synchronization (main monitor internal + cross-panel)

A single timestamp cursor, when active (via hover-lock or replay position),
synchronizes across, at minimum: price chart, order book (replay/heatmap modes),
trade tape, inventory panel, P&L panel, volatility/spread readouts, and — across the
Sync Bus — the secondary monitor's event inspector. See
`docs/07-main-monitor-components.md` §7.2.5 for the exact hover/lock interaction
model.

## 2.5 Workspace Presets

A preset is a saved configuration of both monitors' active tabs/panels/layout,
switchable via the command palette (`docs/14-cross-cutting-systems.md` §14.2) or a
preset switcher in the global header. Presets ship with the following defaults
(customizable per user, stored per `docs/15-api-and-data-model-spec.md` §15.5
`workspace_presets` table):

| Preset | Main Monitor | Secondary Monitor |
|---|---|---|
| MARKET | Full market monitoring layout | Market statistics + logs |
| RESEARCH | Compact market view | Strategy + Parameters + Analytics |
| BACKTEST | Replay-ready market view | Dataset + Backtest Configuration + Results |
| REPLAY | Market + order book in replay mode | Event Inspector |
| EXECUTION | Orders/fills/latency emphasized | Execution/latency analytics |
| PAPER | Live market, Paper badge | Paper P&L + risk |
| LIVE | Live market, Live badge, risk panel emphasized | Risk controls + kill switch |

Switching a preset changes which panels are visible/emphasized; it never changes
the underlying Workspace Context (symbol/strategy/etc. persist across preset
switches).

## 2.6 Failure mode: only one monitor available

If the app is opened on a single display (e.g., during early development, or a
laptop-only session), it must still be fully usable: provide a monitor
switcher (tab or split view) rather than hiding secondary-monitor functionality.
This is a required fallback, not an edge case to skip — most Executor agents will
be developing and testing on a single screen. Implementation: a `SingleDisplayShell`
component that tab-switches between the Main and Secondary monitor React trees,
sharing the same Workspace Context store. See
`docs/03-tech-stack-and-repo-structure.md` §3.3.
