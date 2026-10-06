# 19 — Solana Launch Research Workstation

Status: **PROPOSED PRODUCT SPECIFICATION — NOT APPROVED FOR IMPLEMENTATION**  
Owner review requested: 2026-10-06  
Repository migration condition: no deletion, branch operation, push, or replacement of
`main` is authorized by this proposal. Existing repository work remains untouched until
the owner accepts feasibility and startup-cost findings, approves a migration plan, and
explicitly requests those Git operations. The proposed `HFT` archival branch is not
created by this specification.  
Audience: project owner, Planner, and future Executors.

This document defines a local-first, evidence-first research application for studying
new Solana tokens and testing whether early on-chain behavior contains a repeatable,
tradable signal. It does not promise profit, identify a guaranteed winner, or authorize
real order execution. “Dream app” describes the intended research experience, not an
income guarantee.

---

## 19.1 Product thesis

The application watches a defined set of Solana token launch and trading programs,
records their observable on-chain events, links recurring wallet behavior across
launches, identifies risk and participation patterns, and lets the owner test
pre-registered paper-trading rules against complete cohorts of launches.

The hypothesis is that public chain data can expose behavior that is difficult to
track manually: recurring deployer-funded buyer clusters, coordinated accumulation,
concentrated early ownership, liquidity changes, and changes in independent buyer
participation. These features may help avoid adverse situations or identify promising
setups earlier. This is a research hypothesis, not a claim of predictive edge.

The app's intended advantage is **persistent cross-launch memory plus disciplined
measurement**. It is not privileged information, guaranteed speed, a promise of
outperformance, or a claim that AI can forecast token prices.

### 19.1.1 Owner objective and non-guarantees

The owner's personal aspiration is to earn money gradually, including a hoped-for
eventual average of approximately USD 50 per week from a small account. The system
must not present that target as feasible, expected, safe, or likely. A 25% weekly return
on USD 200 is an arithmetic description of that target, not a strategy expectation.
The app must show capital, realized and unrealized outcomes, costs, drawdown, and
uncertainty without optimizing its UI or model to promise the target.

No implementation can guarantee profit, a win rate, a minimum return, or recovery of
losses. AI output, risk scores, and historical simulations are not investment advice.
The owner alone makes trading decisions and bears financial consequences.

### 19.1.2 Primary user and deployment

- Initial user: one owner on one Windows desktop.
- Initial deployment: local native desktop app and local persistent storage.
- No accounts, user management, cloud service, hosted dashboard, paid server, or
  multi-user operation in the first release.
- External dependencies are limited to public or free-tier market-data endpoints and
  optional owner-configured AI inference. Their limits and terms are displayed.
- The app remains useful when external APIs are unavailable by showing saved data and
  recording an explicit stale/disconnected state.

---

## 19.2 Product boundary and feasibility

### Feasible for an individual developer

1. Discover and monitor selected Solana launch/trading events using documented RPC or
   a provider the owner configures.
2. Persist raw observations and derived features locally with source, slot, timestamp,
   and parser-version provenance.
3. Build transparent wallet behavior summaries and heuristic relationship clusters.
4. Present explainable alerts, launch timelines, token cohorts, and watchlists.
5. Capture paper-trade decisions before their outcomes are known and evaluate them
   with realistic cost/exit assumptions.
6. Use AI locally or through a user-configured provider to summarize already-collected
   evidence, with citations to local records and no ability to place trades.

### Not promised or included in the initial product

- Guaranteed profit, “infinite money,” a specified weekly income, or a claim to beat
  the market or other traders.
- Sub-millisecond or first-block launch execution, validator/leader access, private
  order flow, MEV extraction, or a reliable free production RPC feed.
- Complete chain history from a free endpoint, gap-free observations, or perfect
  identity resolution between wallets.
- Treating wallet labels, token metadata, social posts, volume, or displayed market cap
  as verified facts without provenance and limitations.
- Automatic real-money order placement, wallet custody, seed/private-key storage,
  copying third-party wallets, or user-fund management.
- Strategies designed to manipulate markets, create wash volume, coordinate deceptive
  promotion, evade platform protections, or exploit stolen/private information.
