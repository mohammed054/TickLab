# 04 — Judge, Alerts and Rules Lab

All thresholds below are **initial hypotheses, not facts**. They are config (`rules_v1.json`), not code constants.
The Rules Lab (4.6) exists to test them. Never describe a score as a prediction or a safety guarantee.

## 4.1 Judge input and output (`judge/engine.ts`)

```ts
interface JudgeInput {
  now: number;
  token: { id:number; mint:string; creatorWallet:string|null; mintAuthority:string|null; freezeAuthority:string|null; authoritiesCheckedAt:number|null };
  pool:  { id:number; createdAtChain:number; firstSeenAt:number };
  latest: Snapshot | null;            // newest pool_snapshots row
  history: Snapshot[];                // all snapshots for the pool, ascending
  trades: Trade[] | null;             // null = not fetched
  holders: HolderSnapshot | null;
  creatorPriorTokens: { tokenId:number; maxLiqUsd:number|null; liqAt24hUsd:number|null; ageMs:number }[] | null;
  earlyBuyerFunders: { wallet:string; funder:string|null }[] | null;
  positionUsd: number;                // judge.defaultPositionUsd
  costs: { feePctPerSide:number; networkFeeUsd:number };
}
interface RuleResult { ruleId:string; status:'hit'|'clear'|'unknown'; points:number; evidence:Record<string,unknown> }
interface Judgement  { score:number; band:'LOW'|'MEDIUM'|'HIGH'|'EXTREME'; completeness:number; results:RuleResult[]; inputsHash:string; rulesVersion:string }
function evaluate(input: JudgeInput, config: RuleConfig): Judgement   // PURE: no I/O, no clock, no randomness
```

- `score = min(100, sum(points of hit rules))`.
- Bands: 0-24 LOW, 25-49 MEDIUM, 50-74 HIGH, 75-100 EXTREME.
- `completeness = (#enabled rules with status != 'unknown') / (#enabled rules)`; if no rules enabled, 0.
- `inputsHash = sha256(JSON of the numbers actually read by the enabled rules)` (stable key order). Store a new judgement row only if the hash differs from the previous row for that token.
- **UI honesty rule:** if `completeness < 0.5`, the band is displayed as `LOW?`/`MEDIUM?` etc. with a grey outline and tooltip "Not enough data. A low score here is NOT a safety signal."
- Every rule returns `unknown` (0 points) when an input it needs is null. `unknown` is never treated as `clear`.

## 4.2 Rules (`judge/rules/Rxx.ts`, one file each, each with a table-driven unit test file)

| ID | Name | Needs | Hit condition (defaults) | Points |
|---|---|---|---|---|
| R01_MINT_AUTH | Mint authority still active | token.authoritiesCheckedAt | `mintAuthority != null` | 25 |
| R02_FREEZE_AUTH | Freeze authority active | same | `freezeAuthority != null` | 20 |
| R03_TOP1_HOLDER | One wallet holds a lot | holders | `top1_pct > 20` | 15 |
| R04_TOP10_HOLDERS | Top 10 wallets hold most | holders | `top10_pct > 50` | 15 |
| R05_CREATOR_SERIAL | Creator launches repeatedly and dumps | creatorWallet, creatorPriorTokens | prior tokens in last 14 days >= 3 AND >= 2 of them had `liqAt24hUsd <= 0.2 * maxLiqUsd` (maxLiq >= 3000) | 20 |
| R06_EARLY_SYNC | Many wallets buy in the same moment | trades, pool age | within 120 s after `createdAtChain`, some 2-second window has >= 6 distinct buyer wallets. `unknown` if no trade is older than `createdAtChain+120s` OR first trade time > createdAtChain + 30 s (early trades missed) | 10 |
| R07_SHARED_FUNDER | Early buyers share a funder | earlyBuyerFunders (DEFAULT OFF) | >= 3 of the first 10 buyers have the same non-null funder | 15 |
| R08_EXIT_IMPACT | Selling would move the price a lot | latest.liquidity | `impact = S/(L/2+S)`; `> 0.03` -> 10 pts; `> 0.08` -> 20 pts (take the higher, do not add) where S=positionUsd, L=liquidity_usd | 10/20 |
| R09_LOW_LIQ | Very little liquidity | latest.liquidity | `L < 5000` -> 10; `L < 1500` -> 20 (higher only) | 10/20 |
| R10_LIQ_DROP | Liquidity collapsed | history | peak L over history >= 3000 AND current L <= 0.5*peak AND >= 3 snapshots | 25 |
| R11_THIN_CROWD | Big volume from few buyers | latest | `buyers_h1 < 15` AND `vol_h1 > 20000` (unknown if either null) | 10 |

