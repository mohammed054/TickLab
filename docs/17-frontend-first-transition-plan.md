# 17 — Frontend-First Transition Plan (supersedes parts of docs 02/03/07/08)

This document records a deliberate, owner-approved pivot away from the original
backend-first roadmap (`docs/16`), captures the **actual current state of the
repository** as of this audit, and defines the path to a complete, fully-mocked
frontend before backend wiring resumes. Per `AGENTS.md`'s Golden Rule ("docs win,
disagreements get logged"), where this document conflicts with `docs/02`, `docs/03`,
`docs/07`, or `docs/08`, **this document is authoritative** until those are
rewritten in full to match — treat their tech-stack and file-structure sections as
stale, not their product/UX intent, which still holds.

## 17.1 Why this pivot happened, stated plainly

The original plan (`docs/16`) built backend and frontend in lockstep, phase by
phase. In practice this produced a Vite dev-server web app, not the dual-monitor
desktop workstation the product is meant to be, and produced Live Trading
Enablement work before any usable frontend existed to validate it against. The
owner made the correct call: **finish the whole frontend, fully mocked, first** —
see every panel, catch layout/density/interaction problems early, only wire real
data once the UI is actually settled. This is a legitimate strategy for a UI-dense
product like this one, with one hard condition attached (§17.4).

## 17.2 Audit: what actually exists right now

Conducted by direct inspection of the uploaded repository state, not from
`STATE.md`'s self-reported summaries alone.

### 17.2.1 Actual tech stack (supersedes `docs/03` §3.1/§3.3/§3.4 for the frontend)

| | Spec said | Reality |
|---|---|---|
| Framework | React 18 + Vite | React 18 + Vite — **matches** |
| State/Sync Bus | Zustand, replicated over the Gateway WebSocket (`docs/02` §2.3) | Plain React state (`useWorkspace.ts`, 13 lines) + a `SyncBus` class using **`BroadcastChannel`** (`state/syncBus.ts`) — works only same-browser, does not yet reach a real backend or a second physical device |
| Multi-window | Tauri, two native windows | Two **browser windows** via `window.open()`, same origin, `?monitor=main` / `?monitor=secondary` query param — genuinely separate windows, but browser windows, not a packaged desktop app |
| Charts | `lightweight-charts` (TradingView) | Hand-rolled `<canvas>` rendering in `PriceChart.tsx` and `OrderBook.tsx` — no charting library dependency at all |
| Code editor | Monaco | Plain `<textarea>` in `StrategyPanel.tsx`, pre-filled with illustrative (non-executed) mock strategy code |
| `package.json` dependencies | React, Zustand, lightweight-charts, Monaco, visx/d3, etc. | **`react` and `react-dom` only** (plus TS/Vite tooling) |

None of this is wrong for a mock-first UI pass — it's simpler, builds faster, and
has zero backend coupling to break. It does mean **§17.4's wiring phase is a real
engineering lift**, not a thin adapter layer, because the eventual multi-window/
sync/chart/editor requirements in `docs/02`/`docs/03` were not just deferred, they
were built around entirely.

### 17.2.2 Actual component inventory

```
frontend/src/components/
  layout/     MainMonitor.tsx, SecondaryMonitor.tsx
  main/       Header, PriceChart, OrderBook, TradeTape, OrderFlowPanel,
              StrategyMonitorPanel, BottomBar
  secondary/  StrategyPanel, ParametersPanel, DatasetPanel, BacktestPanel,
              ResultsPanel, ExperimentsPanel, ReplayPanel, AnalyticsPanel,
              LogsPanel, RiskPanel, ComparePanel, SweepsPanel, WalkForwardPanel,
              ReportPanel
  shared/     Panel, MockBanner, AlertCenter, CommandPalette
  mock/       mockData.ts (335 lines — candles, order book, trades, strategy
              state, backtest results; deterministic seeded RNG; every export
              prefixed `Mock`/`genMock` on purpose)
  state/      syncBus.ts, useWorkspace.ts
```

Confirmed wired end-to-end (all 14 Secondary tabs render, trade-click on Main
correctly syncs Secondary to Replay via `BroadcastChannel`, `Ctrl+K` palette opens,
`npm run build` succeeds, headless-browser smoke test 26/26 passing per the
`[F.1.C]` `STATE.md` entry).

### 17.2.3 Gap vs. `docs/07`/`docs/08`'s full panel list

**Main Monitor — built**: Header (§7.1), Price Chart (§7.2, canvas-based),
Order Book (§7.3, canvas-based), Trade Tape (§7.6), Order Flow (§7.8), Strategy
Monitor (§7.11), Bottom Bar (§7.16).

**Main Monitor — missing**: Market Microstructure Panel (§7.9), Market Regime
Panel (§7.10), Risk Panel (§7.14, main-side), Execution/System Monitor (§7.15).

**Secondary Monitor — built**: Strategy Panel (§8.3, textarea not Monaco),
Parameters (§8.6), Dataset Selector (§8.8, partial — see below), Backtest Config/
Progress (§8.12–§8.14), Results (§8.16), Experiments (§8.23), Replay (§8.17),
Analytics (§8.25), Logs (§8.26), Risk (§8.14/§12.5-facing), Compare (§9.16),
Sweeps (§9.17), Walk-Forward (§9.18), Report (§10.7).

