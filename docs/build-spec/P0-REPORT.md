# Phase 0 — Research-system feasibility report

**Status:** NOT RUN. This report is Planner-owned. Executor scripts save evidence under `data/p0/` and real fixtures under `fixtures/`; the Planner copies verified summaries here.

## Machine and disk

| Measure | Result | Evidence |
|---|---|---|
| Windows version | TODO | `data/p0/system.json` |
| CPU | TODO | same |
| System RAM | 16 GB reported; verify | same |
| GPU model | RTX 2060 reported; verify exact variant | same |
| GPU VRAM/driver/CUDA | TODO | same |
| Available disk / research allocation | ~200 GB reported; verify | same |
| Python environment support | TODO | same |

## Live shallow capture

| Measure | Target | Measured | Evidence |
|---|---:|---:|---|
| Capture duration | 24 h | TODO | `data/p0/coverage.json` |
| Launches seen vs independent reference, same 2 h window | >= 90% or Reduced verdict | TODO | same |
| Supported venues and known blind spots | Explicit list | TODO | same |
| Request error rate / sustained 429 | <2% / none >5 min | TODO | same |
| Capture bytes/day | Measure | TODO | same |
| Actual effective cadence | Record per tier | TODO | same |

## Historical-provider bake-off

| Measure | Existing source | Candidate | Notes/evidence |
|---|---|---|---|
| Historical start/end | TODO | TODO | `data/p0/provider-bakeoff.json` |
| Coverage on 25 active + 25 failed/dead launches | TODO | TODO | same |
| DEX/launch venue coverage | TODO | TODO | same |
| Trades/candles/pool migrations | TODO | TODO | same |
| Point-in-time fields and `availableAt` feasibility | TODO | TODO | same |
| Missingness, latency, and correction behavior | TODO | TODO | same |
| Local storage/research terms | TODO | TODO | `docs/build-spec/P0-TERMS.md` |
| Free tier/cost/quota | TODO | TODO | same |

## Storage and local model feasibility

- Measured shallow bytes/day: TODO
- Measured selected-deep bytes/day: TODO
- Estimated 30/90/365-day storage: TODO
- 150 GiB cap headroom under observed pattern: TODO
- Local Python + baseline ML install/runtime: TODO
- Kronos checkpoint hash, model size, VRAM/RAM and inference time: TODO
- CPU fallback status: TODO
- Any provider/model requiring payment or external inference: TODO

## Verdict

**Verdict:** NOT RUN — Full / Reduced / Not feasible (choose after evidence)

**Approved free provider set:** TODO

**Final effective capture cadence:** TODO

**Known coverage gaps and excluded fields:** TODO

**Storage/retention adjustments:** TODO

**Required spec changes:** TODO

**Owner decision:** `go` / `revise` / `stop` — TODO (date)

Do not start Phase 1 until the owner reviews this report and replies `go`. A paid source needs separate approval.