Evidence objects (stored as JSON, shown in the Evidence tab) always contain the raw inputs and the threshold used, e.g.
`{"top1_pct": 31.2, "threshold": 20, "holdersObservedAt": 1760000000000}`.
Disabled rules (R07 by default) are excluded from completeness and not evaluated.

`exitImpact.ts`: `estimateExit(sizeUsd, liquidityUsd, feePctPerSide, networkFeeUsd) -> {impactPct, receivedUsd}`:
`impact = S/(L/2+S)`; `received = S*(1-impact)*(1-feePct/100) - networkFeeUsd`; null if L is null or <= 0.
This is a **constant-product approximation** (50/50 pool, no concentrated liquidity); the UI must label it "estimate".

## 4.3 Config file `rules_v1.json` (`judge/config.ts` loads + validates with zod)

```json
{
 "version": "rules_v1",
 "rules": {
  "R01_MINT_AUTH": {"enabled": true, "points": 25},
  "R02_FREEZE_AUTH": {"enabled": true, "points": 20},
  "R03_TOP1_HOLDER": {"enabled": true, "points": 15, "thresholdPct": 20},
  "R04_TOP10_HOLDERS": {"enabled": true, "points": 15, "thresholdPct": 50},
  "R05_CREATOR_SERIAL": {"enabled": true, "points": 20, "lookbackDays": 14, "minPriorTokens": 3, "minDumped": 2, "dumpFraction": 0.2, "minPeakLiqUsd": 3000},
  "R06_EARLY_SYNC": {"enabled": true, "points": 10, "windowSec": 2, "minWallets": 6, "earlySec": 120, "maxFirstTradeDelaySec": 30},
  "R07_SHARED_FUNDER": {"enabled": false, "points": 15, "minShared": 3, "sample": 10},
  "R08_EXIT_IMPACT": {"enabled": true, "tiers": [{"above": 0.03, "points": 10}, {"above": 0.08, "points": 20}]},
  "R09_LOW_LIQ": {"enabled": true, "tiers": [{"below": 5000, "points": 10}, {"below": 1500, "points": 20}]},
  "R10_LIQ_DROP": {"enabled": true, "points": 25, "dropFraction": 0.5, "minPeakUsd": 3000, "minSnapshots": 3},
  "R11_THIN_CROWD": {"enabled": true, "points": 10, "maxBuyersH1": 15, "minVolH1": 20000}
 },
 "bands": {"LOW": 24, "MEDIUM": 49, "HIGH": 74}
}
```
Changing a threshold = new version file (`rules_v2.json`). Never edit `rules_v1.json` after the first Lab run is frozen.

## 4.4 When the judge runs (`judge/scheduler hooks`)

- On discovery of a pool (shallow rules only: R08, R09, R11; others `unknown`).
- After each tracked snapshot batch, per token, debounced 60 s.
- After holders refresh, authority check, trades fetch, creator derivation.
- On `judge:recompute` from the UI.

## 4.5 Alerts (`judge/alerts.ts`) — "worth a look", NEVER "buy"

