# 10 — Experiment Management and AI Research Assistant

## 10.1 What an experiment is

Every completed backtest, parameter-sweep cell, walk-forward window, or robustness
repetition becomes an **immutable experiment record**, stored by `backend/
experiments`. An experiment captures everything needed to reproduce it exactly —
this is the "Backtest Transparency" requirement made concrete:

```ts
interface Experiment {
  id: string;                    // content-addressed or UUID — see §10.3
  strategyRef: { id: string; version: string; codeHash: string };
  parameters: Record<string, number | string | boolean>;
  datasetId: string;             // content-addressed, docs/05 §5.3
  dateRange: { start: string; end: string };
  exchange: string; symbol: string; market: string;
  executionModel: {
    makerFee: number; takerFee: number;
    latencyModel: LatencyModelConfig;
    queueModel: QueueModelConfig;
    allowPartialFills: boolean;
    orderTypesAllowed: OrderType[];
  };
  riskLimits: RiskLimitsConfig;   // docs/12 §12.5
  randomSeed: number | null;
  createdAt: string;
  createdBy: { agentType: "human" | "ai-assistant"; id: string };
  parentExperimentId: string | null;   // for tree branching, §10.2
  status: "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED" | "CANCELLED";
  results: BacktestResult | null;      // docs/15 §15.5
  notes: Note[];                        // docs/08 §8.24
}
```

Nothing about an experiment's inputs is ever mutated after creation. "Editing" a
strategy or parameters and re-running always creates a **new** experiment with
`parentExperimentId` pointing at the one it was derived from.

## 10.2 Experiment Tree

Rendered in `docs/08-secondary-monitor-components.md` §8.23. A tree of experiments
grouped by strategy lineage:

```
MM_V17
 ├─ MM_V17.1
 ├─ MM_V17.2
 └─ MM_V17.3

MM_V18
 ├─ Spread Test
 ├─ Volatility Test
 └─ Inventory Test
```

- **Branching**: creating a new experiment from an existing one (changing a
  parameter, dataset, or execution model) adds a new child node.
- **Duplication**: `DUPLICATE` creates an exact-input copy as a new sibling, useful
  as a starting point before making a change (keeps the "before" version intact and
  separately runnable rather than overwritten).
- Per-node actions: `OPEN` (loads it into the Results/Analytics views, §8.16/§8.25),
  `DUPLICATE`, `COMPARE` (multi-select ≥2 nodes → `docs/09-analytics-and-investigation-suite.md`
  §9.16 comparison view), `REPRODUCE` (§10.3), `EXPORT` (§10.6).

## 10.3 Reproduce Experiment

`REPRODUCE` re-submits a **new** job using the exact stored `Experiment` config
(strategy at its recorded `codeHash`, parameters, dataset at its recorded
`datasetId`, execution model, random seed). It produces a new experiment record
(not a mutation of the old one) so the reproduction itself is auditable — if a
"reproduction" doesn't match the original's results, that discrepancy is a real
signal (engine nondeterminism, a dataset that was silently altered, etc.) and must
be visible, not hidden by overwriting history.

Reproducibility depends on: (a) the strategy code being addressed by content hash,
not just a mutable "latest version" pointer; (b) the dataset being content-addressed
per `docs/05-engine-abstraction-and-data-pipeline.md` §5.3; (c) the random seed being
stored and reused; (d) the engine/abstraction-layer version itself being recorded
(`engineVersion` field, added to `BacktestResult` per
`docs/15-api-and-data-model-spec.md` §15.5) so an engine upgrade that changes
behavior is a visible, explainable fact rather than a silent discrepancy.

## 10.4 Research Notes

See `docs/08-secondary-monitor-components.md` §8.24 for the UI. Storage: a `notes`
table keyed by `(target_type, target_id)` where `target_type ∈ {strategy,
experiment, timestamp, trade, fill, chart_view}`. Every note records `authoredBy`
distinguishing human users from the AI Research Assistant (§10.5) — this matters
because an AI-authored note proposing a hypothesis is a different kind of object
than a human's own conclusion, and the UI must visually distinguish them (a small
badge, `docs/11-design-system.md` §11.8), never blend them indistinguishably.

## 10.5 AI Research Assistant

Component: `docs/08-secondary-monitor-components.md` §8.27 (UI),
`backend/ai/app/` (service). This is an **optional**, explicitly invoked assistant,
never a background process that acts on its own.

