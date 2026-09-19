# 12 — Execution Modes and Risk

## 12.1 The Three Environments

```ts
type Environment = "RESEARCH" | "PAPER" | "LIVE";
```

| Environment | Market data | Order execution | Capital at risk |
|---|---|---|---|
| `RESEARCH` | Historical replay only | Simulated (backtest fill engine) | None |
| `PAPER` | Live market data (real exchange feed) | Simulated (same fill-simulation logic as backtest) | None |
| `LIVE` | Live market data | Real exchange order entry | Real |

The **Environment Badge** (rendered in the Global Header,
`docs/07-main-monitor-components.md` §7.1, and in the Secondary Header,
`docs/08-secondary-monitor-components.md` §8.1) is always visible, uses distinct,
unmissable styling per environment (not just a small label — background tint using
the semantic warning color for `LIVE` specifically, per
`docs/11-design-system.md` §11.1), and is never abbreviated. A user must never be
able to glance at the screen and be unsure which environment they're in.

## 12.2 Architectural Isolation Mechanism

This is enforced in code structure, not just UI convention:

- The order-submission call in the `SimulatorContract`-facing strategy interface
  (`docs/05-engine-abstraction-and-data-pipeline.md` §5.1) resolves to one of exactly
  two implementations, selected by the session's `Environment` at the service layer
  (`backend/jobs` for Research, `backend/connectors` bridging to a simulated-fill
  service for Paper, `backend/connectors`'s real exchange path for Live) — **the
  strategy code itself never selects or is aware of which implementation is wired
  in**, so a strategy cannot be written (accidentally or otherwise) to bypass the
  isolation.
- The real exchange order-entry code path (`backend/connectors/*`) is **only ever
  reachable when `Environment == "LIVE"` and an explicit Live-mode session has been
  established** (§12.4). It is not merely disabled by a flag checked at call time —
  the Research and Paper code paths do not hold a reference to the live connector
  client at all, so there is no live-order-entry function pointer/handle available
  to call by mistake even under a bug in flag-checking logic (defense in depth: the
  isolation does not rely on a single `if` statement being correct).
- Paper mode's simulated-fill service reuses the exact Local/Exchange
  processor fill-simulation logic from the backtest engine
  (`docs/04-hftbacktest-engine-analysis.md` §4.3) applied to the live order book
  instead of a replayed historical one — this is why Paper mode is architecturally
  "backtesting against a live feed," not a separate reimplementation.

## 12.3 Paper Trading

Environment for validating a strategy against real, live market conditions without
capital risk. Requirements before a strategy may enter Paper (enforced server-side,
`backend/experiments`):
- Status ≥ `BACKTESTED` (`docs/08-secondary-monitor-components.md` §8.3).
- At least one completed backtest experiment exists for the strategy at its current
  code hash (§10.1) — a strategy cannot go straight from an unsaved editor buffer to
  Paper.

While in Paper, the Strategy Monitor (`docs/07-main-monitor-components.md` §7.11),
Risk Panel (§7.14), and all of `docs/09-analytics-and-investigation-suite.md`'s
analytics apply identically to Paper's simulated fills as they do to a completed
backtest's — Paper is not a separate, thinner monitoring experience.

## 12.4 Live Trading

The highest-gated environment. Requirements before a strategy may enter Live
(enforced server-side; the UI additionally disables the control client-side but the
server check is authoritative):
- Status ≥ `VALIDATED`.
- A minimum Paper-trading track record exists: a configurable minimum duration
  and/or minimum number of Paper fills (default values to be set by the project
  owner — logged as an Open Decision in
  `docs/16-implementation-roadmap.md` §0 — but the *mechanism* of requiring some
  non-zero, non-trivial Paper history before Live is not optional).
- An explicit, distinct confirmation step naming the real capital/exchange account
  involved (not a generic "Are you sure?" — it must state the exchange, symbol, and
  configured risk limits being agreed to).
- The action is audit-logged (`docs/14-cross-cutting-systems.md` §14.5) with the
  authorizing user's identity and timestamp.

While in Live: real balance, real position, real orders, real fills, real fees,
margin, latency, connection health, and rejected orders are all displayed
(`docs/07-main-monitor-components.md` §7.11/§7.14/§7.15), sourced from the actual
exchange connector (`docs/06-realtime-live-data-architecture.md` §6.2), never from
any simulated value.

Per `docs/04-hftbacktest-engine-analysis.md` §4.5/§4.10: Live mode today can only
support **L2-based strategies**, since the upstream engine's live bot does not yet
support Level-3 (Market-By-Order) live execution. A strategy developed against L3
data can be backtested and even Paper-traded only insofar as Paper mode's
market-data source for that instrument provides L2 depth to drive the same
fill-simulation logic — an L3-dependent strategy's promotion to `PAPER`/`LIVE` must
be blocked with a clear, specific message citing this exact limitation, not a
generic error.

## 12.5 Risk Controls Configuration

```ts
interface RiskLimitsConfig {
  maxPosition: number;            // base currency units
  maxOrderSize: number;
  maxDailyLoss: number;           // quote currency
  maxDrawdownPct: number;
  maxOpenOrders: number;
  maxOrderRatePerSec: number;
  maxNotionalExposure: number;
  emergencyStopEnabled: boolean;
}
```

Configurable per strategy, per environment (Research-mode limits are advisory/
informational for backtesting realism; Paper/Live limits are **enforced**,
rejecting an order at submission if it would breach a limit, with the rejection
surfaced immediately in the Strategy Monitor and logged). The Risk Panel
(`docs/07-main-monitor-components.md` §7.14) reads these same limit values to
render its warning/breach thresholds (`docs/11-design-system.md` §11.1) — the
limits are configured once, here, and consumed everywhere they're displayed or
enforced, never duplicated.

## 12.6 Strategy Status Transition Graph

```
DRAFT → TESTING → BACKTESTED → VALIDATED → PAPER → LIVE
                                     ↕
                                  PAUSED / STOPPED
                                     ↓
                                 ARCHIVED
```

Rules:
- Forward transitions require the gate described at each stage above (§12.3, §12.4)
  and in `docs/08-secondary-monitor-components.md` §8.3.
- `VALIDATED` specifically requires a human to have reviewed the backtest results
  and explicitly marked it validated (a deliberate manual gate — this status can
  never be set automatically by a job completing, even a successful one).
- Any status can move to `PAUSED`/`STOPPED` (§12.8, the kill switch) or `ARCHIVED`.
- A strategy generated by the AI Research Assistant
  (`docs/10-experiment-management-and-ai-research.md` §10.5.3) always starts at
  `DRAFT` and must pass through every gate identically to a human-written
  strategy — there is no accelerated path for AI-originated strategies.
- This graph is enforced in `backend/experiments`; the frontend reflects it but
  never independently decides whether a transition is allowed.

## 12.7 Feature Flags and Local Dev Defaults

`LIVE` mode (and the real exchange connectors, `backend/connectors/*`) is
feature-flagged **off by default** in local development
(`docs/03-tech-stack-and-repo-structure.md` §3.7) — the connector processes are not
even started by the default `docker-compose.yml` profile. Enabling Live mode
requires an explicit opt-in flag plus real exchange API credentials configured
through the standard secrets mechanism (never committed, never logged in plaintext
— see `docs/14-cross-cutting-systems.md` §14.4 for structured-logging redaction
rules covering credential fields).

## 12.8 Kill Switch

Prominent, always-reachable control (Main Monitor Risk Panel,
`docs/07-main-monitor-components.md` §7.14, and the command palette,
`docs/14-cross-cutting-systems.md` §14.2): **`STOP STRATEGY`**. Granular options:

- Stop submitting new orders (existing working orders remain).
- Cancel all open orders.
- Stop the strategy entirely (sets status to `STOPPED`).
- Disconnect from the exchange (Live only — severs the connector session).

In `LIVE` mode, activating any kill-switch option requires the same confirmation
step as §12.4's Live-entry gate (naming the exchange/account affected). Every
activation is audit-logged (`docs/14-cross-cutting-systems.md` §14.5) with which
option was used, by whom, and at what timestamp — this log is itself surfaced in
the Logs tab (`docs/08-secondary-monitor-components.md` §8.26) and is never
deletable through the normal UI.
