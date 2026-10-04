# 16 — Implementation Roadmap

> **Current owner objective (2026-10-04):** build TickLab as a real-data research
> application. Import authentic compatible market data; validate and select a dataset;
> create or select a strategy; run it through the vendored `hftbacktest` engine; store
> reproducible actual results; inspect/replay them; and launch multiple different
> strategies/configurations as bounded concurrent experiments. AI may draft strategies
> but a human reviews, validates and starts each run. No mock data, simulated fills,
> fabricated metrics, or automatic “winner” selection.

## Active plan

[`18-real-research-pipeline.md`](18-real-research-pipeline.md) is the executor-ready
source of truth. It specifies ordered blocks R1–R11, ownership, interface contracts,
exact task procedures, safety constraints, tests and acceptance. Its blocks are
mirrored by `C:\ticklab-coord\coordination.py` into the shared local
`C:\ticklab-coord\coordination.db`. Agents must claim only R1–R11 for current work;
legacy IDs are historical and non-claimable.

The sequence begins with evidence about actual source/engine compatibility. The
already cataloged Binance BTCUSDT **Spot** aggregate trades (2025-01-01 through
2026-10-03) are raw, trades-only, lack historical order-book depth, and are not
backtest eligible. Never label them Futures, invent depth, or claim realistic fills.
R1 must establish a real permitted compatible input path. If required source access is
missing, stop and preserve an explicit blocker; do not mark downstream backtest work
complete from UI or fixture tests alone.

## Release gate

The product is ready for this objective only when all R1–R10 acceptance criteria pass,
all data/access gates are satisfied, and R11 passes the packaged native desktop
journeys against real services and actual engine output. Required journeys include
single strategy backtest/reopen/reproduction; reviewed AI strategy draft; bounded
multi-strategy concurrent batch; parameter sweep; leakage-safe walk-forward; and
explicit rejection of raw Spot/ineligible data. Paper and live order execution are
excluded.

## Historical plans

The former Phase 0–6 and F.7 plans were replaced because their task states and mock-first
sequencing do not describe the current real-data objective. They are retained in Git
history for audit, not as active specifications or acceptance criteria. Detailed
architecture/data/financial/UI contracts remain in docs 00–15 where doc 18 references
them. Resolve any conflict by stopping the affected task and asking the Planner; never
infer financial or market-data behavior.