- Reusing the existing Bitcoin `hftbacktest` route for Solana launches. It is a
  different market, data model, and execution problem. Existing HFT code may be
  retained as historical/reference work, but must not be represented as this product's
  simulator without a separately proven technical case.

### Free-feed constraint

The free/shared feed is acceptable for development, historical analysis, and a
best-effort local observer. It is not assumed to be complete, low latency, or suitable
for dependable live trading. Every screen and record must expose provider, observed
slot/time, ingestion delay when measurable, gaps, reconnects, and rate-limit errors.
The app must never silently convert missing observations into “no activity.”

The initial system prefers a modest, explainable signal with enough time for a human to
review over a launch-sniping system that depends on privileged or paid infrastructure.

---

## 19.3 Core product loop

```text
OBSERVE LAUNCH
  → CAPTURE RAW EVENTS
  → BUILD PROVENANCE AND WALLET BEHAVIOR
  → REVIEW EVIDENCE AND RISKS
  → PRE-REGISTER A PAPER DECISION
  → OBSERVE THE FULL OUTCOME
  → ACCOUNT FOR COSTS AND EXIT AVAILABILITY
  → EVALUATE ON UNSEEN TIME PERIODS
  → KEEP, REVISE, OR REJECT THE HYPOTHESIS
```

AI can assist with evidence retrieval, summaries, and hypothesis drafting. It cannot
silently alter a hypothesis after seeing the outcome, label a token safe, approve a
trade, or submit an order.

---

## 19.4 First research hypotheses

These are candidates to test, not accepted strategy rules. The Planner must convert
any candidate into a versioned feature/label contract before Executors implement it.

### H1 — Recurring early-wallet cluster

Some wallet groups repeatedly appear early across new launches, share funding sources
or timing patterns, and have measurably different subsequent outcomes from other
early participants. Test whether a cluster score improves a predeclared risk-adjusted
paper outcome over a time-based baseline.

### H2 — Independent participation vs. manufactured activity

Growth in distinct, behaviorally independent buyers may have different future outcomes
from similar trade volume concentrated in recurring or tightly synchronized wallets.
Test whether a frozen independence/coordination feature improves risk screening after
controlling for token age, liquidity, and observed volume.

### H3 — Liquidity survivability and practical exit

Changes in pool/bonding-curve liquidity and concentration of sellable inventory may
predict whether a predefined hypothetical position can be exited within declared
slippage bounds. Test executable exit value, not a chart's last price or peak price.

### H4 — Risk-first filter

A rules-based classifier may reduce exposure to launches that meet a fixed adverse
outcome definition. This is not automatically a buy signal: avoiding detected risk can
still underperform holding cash or a simple baseline.

### H5 — Attention vs. on-chain confirmation

Public metadata/social attention may be useful only when paired with independent
on-chain participation and liquidity. Social data is optional, potentially incomplete,
and must not be represented as a reliable feed unless its collection rights, coverage,
timestamps, and costs are established.

No “smart money” label may be used as ground truth by name alone. If the product uses
that phrase, it must disclose the exact historical classification rule, sample size,
observation window, and failure rate, and allow the owner to inspect raw evidence.

---

## 19.5 Data-source policy and acquisition stages

### Stage A — Offline research

- Use clearly licensed/public datasets and provider documentation.
- Record dataset provenance, license/terms URL, retrieval time, coverage window,
  missingness, transformations, and checksums.
- Validate whether community datasets contain survivorship bias, retrospective labels,
  filtered launches, synthetic annotations, or a single market regime.
- A dataset with only successful/graduated/listed tokens cannot represent the complete
  launch population and cannot support population-level success rates.

### Stage B — Local best-effort observer

- Subscribe to documented Solana program/account/transaction streams or a configured
  provider.
- Record provider identity and configuration without committing credentials.
- Use idempotent event keys and durable checkpoints so reconnects can reconcile gaps
  where provider history allows.
- Store raw observation bytes or provider payloads when permitted; otherwise preserve
  canonical parsed payload plus its source reference and document the limitation.
- Track received slot/time separately from chain event slot/time.
- Surface duplicates, dropped notifications, parse failures, provider lag, API limits,
  and unbackfillable gaps.

### Stage C — Optional historical backfill

- Before implementation, document a permitted provider/method, retention limits,
  program coverage, request limits, and reproducible completeness audit.
