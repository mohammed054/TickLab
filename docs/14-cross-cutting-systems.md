# 14 — Cross-Cutting Systems

Systems used across every feature area rather than owned by one panel.

## 14.1 Global Search

Component: `features/search/GlobalSearch.tsx`. Searches across: strategies,
experiments, datasets, trades, orders, timestamps, notes, and logs. Each result
type navigates via the Sync Bus (`docs/02-two-monitor-workspace-spec.md` §2.3) to
the correct view exactly as a direct user interaction would (a trade result sets
`selectedTradeId` and opens Trade Investigation, `docs/08-secondary-monitor-components.md`
§8.20; a dataset result opens the Data Center, `docs/13-data-management-and-monitoring.md`
§13.2) — search results are an entry point into the same navigation graph, not a
separate rendering path.

## 14.2 Command Palette

`Ctrl+K`, component `features/command-palette/CommandPalette.tsx`. A fuzzy-searchable
list of actions, at minimum: Run backtest, Open BTC order book, Open strategy,
Replay timestamp, Compare experiments, Show latest results, Start paper trading,
Show adverse-selection analysis, Open dataset, Switch workspace preset
(`docs/02-two-monitor-workspace-spec.md` §2.5), Stop strategy (kill switch,
`docs/12-execution-modes-and-risk.md` §12.8). Every command palette action must
correspond to a real navigation/action already reachable through the normal UI —
the palette is an accelerator, never a hidden feature surface with functionality
unavailable elsewhere.

## 14.3 Alert Center

