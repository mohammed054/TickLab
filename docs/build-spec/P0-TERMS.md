# P0-TERMS — terms and cost check (template, owner fills in)

Date checked: `TODO`

## 1. GeckoTerminal public API
Link: `TODO` · Local storage / caching allowed: `TODO` · Free limit confirmed (spec assumes 30 calls/min): `TODO`

## 2. Chosen RPC provider
Provider + link to terms: `TODO` · Free-tier limits: `TODO`
Real credit cost per method (fill `sources.rpc.creditCost`): getAccountInfo `TODO`, getTokenSupply `TODO`, getTokenLargestAccounts `TODO`, getMultipleAccounts `TODO`, getSignaturesForAddress `TODO`, getTransaction `TODO`

## 3. Monthly credit projection
(calls per token x tokens per day x 30) = `TODO` vs budget `sources.rpc.monthlyCreditBudget`. Spec gate: projection <= 60% of budget.