- Historical backfill and live collection must join without fabricating missing events.
- Do not use unofficial website endpoints as a production contract unless terms and
  stability are reviewed and the Planner explicitly approves them.

### Provider qualification table (to be completed before an implementation block)

| Source | Purpose | Access/terms | Historical depth | Live latency | Known limits | Approved? |
|---|---|---|---|---|---|---|
| Solana public RPC | Development/manual spot checks | Official docs; shared/rate limited | Must be tested | Best effort | Not production-grade; may throttle/block | Yes for local development only |
| Configured RPC/indexer | Candidate local collection | Must review current terms and plan | Must test exact methods | Measure p50/p95 and gaps | Provider-specific | No, pending qualification |
| Community datasets | Offline hypothesis bootstrap | Verify license and provenance | Dataset-specific | Not live | Bias/coverage risk | No, pending audit |

No paid source or service may be required for the first local prototype. The app may
offer optional provider configuration, but must show when a workflow exceeds the
free-tier capability and must never activate paid usage without the owner configuring
it.

---

## 19.6 Data integrity, identity, and feature rules

### Immutable observation record

Every raw observation stores at minimum:

```text
observation_id
chain = "solana-mainnet"
provider_id
provider_api_version (if known)
source_program_ids[]
signature (nullable only when provider supplies no transaction signature)
slot
transaction_index (when available)
instruction_index (when available)
block_time_utc (nullable, chain/provider sourced)
received_at_utc
commitment
raw_payload_ref or canonical_payload
payload_sha256
parser_name
parser_version
parse_status
```

Never overwrite a raw observation when parsers change. A new parser version creates a
new derived record linked to the immutable source.

### Wallet relationship graph

Wallet clustering is probabilistic evidence, not identity proof. A cluster edge must
store:

```text
edge_id
wallet_a
wallet_b
edge_type = COMMON_FUNDER | REPEATED_COINCIDENCE | SYNCHRONIZED_ACTION |
            SHARED_CONTROL_EVIDENCE | OTHER_REVIEWED_TYPE
supporting_observation_ids[]
first_seen_at
last_seen_at
feature_version
strength_value (only if a documented formula exists)
limitations
```

The implementation spec must define each edge formula and thresholds. No silent
combination into a universal “insider probability.” UI language must distinguish
“observed funding link” from “same person controls both wallets.”

### Feature snapshots

Each token snapshot is immutable and anchored to a decision-time cutoff. It includes:

- token/mint and launch program identity;
- token age, observed launch slot, and snapshot slot/time;
- pool/bonding-curve identity and observed reserves/liquidity source;
- trade counts/volume and distinct buyers/sellers only where the source supports
  accurate deduplication;
- top-holder/early-holder concentration, with custody/program/LP/creator accounts
  identified or explicitly unresolved;
- wallet relationship features with supporting IDs;
- liquidity and price changes calculated only from events observed by cutoff;
- data quality, missing fields, provider lag/gap flags;
- feature code/version and source observation IDs.

Feature values must not use events after the decision cutoff. Future-derived labels
must live in separate tables and must be inaccessible to the online signal evaluator.

---

## 19.7 Outcome definitions and leakage controls

Before collecting evaluation results, Planner must specify a target label for every
experiment. Candidate labels include:

- whether a token becomes untradeable or falls below a predeclared liquidity threshold
  within a fixed horizon;
- whether an executable hypothetical position can exit with a positive net result by
  a fixed time;
- max adverse excursion and max favorable excursion from the first eligible
  decision-time quote;
- time to a predeclared loss boundary or exit-liquidity failure.

For each label, the spec must define exact horizon, quote/route source, trade size,
slippage model, fees, network cost, failed-transaction behavior, partial-fill behavior,
and no-exit treatment. Do not use the maximum chart price as a realizable exit.

Leakage rules:

1. Store decision-time snapshots before label backfill.
2. Split train/validation/test chronologically by launch time; related launches and
   recurring wallet clusters must not leak future information across splits without
   an explicitly justified grouped protocol.
3. Do not tune thresholds on the final test period.
4. Preserve all discovered tokens in the denominator, including zero-trade, failed
   parse, delisted, dead, and unexitable cases with distinct status codes.