**Secondary Monitor — missing**: Data Quality Panel as a distinct view (§8.10 —
currently folded into `DatasetPanel` if at all, needs confirming), Event Inspector
(§8.21), "Why?" Investigation (§8.22), Research Notes (§8.24), AI Research tab
(§8.27).

**Not yet assessed**: whether `mock/mockData.ts`'s types actually conform to
`docs/15-api-and-data-model-spec.md` §15.5's schemas field-for-field. This matters
more than any single missing panel — see §17.4.

## 17.3 Governance note: the two things that need your direct decision

1. **Phase 5/6 "DONE" claims.** Blocks `5.1`–`5.4` and `6.3` in the old board were
   marked `done` by `executor-2` before a usable frontend existed to validate
   Paper/Live behavior against, and specifically before `docs/12` §12.4's
   Paper-track-record gate could have been meaningfully satisfied. The new board
   (`coordination.py`, below) marks these `needs_review` — **not** `done`, **not**
   reset to `available`. Nobody should build further Live-trading work on top of
   them, and nobody should assume they're broken either, until you or a session
   with time to actually read that code confirms which is true.
2. **The out-of-band `[F.1.x]` rewrite.** It was owner-directed and I'm treating it
   as legitimate and final — but it happened outside the normal `AGENTS.md` §9
   claim protocol (task IDs `F.1.A`–`F.1.D` don't correspond to any Block in the
   old `docs/16` roadmap). Going forward, even owner-directed out-of-band work
   should still get a real Block ID in `coordination.py` after the fact, specifically
   so the dependency graph and directory-ownership rules keep meaning something.
   This doc's §17.5 board retroactively gives it one (`F.1`, `done`).

## 17.4 The one hard condition on "mock now, wire later"

Everything else about this pivot is fine. This part isn't optional:

**Every mock data shape must be typed against `docs/15-api-and-data-model-spec.md`
§15.5's real interfaces (`MarketEvent`, `BacktestResult`, `DataQualityReport`,
etc.), not invented ad hoc per component.** Right now `mock/mockData.ts` has its
own parallel types (`MockCandle`, `MockTrade`, etc.) — that's fine as an internal
representation, but each one needs a documented mapping to (or should directly
implement) the real doc-15 schema it stands in for. If this slips, "wire the
backend" stops being a swap and becomes a second pass through every component that
consumed the wrong shape. This is Block `F.5` below, and it should happen early,
not last.

## 17.5 Revised task board (see `coordination.py` for the executable version)

```
F.1   Frontend full rewrite (mock-only, flat structure)         DONE (historical)
F.2   Main Monitor: missing panels (Microstructure, Regime,
      Risk, Execution/System Monitor)                            available
F.3   Secondary Monitor: Data Quality, Event Inspector,
      Why Investigation, Research Notes tabs                     available
F.4   Secondary Monitor: AI Research tab (mocked assistant,
      no real LLM call)                                          depends: F.3
F.5   Mock data contract audit — align mock/mockData.ts with
      docs/15 §15.5 schemas field-for-field                      available
F.6   Sync Bus upgrade design (BroadcastChannel → real
      cross-device Sync Bus) — DESIGN ONLY, do not build yet     depends: F.2, F.3
```

`F.2` and `F.3` are safe to run genuinely in parallel — they touch different hub
files (`MainMonitor.tsx` vs `SecondaryMonitor.tsx`). `F.4` waits on `F.3` because
both land in the same hub file and tab list. `F.5` is independent of both and
should start immediately, in parallel, given §17.4's priority. `F.6` is
deliberately scoped as design-only: don't rebuild the Sync Bus until the panel set
(F.2–F.4) has stopped changing shape under it.

Phase 5/6 blocks stay `needs_review` and are excluded from the claimable pool
until you resolve §17.3 item 1.

## 17.6 What "final production, enterprise level" means from here

Concretely, in order:

1. Finish `F.2`–`F.4` — every panel in `docs/07`/`docs/08` exists, mocked, wired,
   and navigable exactly like the "wow experience" sequence in
   `docs/00-vision-and-principles.md` §0.7.
2. `F.5` (mock data contract audit) validated — this is the actual gate that makes
   backend-wiring a swap instead of a rewrite.
3. Resolve §17.3 item 1 (human review of the Phase 5/6 claims) before touching
   Live-trading code again.
4. Only then: `F.6` executes for real (Sync Bus), followed by resuming the
   original `docs/16` backend-wiring blocks against the now-stable, doc-15-conformant
   mock contract — at that point `docs/02`/`docs/03` get a real rewrite pass to
   match whatever multi-window/state approach is chosen (Tauri vs. a lighter
   alternative is worth reopening given how well the plain-browser approach has
   worked so far — that's a decision for whoever picks this up next, not one this
   document makes for you).

## 17.7 Owner-directed completion extension — 2026-09-24

The owner has directed that the frontend be completed first as a fully interactive,
offline, mock-first native application. The executable task definitions and
acceptance criteria are in the `F.7` addendum to `docs/16-implementation-roadmap.md`.

This extension changes the sequence, not the product boundary:

- The frontend must be packaged as a native desktop application rather than delivered
  only as browser windows.
- All documented frontend surfaces must work against a deterministic local runtime.
- Backend, exchange, live-order, and real-LLM integration remain deferred until the
  frontend release candidate is reviewed.
- Tauri 2 is the current desktop recommendation, subject to the compatibility spike
  defined in F.7.D.
- The mock runtime and its cross-window transport are temporary frontend infrastructure,
  not substitutes for the Gateway contracts in `docs/15`.
