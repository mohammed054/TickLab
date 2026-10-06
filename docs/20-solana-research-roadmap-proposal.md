# 20 — Solana Research Workstation Roadmap Proposal

Status: **APPROVED DIRECTION — P0 FEASIBILITY ROADMAP, NOT CODE-READY**  
Companion vision: `docs/19-solana-launch-research-workstation.md`  
Owner direction confirmed: 2026-10-06

Repository handling: prior HFT files and changes were preserved in branch `HFT` at
commit `015064d`; `main` now contains the new product planning workspace. Both branch
heads are published to `origin`. This roadmap does not promise that free data supports
reliable live trading or that a resulting signal will be profitable.

This is a decision and sequencing aid. It deliberately does not authorize code edits.
The exact API, data models, file ownership, tests, and acceptance commands are to be
written only after the owner approves the product direction and P0 establishes source
feasibility.

## Proposed Blocks

| Block | Outcome | Depends on | Exit evidence |
|---|---|---|---|
| P0.1 | Existing repository reuse/deprecation inventory | Owner approves exploration | Paths/classes categorized retain, adapt, archive; no deletes |
| P0.2 | Provider/terms/data feasibility | P0.1 | Attributed small source sample, terms, event coverage, limitations, rate limits, restart/gap test plan |
| P0.3 | Product architecture and exact MVP contract | P0.2 | Planner-approved stack, launch program scope, schemas, storage decision, acceptance checks |
| P1 | Local event observer and provenance journal | P0.3 | Real events persisted with checkpoint/restart and explicit gaps; no trading claims |
| P2 | Token timeline and wallet evidence graph | P1 | Every edge traces to immutable source observations; unknown identity stays unknown |
| P3 | Full-cohort research and frozen hypothesis tests | P1,P2 | Chronological leakage checks, denominators, baselines, fees/exits, reproducible report |
| P4 | Prospective paper journal | P3 | Decisions timestamped before outcomes; complete outcomes and cost/error handling |
| P5 | Evidence-grounded AI assistant | P2,P3 | Read-only, citations resolve, no trade actions/secrets, provider unavailable test |
| P6 | Independent edge review | P3,P4,P5 | Reproducible prospective + held-out report; explicitly pass, revise, or stop |
| P7 | Separate live-execution proposal | P6 and separate owner request | Legal/security/data source review and separately approved specification; not automatic |

## Proposed P0 stop conditions

Stop and revise the product before implementation if any of the following holds:

- no permitted, technically accessible event source can support the intended launch
  and trade records at a cost the owner accepts;
- the source lacks historical coverage or restart reconciliation needed to evaluate
  full token cohorts;
- data terms do not permit the intended local storage/analysis;
- token/pool lifecycle parsing cannot be independently validated from attributed
  provider events;
- usable wallet-link signals require paid/private labels or unsupported assumptions;
- the owner requires reliable first-block execution while insisting on free shared
  infrastructure.

P0 can still conclude with a narrower monitoring tool if only read-only, best-effort
collection is feasible. It must not quietly broaden into an automated trader.

## Product decision record

Pending owner acceptance of the five conditions in doc 19 §19.17. Until then,
`docs/16-implementation-roadmap.md` and `docs/18-real-research-pipeline.md` remain
active. No code is to be migrated, removed, or rewritten based solely on this proposal.