5. Report coverage and exclusion reasons. Never silently discard losers or incomplete
   launches.
6. Every sweep records how many variants were tried; account for selection among many
   variants. No “best strategy” is selected or activated automatically.

---

## 19.8 Paper-trading and execution-cost contract

The first supported trading mode is PAPER only. Paper trading creates no blockchain
transaction, wallet connection, order signature, or capital exposure.

Every simulated entry/exit record must include:

- signal timestamp and exact feature snapshot ID;
- hypothetical decision price source and age;
- configured notional and size;
- route/quote source or explicit “no executable quote”;
- quoted price impact/slippage and fee breakdown;
- network/base/priority fees if applicable and source/version;
- delay between signal, quote, and simulated decision;
- partial fill, failed exit, and stale quote treatment;
- realized paper P&L formula/version and currency conversion source;
- exit reason and manual override audit trail.

If executable quote data is unavailable, the app must show an explicitly non-executable
mark-to-market estimate and exclude it from claims of realized/tradable performance.

No default entry/exit rule is implied by this document. The first paper strategy is
created only after a Planner spec pins its full deterministic rule, size, exits, cost
model, eligibility, and acceptance tests.

---

## 19.9 AI role and boundaries

AI is an optional local research assistant, not an autonomous trader.

Allowed:

- summarize a token's recorded timeline and point to supporting observations;
- explain why wallet links or risk flags were generated using their actual formulas;
- draft testable hypotheses and queries over already-collected local data;
- help inspect experiment differences and data-quality caveats.

Forbidden:

- claims of certainty, guaranteed returns, or unsupported “safe/best/winner” labels;
- inventing observations, wallet identities, volume, prices, or sources;
- changing frozen paper rules after observing outcomes;
- signing/sending transactions, reading private keys, changing risk settings, or
  calling trading/order APIs;
- acting without an explicit user request.

Every AI statement about a token or experiment links to exact local evidence IDs and
states what evidence is missing. If no configured model is available, the core product
still works without AI.

---

## 19.10 Security and privacy

- Initial app does not import a wallet seed phrase or private key and has no signing
  capability.
- API keys, if any provider requires one, are stored only in the OS credential store
  or an approved local secret mechanism; never in source, frontend bundle, database,
  logs, exports, screenshots, or AI prompts.
- RPC credentials are read-only where provider supports scopes.
- All network requests, destinations, provider identities, and local files are
  inspectable by the owner.
- Local database exports exclude credentials and clearly label personal annotations.
- A future transaction-signing module requires a separate Planner specification,
  explicit owner review, threat model, external security review, isolated signer
  boundary, spend limits, deny-by-default behavior, and jurisdiction review. It is
  outside this document's implementation scope.

---

## 19.11 Regulatory boundary

This specification is for private research and owner-operated paper analysis. It does
not authorize providing advice, signals, custody, brokerage, pooled investment,
management of another person's assets, token issuance, promotion, or trading as a
service. Before offering the app or any signal/service to other people, the owner must
obtain current UAE/Dubai legal and regulatory advice and check the relevant official
registers and rules. A previous browser check is not a standing legal determination.

---

## 19.12 Product screens and user-visible behavior

Exact implementation details (component names, props, APIs, schemas, and file paths)
are intentionally left for the Planner's implementation roadmap after owner approval.
The product must contain these user tasks:

1. **System status:** selected chain/provider, connected/stale/disconnected state,
   latest observed slot/time, lag/gap/parse-failure counts, free-tier quota if known.
2. **Launch feed:** chronological token discovery with event time, observation time,
   data-quality badge, liquidity/participation facts, and explicit unknown fields.
3. **Token investigation:** immutable timeline, source transactions, pool/liquidity
   changes, early participants, wallet graph, risk evidence, and AI citations.
4. **Wallet graph:** recurring wallets/clusters across launches, edge evidence and
   uncertainty. Unknown identity remains unknown.
5. **Cohort research:** full launch cohorts, filters, frozen feature snapshots, outcome
   definitions, exclusions, and chronological split boundaries.
6. **Paper journal:** pre-registered entry/exit rules, hypothetical trades, observed
   quote/cost assumptions, manual decisions, and post-outcome review.
