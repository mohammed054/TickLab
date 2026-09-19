# 06 — Real-Time Live Market Data Architecture (Low-Latency Path)

This doc answers directly: **when this scales to fetching real market data at very
short millisecond delays, how does that work, and how is it kept separate from the
"run backtests at CPU speed" concern?** These are two different engineering
problems with two different solutions; conflating them is a common mistake this doc
exists to prevent.

## 6.1 Two different speed problems — do not solve them the same way

| | Backtesting throughput | Live low-latency data |
|---|---|---|
| Goal | Process tens of millions of historical events as fast as possible | React to a live event within single-digit milliseconds of it occurring |
| Bottleneck | CPU instruction throughput, I/O read speed, sequential event-loop cost | Network round-trip time, process/thread scheduling jitter, serialization overhead |
| Scaling axis | More CPU cores running more independent backtests in parallel (`docs/05` §5.6) | Physical proximity to the exchange, minimizing hops/copies, dedicated low-jitter processes |
| GPU relevant? | No (sequential sim loop) | No (latency, not throughput, is the constraint; GPUs add latency, not reduce it, for this kind of workload) |

## 6.2 The hot path: exchange → strategy decision → order

This path must be as short and as few-hop as possible. Design, in order of
increasing scale:

### Phase 1–3 (Paper trading, single exchange, single strategy)
```
Exchange WebSocket (market data)  ─┐
Exchange WebSocket/REST (orders)  ─┤
                                    ▼
                     Live Exchange Connector (Rust process)
                     — reuses/extends hftbacktest's connector/ crate
                     — one process per exchange
                     — owns the WS session(s), maintains local order-book state,
                       reconciles order/fill acknowledgements
                                    │
                     Local IPC (per hftbacktest's own architecture:
                     zero-copy shared-memory transport, e.g. iceoryx2 — see
                     docs/04-hftbacktest-engine-analysis.md §4.5)
                                    ▼
                     Live Bot process (Rust) — runs the strategy's decision
                     logic, same code path as backtest via SimulatorContract
                     (docs/05 §5.1), submits orders back through the connector
```

This mirrors `hftbacktest`'s own existing live-bot design rather than inventing a
new one — the connector process already exists upstream for Binance
Futures/Spot and Bybit, already separates market-data/order-management concerns per
exchange, and is already intended to support multiple bots per connector via IPC. We
extend it; we do not replace it.

**Everything downstream of the Live Bot (UI, analytics, alerts) reads from a
separate, lower-priority path (§6.3) and never sits between the exchange and the
strategy's order submission.** This is the single most important rule in this
document: *the GUI must never be able to add latency to the trading decision path,
even indirectly (e.g., by the strategy process being slowed down because it's also
trying to push a WebSocket update to a browser).*

### Phase 5+ (multiple strategies / multiple users / horizontal scale)
- Multiple Live Bot processes attach to the same Connector process via the same IPC
  mechanism (this is exactly what the shared-memory IPC choice is for — one
  exchange session, many consumers, no per-bot WS connection overhead or exchange
  rate-limit multiplication).
- The Connector process is deployed on infrastructure chosen for **network
  proximity to the exchange's matching engine** (e.g., a cloud region colocated with
  or nearest to the exchange's published matching infrastructure, or a bare-metal/
  colocation provider if the strategy's edge genuinely requires sub-millisecond
  tiers — this is a cost/benefit decision to make explicitly once Live mode scope
  and target exchange are finalized; see `docs/16-implementation-roadmap.md` §0 Open
  Decisions).
- If multiple exchanges are traded, each gets its own Connector process; they are
  never merged into one process, so one exchange's connectivity issue cannot affect
  another's.

## 6.3 The observability path: exchange → UI

This is a **completely separate, intentionally decoupled** path, allowed to have
normal web-application latency (tens of milliseconds is fine; even hundreds is
acceptable for a status display, though we target better):

```
Live Exchange Connector / Live Bot
        │  publishes normalized market + strategy-state events
        ▼
   NATS (pub/sub, in-memory subjects, not the trading hot path)
        │
        ▼
  Market Data Service (backend/market) — normalizes, maintains a
  Redis-cached "current state" snapshot (book top-N, recent trades,
  strategy state) for fast reconnect/late-subscriber catch-up
        │
        ▼
      Gateway (WebSocket fan-out to connected frontend clients)
        │
        ▼
   Frontend (Main Monitor renders it)
```

- The Connector/Live Bot publish-and-forget onto NATS; they never wait for an
  acknowledgment from anything downstream. A slow or disconnected frontend client
  has **zero** effect on trading.