Component: `features/alerts/AlertCenter.tsx`. Alert types: feed disconnected,
latency elevated (threshold-configurable, ties into
`docs/06-realtime-live-data-architecture.md` §6.5's budget), inventory approaching
limit (`docs/12-execution-modes-and-risk.md` §12.5), drawdown threshold, daily loss,
strategy stopped, order-rejection spike, unusual volume, unusual liquidity, strategy
error. Each alert carries a severity (`info | warning | critical`, styled per
`docs/11-design-system.md` §11.1), a timestamp, and — where applicable — a direct
link into the relevant investigation view (a latency alert links to Latency
Analysis, `docs/09-analytics-and-investigation-suite.md` §9.9; a drawdown alert
links to the Drawdown view, §9.3). Alerts are persisted (`alert_history` table,
`docs/15-api-and-data-model-spec.md` §15.5) so the Alert Center also serves as a
historical record, not just a live toast/notification feed.

## 14.4 Structured Logging

Categories: `Market, Strategy, Orders, Execution, Risk, Data, System, Errors`.
Levels: `Debug, Info, Warning, Error, Critical`. Every backend service emits
structured (JSON) log lines carrying at minimum: `timestamp, category, level,
service, message, context` (a free-form object for relevant IDs — experiment ID,
order ID, dataset ID, etc., so a log line can always be correlated back to the
object it concerns). The Logs tab (`docs/08-secondary-monitor-components.md` §8.26)
filters by category/level and supports jumping from a log line's `context.timestamp`
into the Event Inspector (`docs/08` §8.21) via the Sync Bus, exactly like any other
timestamp-bearing UI element.

**Redaction rule**: any field matching a credential/secret pattern (exchange API
keys/secrets, session tokens) is redacted (`***REDACTED***`) before a log line is
persisted or transmitted — enforced by a shared logging middleware
(`backend/*/logging.py` or `.rs` equivalent per service), not left to each call site
to remember. This applies with no exception in `LIVE` mode
(`docs/12-execution-modes-and-risk.md` §12.7).

## 14.5 Audit Log

A separate, append-only log (distinct from the operational Structured Logging above)
specifically for security/compliance-relevant actions: Live-mode entry/exit
(`docs/12-execution-modes-and-risk.md` §12.4), kill-switch activations (§12.8),
data-quality override acknowledgments (`docs/08-secondary-monitor-components.md`
§8.10), dataset deletion (`docs/13-data-management-and-monitoring.md` §13.2), and
risk-limit configuration changes. Every audit entry records: timestamp, acting
user/agent identity, action, and the specific object/value affected. The audit log
is never editable or deletable through the normal application UI — only through a
separate, explicitly privileged administrative path out of scope for Phase 1–4.

## 14.6 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Command palette (§14.2) |
| `Ctrl+B` | Run backtest |
| `Ctrl+R` | Open replay |
| `Ctrl+S` | Save (current strategy/parameters) |
| `Ctrl+Shift+E` | Open Experiments tab |
| `Space` | Replay pause/play (`docs/08-secondary-monitor-components.md` §8.17) |
| `←` / `→` | Event step (§8.18) |
| `F` | Fit chart to data (`docs/07-main-monitor-components.md` §7.2.7) |
| `Esc` | Close panel / clear crosshair lock (`docs/07` §7.2.5) |

Shortcuts are defined once in `frontend/src/shared/hooks/useKeyboardShortcuts.ts`
and must not be redefined per-feature with conflicting bindings — a new shortcut
proposal is a `NEEDS_PLANNER_REVIEW` per `AGENTS.md` §5.5, since this table is the
single source of truth.

## 14.7 Empty, Idle, and Disabled States

Every panel that can have "nothing to show" must implement an explicit empty state,
not a blank area or a zeroed-out set of numbers. Pattern (implemented as the shared
`EmptyState` primitive, `docs/11-design-system.md` §11.10):

```
{ICON}
{TITLE, e.g. "NO STRATEGY LOADED"}
{one-line explanation}
[ PRIMARY ACTION ]   (e.g. "CREATE STRATEGY" or "OPEN EXPERIMENT")
```

Applies to: no strategy loaded (`docs/07-main-monitor-components.md` §7.18), no
data yet for a metric that requires live measurement — e.g., latency before any
message has been received (`docs/06-realtime-live-data-architecture.md` §6.5's "no
data yet" rule: render `—` or an explicit "no data yet" label, **never** a
fabricated placeholder number), a disabled chart mode when the current dataset
lacks the required granularity (`docs/07` §7.2.1), and an empty experiment tree
before any backtest has run.

## 14.8 Loading States

Any operation that takes long enough to be perceptible shows real progress, not an
indefinite spinner, whenever real progress information exists (it almost always
does, per the async-job design in `docs/01-architecture-overview.md` §1.5):

```
LOADING BTC ORDER BOOK
Reconstructing {n} events
{progress_bar} {pct}%
```

Only genuinely indeterminate waits (e.g., waiting for the very first WebSocket
message on a fresh connection) may use an indeterminate spinner, and even then must
carry a text label describing what is being waited for, never a bare spinner alone.

## 14.9 Error States

Distinguish, with distinct visual treatment and messaging, and route to detailed
logs (§14.4) rather than a raw stack trace in the primary UI: exchange disconnected,
invalid data, missing dataset, corrupted file, backtest failure, strategy exception,
unsupported symbol, unsupported event type, insufficient memory, missing latency
data. Every error state's user-facing message states what happened and what the
user can do next (retry, open logs, contact nothing-since-this-is-self-hosted — but
always *something* actionable); "Error: undefined" or an unhandled raw exception
reaching the UI is a bug, not an acceptable error state.

## 14.10 Export

Component: `features/export/ExportMenu.tsx`, available wherever exportable content
exists (results, `docs/08-secondary-monitor-components.md` §8.16; experiment
comparisons; raw event selections, `docs/13-data-management-and-monitoring.md`
§13.4). Formats: CSV, JSON, trade logs, experiment reports (rendered via
`docs/10-experiment-management-and-ai-research.md` §10.7's Report Builder), chart
images, strategy configuration, metrics, and selected raw events. Exports beyond a
size threshold are handled as async jobs (`docs/01-architecture-overview.md` §1.5),
never a blocking browser download attempt for a multi-gigabyte event log.

## 14.11 Workspace Presets

Specified in full in `docs/02-two-monitor-workspace-spec.md` §2.5 (this section
exists only so the cross-cutting-systems index doesn't omit it) — presets
(`MARKET, RESEARCH, BACKTEST, REPLAY, EXECUTION, PAPER, LIVE`) are switchable from
the command palette (§14.2) and a preset switcher in the Global Header.

## 14.12 Multi-Symbol and Derivatives Support (architectural readiness, not Phase 1–3 UI scope)

Per `docs/00-vision-and-principles.md` §0.8, BTC is the sole Phase 1–3 workflow, but
no component in `docs/07`/`docs/08` may hardcode `"BTCUSDT"` as a literal anywhere —
`symbol`/`exchange` are always read from the Sync Bus
(`docs/02-two-monitor-workspace-spec.md` §2.3.1). When multi-symbol support is
scoped (Phase 6+), the Global Header, Dataset Selector, and a new Market Overview
panel (secondary, non-primary view showing BTC/ETH/SOL price, volume, volatility,
funding, liquidity, correlation side by side) extend the existing components rather
than requiring new ones. Derivatives-specific fields (funding rate, next funding,
open interest, liquidation activity, mark price, index price, basis) are already
part of the normalized `MarketEvent` schema (`docs/15-api-and-data-model-spec.md`
§15.5) wherever the instrument is a futures contract, so surfacing them later is a
UI-only addition, not a data-model change.