7. **Experiment registry:** immutable hypothesis, feature/rule versions, dataset
   checksums, code/config version, variants tried, results, and reproduction links.
8. **AI research panel:** optional, read-only, evidence-linked explanations and drafts.
9. **Settings/data controls:** provider configuration, polling/subscription mode,
   storage location, retention/export, AI provider, and usage/cost visibility.

Every screen supports explicit loading, stale, no-data, partial-data, error, and
permission/rate-limit states. A missing field is “unknown/unavailable,” never zero.

---

## 19.13 Local-first architecture direction

This is a target direction, not permission to alter existing code before the migration
plan is approved.

- Keep a native Windows Tauri shell if its current build remains useful.
- Run ingestion and analysis as a local process; a browser UI is not required.
- Store immutable raw observations and normalized event rows in a local database or
  append-only files. The exact storage engine must be selected from existing project
  dependencies or approved by the Planner after workload measurement.
- Keep provider adapters replaceable and the canonical event model provider-neutral.
- Use a bounded local event queue with durable checkpoints; no unbounded in-memory
  token/trade history.
- Separate raw observations, parsed chain events, feature snapshots, future labels,
  paper decisions, and evaluation outputs.
- Support full stop/restart and reconcile the observed slot after reconnect.
- CPU-only initial features and models. GPU and hosted compute are not required.
- No `hftbacktest` dependency in the new signal path unless a later experiment proves
  and specifies a valid use case.

The Planner must audit the existing dependency stack and choose exact components,
service boundaries, and paths before any Executor implementation. No new dependency,
database, API, or service is inferred from this vision document.

---

## 19.14 Evaluation and “edge evidence” gates

The product must distinguish **data collection**, **descriptive research**,
**out-of-sample evidence**, **paper tracking**, and **live trading**. Passing a gate
allows the next research stage; it never guarantees future profit.

### Gate 0 — Data trustworthy enough to study

- source terms/provenance recorded;
- measured event coverage and reconnect gaps;
- parser tests against provider-attributed events;
- correct launch/token denominators;
- deterministic feature snapshots and checksums;
- no unexplained lookahead.

### Gate 1 — Historical hypothesis check

- hypothesis and outcome frozen before final test evaluation;
- time-based train/validation/test or walk-forward design;
- all costs and unexitable outcomes treated per the pinned contract;
- performance compared with cash/no-trade and simple predeclared baselines;
- uncertainty intervals and sample sizes reported;
- number of tested variants disclosed;
- no claim based only on accuracy, AUC, win rate, token peak prices, or selected
  success stories.

### Gate 2 — Prospective paper observation

- signals recorded live before their outcomes;
- continuous duration/sample minimum set by the Planner before observation starts;
- all signals, ignored signals, failed data periods, and manual overrides retained;
- executable quote/cost availability tracked;
- report both net outcome and maximum drawdown, exposure time, tail losses, and exit
  failures.

### Gate 3 — Owner review for any real-money experiment

This document does not grant approval for live execution. A separate specification
must define legal review, custody/signing model, transaction safety, explicit notional
limits, kill switch, account monitoring, audit logs, and security review. Any real-money
trade remains an explicit human action; AI cannot submit or sign it.

### No automatic graduation

No metric or gate automatically marks a strategy as profitable, chooses a winning
token, or enables live trading. The owner reviews the complete evidence and decides
whether to continue.

---

## 19.15 Failure modes and required response

| Failure | Required behavior |
|---|---|
| RPC/indexer disconnect or rate limit | Mark feed stale; keep collection checkpoint; reconnect with bounded backoff; report unreconciled gap |
| Events missed and no historical backfill | Preserve gap as unknown; exclude affected interval from completeness claims |
| Parser does not recognize instruction | Store source evidence if permitted; label unparsed; do not infer trade/token state |
| Wallet cluster evidence weak/conflicting | Show edge-level evidence and uncertainty; never label same owner as fact |
| Quote unavailable or route too illiquid | Mark position non-executable/unexitable under contract; do not use chart close as realized result |
| Provider changes schema/terms | Stop affected ingestion with actionable error; version adapter; require review before resuming |
| Model missing or rate limited | Disable AI panel actionably; collection and analysis remain available |
| Local disk full/corrupt | Stop writes safely, preserve last valid checkpoint, show recovery instructions; no success state for missing data |
| Backtest/analysis crashes | Preserve inputs and typed failure; retry is a new experiment record |