After each judgement, if `alerts.enabled` and ALL are true: `score <= alerts.maxScore` (30), `completeness >= alerts.minCompleteness` (0.6),
`liquidity >= alerts.minLiquidityUsd` (5000), `buyers_h1 >= alerts.minBuyersH1` (20), `alerts.minAgeMin <= ageMin <= alerts.maxAgeMin` (5..120),
and no existing `alerts` row for (token, 'worth_a_look') -> insert alert, emit `evt:alert`.
Alert text (exact): `"{SYMBOL}: risk {score} {band}, data {completeness%}. Passed your filters. This is not advice."`
Toast + bell list only (no sound). Also create an alert kind `'liq_drop'` when R10 becomes a hit on a watchlisted token or token with an open decision:
`"{SYMBOL}: liquidity fell {x}% from peak."`

## 4.6 Rules Lab (`lab/replay.ts`) — how we find out if any of this works

Purpose: replay the **alert rule** over history using only data that existed at each time, then measure outcomes after costs. It can only answer
"what would have happened if I acted on every alert at standard size", not "will this make money".

**Params** (`LabParams`): `configId` (frozen rules) · `alertRule` (the 5 alert numbers) · `sizeUsd` (10) · `horizonsMin: [60,240,1440]` ·
`feePctPerSide` · `networkFeeUsd` · `fromTs` · `toTs` · `seed` (int) · `missingMode: 'conservative'|'optimistic'`.

**Algorithm**
1. Candidate tokens: pools created in [fromTs, toTs] whose `created_at_chain` is NOT inside any gap, and that have >= 3 snapshots.
2. For each candidate, walk its snapshots in time order. At snapshot time `T`, build a JudgeInput using ONLY rows with `observed_at <= T`
   (authority/holders/creator are used only if their `*_checked_at`/`observed_at <= T`). Evaluate. If the alert rule passes -> **entry at T** (first time only). Stop scanning.
3. Entry maths with `S=sizeUsd`, `L=liquidity at T`, `p=price at T`: `impactIn = S/(L/2+S)`; `tokens = (S*(1-fee/100) - netFee) * (1-impactIn) / p`.
4. For each horizon H: find the snapshot nearest to `T + H` within +-10 min (if none: outcome `UNKNOWN`).
   Liquidity-collapse override: if ANY snapshot in (T, T+H] has `L <= 0.2 * L_entry`, exit at the FIRST such snapshot instead (price and L from that snapshot) and flag `rugged=true`.
   `exitValue = tokens * p_exit * (1 - impactOut) * (1 - fee/100) - netFee` where `impactOut = valueBefore/(L_exit/2 + valueBefore)`, `valueBefore = tokens*p_exit`.
   `returnPct = (exitValue - S)/S*100`.
5. `UNKNOWN` outcomes: `conservative` => returnPct = -100; `optimistic` => excluded. Always report both counts and both mean returns.
6. **Baseline ALL**: same candidates and entry trigger, but with the score condition removed (`maxScore=100`, completeness 0). **Baseline RANDOM**: for each alert entry pick a random other candidate at a random snapshot (seeded PRNG `mulberry32(seed)`) satisfying age/liquidity only, same size.
7. **Stats** per set and horizon: `n, meanReturn, medianReturn, p10, worst, winRate (>0), ruggedRate, unknownRate`; histogram of returns (40 bins from -100 to +300, last bin = overflow).
   Bootstrap 95% CI of the **mean** (2000 resamples, seeded) for each set, and CI of `mean(alerts) - mean(ALL)`.
8. **Verdict string** (exact, only these two): `EDGE NOT PROVEN` unless `n_alerts >= 200` AND CI lower bound of mean(alerts) > 0 AND CI lower bound of the difference vs ALL > 0 (conservative mode, horizon 240 min);
   then `EDGE SIGNAL (needs forward paper test)`. Never show "profitable", "winning" or "safe".
9. Output also lists: candidates excluded for gaps, candidates with < 3 snapshots, rules that were `unknown` most often.

**Freeze:** `lab:freeze` stores `{rulesConfig, alertRule, params}` in `rule_configs` with its sha256. A Lab result linked to a frozen config is the only kind shown as "official". Editing after seeing results requires a NEW config (v2) and new data (only snapshots after the freeze time count as "unseen").