### 10.5.1 Capabilities
- Explain metrics (in plain language, referencing the exact definitions in
  `docs/09-analytics-and-investigation-suite.md`, never inventing an alternative
  explanation of what a metric means).
- Inspect experiments (via read-only tool calls into the Experiment Store and the
  analytics query endpoints — the same endpoints the frontend itself calls, per
  `docs/09` §9.14's evidence-routing requirement).
- Identify unusual behavior (e.g., flag a period where adverse selection spiked, by
  querying §9.6's aggregated markout distribution and comparing against the
  experiment's own trailing baseline — not against some hardcoded universal
  threshold).
- Summarize results.
- Propose hypotheses and generate **draft** experiment configurations.
- Explain failures (a failed/crashed backtest job, using the structured error/log
  data from `docs/14-cross-cutting-systems.md` §14.4/§14.9).

### 10.5.2 Hard constraints (enforced in `backend/ai`, not just in the prompt)
- **No write access** to strategy code, order submission, risk limits, or any
  execution-affecting configuration.
- **Cannot start a job.** It can only produce a `DraftExperimentConfig` payload,
  rendered inline in the chat as a `[ CREATE EXPERIMENT ]` action. Clicking it hands
  the exact same payload to the normal experiment-creation flow (§10.1) — the
  assistant never calls that flow itself.
- **Every substantive claim must cite the query/evidence it came from**, shown in a
  persistent side panel next to the chat (per `docs/08` §8.27). A response with no
  linked evidence for a factual claim about the data is a bug, not an acceptable
  informal answer.
- **Never states a conclusion as certain when the underlying analysis is
  statistical** — mirrors the product-wide honesty-about-uncertainty principle
  (`docs/00-vision-and-principles.md` §0.6 item 4); e.g., never "this strategy is
  bad," always something like: "during the highest-volatility intervals, adverse-
  selection losses increased while average spread capture remained relatively
  unchanged — worth testing wider quotes specifically during elevated volatility,"
  paired with the `[ CREATE EXPERIMENT ]` action pre-filled with that specific
  change.
- Model-agnostic client (`backend/ai/app/llm_client.py`) — no vendor lock-in baked
  into the rest of the system; the model/provider is a configuration value.

### 10.5.3 AI Strategy Generation
A specific, higher-stakes capability: given a natural-language description (e.g.,
"create a market-making strategy that adjusts quote width based on volatility and
inventory"), the assistant generates: a strategy description, its assumptions,
starting parameters, generated code (conforming to the `SimulatorContract`-facing
strategy interface, `docs/05-engine-abstraction-and-data-pipeline.md` §5.1), and a
draft experiment configuration to backtest it. This lands in the Strategy Editor
(`docs/08-secondary-monitor-components.md` §8.4) as a new `DRAFT`-status strategy
(§8.3) for the user to review, edit, and explicitly run `VALIDATE`/`BACKTEST`
themselves — **never auto-run, and never eligible for `PAPER` or `LIVE` status
without passing through the same human-gated status transitions as any other
strategy** (`docs/08` §8.3, `docs/12-execution-modes-and-risk.md` §12.6). Generated
code is visually marked as AI-generated (badge, same treatment as §10.4's note
distinction) until a human has reviewed and it has passed `VALIDATE` at least once.

## 10.6 Export

Every experiment supports export to: CSV (fills/events tables), JSON (full config +
results), a rendered experiment report (§10.7), chart images, and the strategy's
own configuration file (re-importable to scaffold a new strategy from it). Exports
are generated server-side (`backend/experiments`) so large event-log exports don't
block the browser, following the async-job rule
(`docs/01-architecture-overview.md` §1.5) once past a size threshold (configurable;
default 50MB uncompressed).

## 10.7 Report Builder

Generates a single shareable document per experiment (or per comparison set)
containing: strategy identity/version, dataset identity, parameters, execution
assumptions, headline performance (`docs/09-analytics-and-investigation-suite.md`
§9.1), risk figures (`docs/12-execution-modes-and-risk.md` §12.5's relevant
subset), trade statistics (§9.5), P&L attribution (§9.4), key charts (equity curve,
drawdown, at minimum), any flagged anomalies/failures, and attached notes (§10.4).
Rendered as PDF/HTML server-side; must never silently omit a section because data
was missing — a missing section renders as an explicit "not available for this
experiment" placeholder, per the empty-state rule in
`docs/14-cross-cutting-systems.md` §14.7.
