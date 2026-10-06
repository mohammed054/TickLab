# 16 — New Product Roadmap

Status: **APPROVED PRODUCT DIRECTION — FEASIBILITY PHASE REQUIRED BEFORE PRODUCT CODE**
Vision: `docs/19-solana-launch-research-workstation.md`
Detailed staged proposal: `docs/20-solana-research-roadmap-proposal.md`

## Product direction

TickLab is moving from Bitcoin high-frequency backtesting toward a local-first Solana
launch research workstation. The objective is to test whether transparent, persistent
on-chain launch and wallet-behavior research can support a useful trading edge. The
product must not promise profit, a weekly income, or market-beating performance.

## Current phase: P0 feasibility

Before implementation, establish that a free or zero-startup-cost local workflow can
collect enough permitted, attributable Solana launch/trade/liquidity data to study the
chosen hypotheses. Check current provider terms, coverage, rate limits, event parsing,
gaps, restart recovery, and local storage. Public shared RPC is acceptable for
development and best-effort research; it is not accepted as a reliable first-block
trading feed.

P0 may conclude that:

1. a narrow observer and paper-research prototype is feasible at zero startup cost;
2. only a reduced monitoring use case is feasible under free data constraints; or
3. the source/data requirements are not feasible without paid access.

Report the evidence and recurring/one-time costs, if any. Do not start application
implementation or enable live trading until P0's result is reviewed by the owner.

## Proposed stages

| Stage | Goal | Gate |
|---|---|---|
| P0 | Repository inventory and data/provider feasibility | Attributed sample, terms, coverage, gaps, resource cost, restart test plan |
| P1 | Local observer and immutable provenance journal | Real events persisted; missing events and provider limits visible |
| P2 | Token timeline and wallet behavior evidence graph | Every derived edge links to source; uncertain identity is explicit |
| P3 | Full-cohort historical hypothesis research | Frozen labels, no look-ahead, complete denominators, costs and baselines |
| P4 | Prospective paper journal | Decisions saved before outcomes; failed/unexitable trades retained |
| P5 | Optional evidence-grounded AI research assistant | Read-only, cited claims; no wallet keys or order tools |
| P6 | Independent review of edge evidence | Reproducible held-out and prospective results; pass/revise/stop decision |
| P7 | Separate live-execution proposal, if requested | Legal, source, safety and security review; separate owner approval |

The existing Bitcoin/HFT repository snapshot is preserved on local branch `HFT` at
commit `015064d`. The codebase was removed from this new `main` workspace by the
owner's explicit request. No live-order implementation is part of the approved
product direction. See doc 20 for sequencing and stop conditions.
