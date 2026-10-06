# TickLab — Solana Launch Research Workstation

TickLab has moved on from its Bitcoin high-frequency trading (HFT) backtesting goal.
Building a dependable HFT system requires specialized market data, execution
infrastructure, and latency that do not fit the current zero-startup-cost constraint.
The old repository has been preserved on the `HFT` branch; this `main` branch is the
clean planning workspace for a different research idea.

## New idea

Build a local-first app that studies newly launched Solana tokens. It will record
public on-chain observations, compare early wallet behavior across launches, surface
liquidity and coordination evidence, and help test pre-registered paper-trading rules.
The goal is to investigate whether this gives us a measurable advantage over a normal
manual workflow—not to claim that an AI can guarantee winners.

The app will start as a local research observer and paper-trading journal. It will not
store wallet private keys or submit real-money orders. A free/shared data feed may be
good enough for local research, but cannot be assumed to be complete, reliable, or fast
enough to win launch-sniping races. The first milestone is to prove data feasibility
and startup cost before implementing the app.

**No app or strategy can guarantee profit or a target such as USD 50 per week.** Any
edge must be demonstrated with complete cohorts, unseen data, prospective paper records,
and realistic fees, slippage, and failed exits. A paper result is not a promise of live
profit.

## Specs

- [Product vision and full requirements](docs/19-solana-launch-research-workstation.md)
- [Feasibility-first staged roadmap](docs/20-solana-research-roadmap-proposal.md)
- [Active roadmap](docs/16-implementation-roadmap.md)

## Repository preservation

The prior HFT repository—including source, datasets/catalog metadata, prior specs,
current working changes, and history—was committed intact to branch `HFT` at commit
`015064d` before this branch was cleaned. This branch intentionally contains only the
new product planning materials, repository instructions, ignore rules, and progress
log. No old project files were deleted from the HFT snapshot.

The intended next step is P0 feasibility: verify the source terms, event coverage,
limits, parser feasibility, local restart recovery, and all startup/recurring costs.
Do not treat this planning branch as evidence that a profitable trading edge exists.