---

## 19.16 Proposed staged roadmap

This is a proposed product sequence. It is not yet an executor contract. Exact ownership,
file paths, API schemas, tests, and acceptance commands will be written after the owner
approves this direction.

### P0 — Product and data feasibility proof

- Audit the existing desktop shell and stack for reusable local components.
- Qualify one lawful, free/read-only Solana source for a small sample and verify terms,
  exact event availability, event age, and rate limits.
- Obtain or construct an attributed sample containing launches, trades, and liquidity
  events, with source checksums and known gaps.
- Decide initial launch programs and exact event types.
- Output a short feasibility report and architecture decision; no application rewrite.

### P1 — Local observer and immutable journal

- One chain/program scope only.
- Real launch/trade/liquidity event collector with checkpoints/reconnect gap reporting.
- Local persistence and provenance view.
- No scores, strategy claims, wallet label, trading, or AI required.

### P2 — Evidence and wallet behavior explorer

- Token timeline, wallet graph, source evidence, concentration and participation
  features, all versioned.
- Labels and missing data shown distinctly.
- Human-reviewed cluster evidence; no identity certainty.

### P3 — Cohort research and frozen paper rules

- Chronological cohort analysis, explicit label contract, leakage controls, baseline
  comparisons, full token denominator.
- Versioned paper rule and immutable decision-time snapshots.

### P4 — Prospective paper journal and local AI research helper

- Prospective collection, cost/quote-aware simulated entries/exits, persistence across
  restart, and pre-registered evaluation.
- Optional evidence-grounded AI summaries only.

### P5 — Independent review of edge evidence

- Reproduce results from a clean local data store.
- Audit source coverage, data leakage, costs, variant count, and survivorship.
- Decide whether to continue, change hypothesis, or stop.

### P6 — Separate live-execution decision

- No implementation unless the owner explicitly requests a separately reviewed plan.
- Requires current regulatory/security review and a distinct signing/execution design.

---

## 19.17 Acceptance criteria for this vision document

This document is considered an approved product direction only after owner review
explicitly confirms:

1. Solana launch research, wallet behavior, and paper trading replace Bitcoin HFT as
   the intended product objective.
2. The owner accepts that no profit or weekly income is guaranteed.
3. The free local version is a best-effort research observer, not a launch sniper or
   reliable production trading feed.
4. The initial scope excludes automatic live orders and private-key handling.
5. A new Planner-authored migration plan may supersede docs/16 and docs/18, and the
   owner accepts that existing HFT code/specs may be retained but not built out for
   this new objective.

After approval, the Planner must write a migration plan identifying active/archived
specs, code/assets to preserve, data handling, exact stack reuse, migration milestones,
and Executor-owned implementation tasks. Executors must not infer that this proposed
document itself authorizes changing code or deleting existing work.

---

## 19.18 Research references

These references motivate hypotheses only; they do not establish a profitable trading
system or validate the product's eventual signals.

- Ding et al., *Decompose Market Manipulation Strategies: Evidence from On-chain Meme
  Coin Market*, open manuscript hosted by UCL Discovery (2025), analyzing 6,000
  Pump.fun tokens: https://discovery.ucl.ac.uk/id/eprint/10220651/.
- Hu et al., *MemeTrans: A Dataset for Detecting High-Risk Memecoin Launches on
  Solana* (2026): https://arxiv.org/abs/2602.13480.
- Li et al., *Catching the Rug: Early Prediction of Fraudulent Memecoins on Solana via
  Machine Learning* (2026 preprint): https://arxiv.org/abs/2608.20271.
- Solana RPC official documentation and public-endpoint limitations:
  https://solana.com/docs/rpc and https://solana.com/docs/rpc/providers.
- VARA Consumer and Marketplace Alert — Memecoins (2025):
  https://www.vara.ae/en/regulations/regulatory-notices/vara-consumer-and-marketplace-alert-memecoins/.

Research datasets, preprints, vendor pages, endpoints, laws, and product limits can
change. Recheck primary sources and exact access terms during P0.
