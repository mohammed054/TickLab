# 00 — READ FIRST: TickLab Local Solana Research System

This file defines the transformed product direction. It supersedes conflicting product-scope statements in docs/01–08 and the old TickLab Radar user guide. Detailed research behavior is specified in `docs/09-research-system.md`; implementation order and task cards are in `docs/07-phases-and-tasks.md`.

## 0.1 Product objective

Transform the existing Windows Electron app into a **local-first research workstation** for Solana new token launches. It collects real market/on-chain data through approved hosted data APIs while the app is open, stores the data locally, runs local analysis and models, and evaluates strategies without sending transactions or using real funds.

The research system has one user-facing objective: rank opportunities by estimated net outcome while accounting for risk. It must also show the evidence, uncertainty, and scam/risk flags that explain the ranking. The implementation may compare different model types internally, but must not make the user choose among unnecessary separate risk and return systems.

The eventual live-trading system is a separate future project requiring new written owner approval. This project has no transaction signing, wallet secrets, order submission, venue integration, or real-money test phase.

## 0.2 Owner decisions (locked)

| Topic | Decision |
|---|---|
| Existing app | Transform TickLab in this repository. |
| Initial chain/market | Solana new launches. |
| Collection | Save every launch shallowly; selectively collect expensive/deep data. Do not discard failed, scam, dead, or untradeable launches. |
| Data location | Hosted data APIs are allowed. Persist data and run all research/model workloads locally. |
| Capture schedule | Capture while the desktop app is open. Record observable gaps when it is closed or offline. |
| AI | Local predictive ML, controlled strategy search, and optional local LLM support. No cloud inference. Kronos is a candidate to evaluate, not a presumed winner. |
| Machine | Current Windows PC; owner reports RTX 2060 and 16 GB system RAM. GPU VRAM must be measured during Phase 0. |
| Storage | Approximately 200 GB is available. Default managed data allocation is 150 GB, configurable after measuring existing disk use; leave at least 50 GB outside the research allocation. |
| Budget | Prefer free providers; any paid source requires owner approval after a measured coverage/cost comparison. |
| Live trading | Explicitly out of scope. Requires a separate project and approval. |
| Success claims | No strategy or model may be described as guaranteed, safe, or certain to profit. |

## 0.3 Spec authority

For this transformation:

1. Owner decisions in this file govern product scope.
2. `docs/09-research-system.md` governs research architecture, data, labels, risk evidence, models, backtests, and retention. `docs/09-analytics-and-investigation-suite.md` governs financial/backtest formulas. Where these conflict with older docs/01–06, the new docs/09 files win.
3. `docs/07-phases-and-tasks.md` governs task order and acceptance checks. No executor may skip a gate.
4. `docs/08-qa-and-done.md` governs verification and final research readiness. It replaces old live-trade-related test gates.
5. `AGENTS.md` remains in force except when its product references conflict with this transformation. The Planner owns `docs/`; the Executor only edits files named in the active task card.

## 0.4 Executor protocol

1. Read `AGENTS.md`, then the latest relevant `STATE.md` entry.
2. Work on exactly one task card from `docs/07-phases-and-tasks.md`, in dependency order.
3. Read every spec section named in that card. Do not infer financial, data, or model behavior.
4. Edit only files listed in the card. Do not change a dependency or architecture without a Planner task.
5. If the card’s data contract, formulas, or expected behavior are incomplete, stop that subtask and log the precise question in `QUESTIONS.md`.
6. Run the acceptance commands listed on the card; report exact command output. Do not claim a check passed if it was not run.
7. Append progress to `STATE.md` using `AGENTS.md` §3.1. Never rewrite previous entries.
8. Do not add network access to the renderer. Provider calls belong in the Electron main process or the explicitly specified local research worker.

## 0.5 Vocabulary

- **Launch:** a newly discovered Solana DEX pool/market for a token.
- **Token:** a mint address. **Pool:** a DEX market/pool where the token trades.
- **Raw record:** provider response or event stored without lossy transformation.
- **Normalized record:** validated canonical representation with source and time metadata.
- **Observation time:** when the chain/source says an event happened.
- **Available time:** when this app could first have used the record. Features may use only records available by the simulated decision time.
- **Shallow capture:** launch identity and low-cost market snapshots collected for every discovered launch.
- **Deep capture:** higher-cost trades, holder, creator, wallet, security, or social data collected selectively.
- **Risk flag:** an evidence-backed warning. A missing field is `unknown`, never “clear”.
- **Research run:** immutable record of data version, code/model/config, parameters, outputs, and metrics.
- **Paper simulation:** hypothetical strategy execution against real observed data. It never submits an order.
