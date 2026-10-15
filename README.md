# TickLab Local Solana Research

TickLab is being transformed from a launch radar into a Windows desktop research workstation for Solana new-token launches. It will collect real provider/on-chain data while open, retain it locally, analyze it with local models, test strategies against realistic costs, and record prospective paper signals.

The app does not sign transactions, submit orders, use real funds, or connect to a trading venue. A future live-trading project requires separate written owner approval.

## Planner/executor workflow

- Read `AGENTS.md`, then `docs/00-read-first.md`.
- Follow one task at a time in `docs/07-phases-and-tasks.md`.
- `docs/09-research-system.md` is the data/model/backtest contract; `docs/09-analytics-and-investigation-suite.md` contains exact financial formulas; `docs/08-qa-and-done.md` defines gates.
- Phase 0 is an owner-reviewed feasibility gate. Do not skip it or invent provider fields/costs.
- `STATE.md` is the append-only handoff log. `QUESTIONS.md` records blocking spec issues.

## Existing app checks

The commands for the current Electron app remain:

```powershell
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Research-worker setup and commands will be added by Phase 1. No test, build, or provider call should be claimed unless it was actually run; every task card defines its acceptance checks.