- The Market Data Service batches/coalesces updates for UI consumption at a sane
  render rate (e.g., order-book deltas can arrive at exchange rate — hundreds/sec —
  but the UI only needs consistent ~30–60Hz visual updates; batch accordingly rather
  than pushing every raw delta to the browser).
- If the frontend disconnects and reconnects, it re-syncs from the Redis snapshot
  (current book + recent trade tape + current strategy state) rather than needing
  the full historical event stream replayed.

## 6.4 Backtesting reuses the same normalized event schema, different source

Both the Live path (§6.2/6.3) and the Replay path
(`docs/01-architecture-overview.md` §1.2 "Market Data Service") publish the **same
normalized event schema** to the frontend (`docs/15-api-and-data-model-spec.md`
§15.5 `MarketEvent`). This is what lets `docs/02-two-monitor-workspace-spec.md`'s
Sync Bus and every chart/order-book/tape component in
`docs/07-main-monitor-components.md` work identically whether the data is live,
paper, or historical replay — only the `environment` field and its visual badge
differ (`docs/12-execution-modes-and-risk.md` §12.1). The **source** of that schema
differs sharply in latency characteristics (§6.1), but the **shape** does not.

## 6.5 Concrete latency budget for the hot path (target, to validate empirically in
Phase 4/5 when Live mode is actually built)

| Segment | Target |
|---|---|
| Exchange match → exchange WS message sent | Outside our control (exchange-side) |
| Exchange WS message → Connector process receives | < 1–5ms typical (network + dedicated infra dependent) |
| Connector → Live Bot via shared-memory IPC | Sub-100 microseconds (this is the entire point of using a zero-copy IPC transport instead of, e.g., HTTP or even a TCP loopback socket) |
| Strategy decision computation | Strategy-dependent; budget and measure per strategy, surfaced in the Execution/System Monitor (`docs/07-main-monitor-components.md` §7.15) as "decision latency" |
| Live Bot → Connector (order submit) via IPC | Sub-100 microseconds |
| Connector → Exchange (order REST/WS-order-API call) | Network + exchange-side; this is typically the largest controllable component — prefer the exchange's WebSocket order-entry API over REST where available (see `docs/16-implementation-roadmap.md` Phase 4 task for evaluating Binance's WS order API, noted upstream as a planned connector improvement in `docs/04-hftbacktest-engine-analysis.md`'s ROADMAP.md-derived notes) |

These numbers are **targets to validate against real measurements once Phase 4/5
Live infrastructure exists**, not guarantees baked into this doc. Every number the
product surfaces to the user (the header's `LATENCY 18.4ms`, the Execution Monitor's
latency graph — `docs/07` §7.15) must be a **measured** value from the actual
running system, never a hardcoded or simulated placeholder, even during early
development (use a clearly-labeled "no data yet" state per
`docs/14-cross-cutting-systems.md` §14.7 instead of fabricating a number).

## 6.6 Colocation and infrastructure decision (flagged for the project owner)

Achieving genuinely competitive HFT-grade latency (sub-millisecond, exchange-side)
generally requires colocated or near-colocated infrastructure specific to the target
exchange, which is a real infrastructure/cost decision (specific cloud region,
bare-metal provider, or formal colocation), not a software architecture decision
this document can make unilaterally. This is logged as an Open Decision in
`docs/16-implementation-roadmap.md` §0 for the project owner, to be resolved before
Phase 5 (Live mode rollout) begins. Phases 1–4 (Research + Paper trading) do not
require this decision to proceed, since Paper trading's latency requirements are
materially looser (it simulates execution against live market data rather than
routing real orders).

## 6.7 Why Paper mode is the right proving ground before Live

Paper mode (`docs/12-execution-modes-and-risk.md` §12.1) uses the **exact same live
market data ingestion path** described in §6.2/6.3 (real exchange WS feed, real
Connector process, real Live Bot decision logic) but simulates the order-entry/fill
step instead of routing to the exchange's real order-entry endpoint. This means:

- The entire low-latency data path is exercised and can be measured/tuned in Paper
  mode before any real capital or real order risk exists.
- The only thing that changes between Paper and Live is which implementation of the
  "submit order" call is wired in — a simulated fill engine (reusing the same
  Local/Exchange processor fill-simulation logic as backtesting, per
  `docs/04-hftbacktest-engine-analysis.md` §4.3) vs. the real exchange REST/WS
  order-entry call.
- This is enforced architecturally, not just by convention — see
  `docs/12-execution-modes-and-risk.md` §12.2 for the exact isolation mechanism.
