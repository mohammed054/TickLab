# 00 — Vision and Principles

## 0.1 What this is

A professional, two-monitor **quantitative research workstation** for Bitcoin
(architected to extend to other symbols later) that lets a user:

observe the live market → inspect market microstructure → form a hypothesis → build
a strategy → configure execution assumptions → backtest it → visualize results →
investigate individual trades → replay the exact market conditions that produced
them → modify the strategy → run another experiment → compare experiments → paper
trade → eventually connect to live execution.

## 0.2 What this is not

- **Not** a generic crypto price dashboard.
- **Not** a simple order-entry trading terminal.
- **Not** a thin UI wrapper that just calls into `hftbacktest` and prints a
  Sharpe ratio.
- **Not** a product where "Strategy made +$1,000" is ever an acceptable final
  answer to "how did it do."

## 0.3 The central question

Every screen, panel, and interaction in this product exists to answer one question:

> **What happened, why did it happen, what did my strategy do about it, and what
> should I test next?**

Every major object in the system — a candle, a book update, a trade, a strategy
decision, an order, a fill — is connected through shared timestamps and IDs so the
user can always trace the full causal chain:

```
market event → market state → strategy observation → strategy decision → order
→ latency → queue position → fill → price response → P&L → risk → explanation
→ new hypothesis
```

If a feature cannot be traced back to this chain, question whether it belongs in
the product.

## 0.4 The central product loop

```
OBSERVE → HYPOTHESIS → STRATEGY → DATA → EXECUTION MODEL → BACKTEST → RESULT
→ ATTRIBUTION → REPLAY → UNDERSTAND → MODIFY → EXPERIMENT → COMPARE → PAPER → LIVE
```

Every doc in this repo maps to one or more stages of this loop. When adding a
feature that doesn't obviously belong to a stage, that's a signal to either place it
correctly or question whether it belongs in the product at all.

## 0.5 The two-monitor mental model

- **Main monitor (large, landscape): LOOK.** What is happening in the market and to
  my strategy, right now or at the replayed instant?
- **Secondary monitor (smaller, tilted left): THINK.** What should I test,
  investigate, or change?

The two monitors are **one application**, not two independent dashboards. They share
a synchronized cursor: timestamp, symbol, exchange, dataset, strategy, experiment,
order, and fill. See `docs/02-two-monitor-workspace-spec.md` for the full contract.

## 0.6 Design values, in priority order

1. **Truth over decoration.** Every number shown must be traceable to a real
   calculation defined in `docs/09-analytics-and-investigation-suite.md`. No
   placeholder metrics, no invented confidence numbers.
2. **Investigability over summary.** A single top-line P&L number is never the end
   of the story — it must always be one click from full attribution.
3. **Reproducibility over convenience.** Every backtest is a versioned, replayable
   experiment (`docs/10-experiment-management-and-ai-research.md`). If it can't be
   reproduced exactly, it isn't trustworthy.
4. **Honesty about uncertainty.** Market "regime" classifications, AI research
   assistant conclusions, and order-book-imbalance signals are always shown as
   statistical associations with confidence, never as guarantees. See
   `docs/09-analytics-and-investigation-suite.md` §9.9 and
   `docs/10-experiment-management-and-ai-research.md` §10.5.
5. **Performance as a feature.** A workstation that freezes while replaying 40
   million events has failed regardless of how correct its math is. See
   `docs/03-tech-stack-and-repo-structure.md` §3.6 for performance budgets.
6. **Isolation as a safety property, not a preference.** Research, Paper, and Live
   environments are architecturally separated so a research-mode bug can never
   place a live order. See `docs/12-execution-modes-and-risk.md`.

## 0.7 The "wow" experience this product must deliver

By the end of a session, the user should be able to say:

> "I can see the market. I can understand the market. I can see exactly what my
> strategy is doing. I can test ideas. I can reproduce results. I can investigate
> failures down to individual market events."

Concretely, in one sitting, the user should be able to:

1. Open the workstation and see the live BTC price, order book, and trade flow.
2. See current strategy quotes, inventory, and P&L.
3. Open a strategy, select historical data, configure fees/latency/queue model.
4. Run a backtest over tens of millions of events without the UI freezing.
5. Watch the equity curve build, click a losing section, and have **both monitors**
   jump to that exact timestamp.
6. Replay the market tick by tick, watch the strategy's decision, see the order's
   latency and queue position, watch the fill, and see the price move afterward.
7. See adverse-selection and P&L attribution for that specific trade.
8. Change one parameter, rerun, and compare the two experiments side by side.
9. Run a robustness/parameter-sweep pass to see how sensitive the result is.
10. Promote the strategy to paper trading and keep researching.

## 0.8 Non-goals for the initial build

To avoid scope collapse, the following are explicitly deferred (tracked in
`docs/16-implementation-roadmap.md` as later phases, not cut):

- Multi-symbol support beyond BTC (architecture must allow it; UI does not need to
  fully expose it in Phase 1–3).
- Live trading connectivity (Research and Paper modes ship first; Live mode ships
  only after Paper mode has been validated in production use — see
  `docs/12-execution-modes-and-risk.md` §12.6).
- Options/derivatives analytics beyond basic funding/open-interest display.
- Mobile/responsive layouts. This is a desktop, dual-monitor, professional tool.

## 0.9 How to use this documentation set

This is written for two audiences at once: the project owner (for review/decisions)
and AI Executor agents (for implementation). Every doc after this one is written at
implementation-detail level — exact component names, exact fields, exact behaviors —
specifically so an Executor model does not need to infer intent. If you find
yourself inferring intent while implementing, stop and re-read `AGENTS.md` §4.
