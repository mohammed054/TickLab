# 03 — Data Sources and Pipeline

Rule zero: **never build on remembered field names.** Everything marked `VERIFY` must be
confirmed in Phase 0 against a real response saved in `fixtures/`, and the normalizer is
tested against those fixtures.

## 3.1 Sources

### A. GeckoTerminal public API (keyless) — discovery + market data
- Base URL: `https://api.geckoterminal.com/api/v2`. Send header `Accept: application/json;version=20230302` (VERIFY the accepted version string).
- Documented public limit: **30 calls/minute** (shared across ALL calls from this IP). The app caps itself at `sources.gt.callsPerMinuteCap` = **24**.
- Endpoints used (VERIFY each path, params and response shape in Phase 0):

| Purpose | Request |
|---|---|
| Newest pools on Solana (discovery + shallow snapshot) | `GET /networks/solana/new_pools?include=base_token,quote_token,dex&page=N` |
| Snapshot many tracked pools at once (up to 30 addresses) | `GET /networks/solana/pools/multi/{addr1,addr2,...}?include=base_token,quote_token,dex` |
| Recent trades of one pool | `GET /networks/solana/pools/{address}/trades` (optional min-USD filter param: VERIFY name) |
| Candles | `GET /networks/solana/pools/{address}/ohlcv/{minute\|hour\|day}?aggregate={1,5,15}&limit=N` |
| Token info (optional extras) | `GET /networks/solana/tokens/{mint}/info` |

- Fields expected on a pool object (VERIFY names): address, name, pool_created_at, base_token_price_usd, fdv_usd, market_cap_usd,
  reserve_in_usd (= liquidity), volume_usd{m5,h1,h24}, price_change_percentage{m5,h1}, transactions{m5,h1:{buys,sells,buyers,sellers}},
  relationships.base_token / quote_token / dex ids (token id format expected `solana_<mint>`).
- Fields expected on a trade (VERIFY): tx_hash, tx_from_address, kind (buy|sell), block_timestamp, block_number, volume_in_usd,
  from_token_amount, to_token_amount, price_from_in_usd, price_to_in_usd.
- If `market_cap_usd` is null, store null; do not substitute FDV.

### B. Solana JSON-RPC — one-time on-chain checks
- URL from `sources.rpc.url`. Default is the public endpoint (slow, rate-limited). The owner may paste a free Helius URL (key stored as a secret).
- Methods (standard Solana JSON-RPC): `getAccountInfo` (encoding `jsonParsed`), `getTokenSupply`, `getTokenLargestAccounts`,
  `getMultipleAccounts` (`jsonParsed`), `getSignaturesForAddress`, `getTransaction` (`jsonParsed`, `maxSupportedTransactionVersion:0`).
- Credit accounting: `sources.rpc.creditCost` maps method name -> credits per call (default 1). Phase 0 fills the real numbers
  from the provider's docs/dashboard. Streaming/WebSocket is NOT used in v1 (free-tier streaming is metered by data volume).

### C. OpenRouter — AI only (see 06). Not part of the pipeline.

## 3.2 Rate limiting (`net/tokenBucket.ts`)

`TokenBucket(capacity, refillPerSec)`; GT bucket: capacity 6, refill `cap/60` per second (24/min = 0.4/s).
`take(n)` waits until n tokens are available (FIFO queue, max wait 30 s else returns `RATE_WAIT_TIMEOUT`).
On HTTP 429: `penalize(60_000)` (drain bucket, block refill 60 s) and log a gap candidate if it lasts > 5 min.

Priority queue in front of the bucket (lower = more urgent):
`0` user-initiated (candles, trades for the open Detail token) · `1` discovery poll · `2` tracked snapshots · `3` background (token info).
Budget plan at defaults (calls/min): discovery 4 + tracked snapshots ≤ 12 + Detail trades 2 + user actions ≤ 6 = 24.

## 3.3 HTTP client (`net/http.ts`)

`getJson(url, {headers, timeoutMs=10000, retries=2})` -> `Result<{status, json}>`.
Retry on network error, timeout, 5xx: waits 1s then 3s. 429: no retry here (the bucket penalty handles it). 4xx other: no retry, `HTTP_4XX`.
Every attempt increments `api_usage.calls`; failures increment `errors` and append `error_log`.

## 3.4 Discovery loop (`pipeline/discovery.ts`)

Every `sources.gt.discoveryIntervalSec` (15 s) while the app runs:
1. `newPools(page=1)`.
2. For each returned pool (newest first): upsert `tokens` (by mint) and `pools` (by address); insert a `pool_snapshots` row with `source='geckoterminal'`.
3. A pool not previously in `pools` is a **new launch**: emit `evt:launch-new`. Batch `evt:launches-updated` events every 1000 ms.
4. Evaluate the **track filter** (3.6) for pools younger than `track.maxAgeMinForEntry` and promote to Tier 2.
5. Run the judge on the pool (shallow rules only) and store the judgement if `inputs_hash` changed.
6. Update `jobs_state('discovery')`: `last_ok_at = now` only if the call succeeded.
Source status for the UI: LIVE (<45 s since last ok), DELAYED (45-180 s), STALE (>180 s), OFFLINE (3 consecutive network failures).

## 3.5 Backfill on open and gaps (`pipeline/backfill.ts`)

At startup, `closedMs = now - jobs_state('discovery').last_ok_at` (if none: first run, skip backfill, no gap).
- If `closedMs > backfill.maxClosedHours * 3600000`: insert gap `{start: last_ok_at, end: now, reason:'app_closed'}` and skip paging.
- Else page `new_pools` pages 1..`backfill.maxPages`, one call per 3 s (through the bucket, priority 1), upserting like discovery.
  Stop when a page's OLDEST `pool_created_at` <= `last_ok_at - 5 min`.
  If the page cap is reached first: insert gap `{start: last_ok_at, end: oldest_pool_created_at_seen, reason:'backfill_cap'}`.
- VERIFY in Phase 0: the maximum page number the API serves and how many pools per page. Update `backfill.maxPages` default if different.
- Backfilled pools have `first_seen_at = now`; they are flagged `late` in the Feed by `first_seen_at - created_at_chain > 120000`.
- Backfilled launches only get a snapshot of their CURRENT state. Their early history is unknown, so rules needing early data return `unknown`.
- **A gap is never silently filled.** Lab statistics (04) exclude tokens created inside a gap and report the count.

## 3.6 Tracking (Tier 2) (`pipeline/tracker.ts`)

**Track filter:** pool age < 30 min AND `liquidity_usd >= track.minLiquidityUsd` (3000) AND `buys_m5 + sells_m5 >= track.minTx5m` (10).
Also tracked regardless of filter: watchlisted tokens and tokens with an open decision.
Tracked until `tracked_since + 24h` (watchlist/open decisions: no end).
On promotion, once: `getAccountInfo(mint)` -> authorities, decimals, supply (set `authorities_checked_at`). Once at pool age >= 10 min: holders check (3.7).
**Snapshot cadence** via `pools/multi` (30 addresses per call):
- age < 2 h: every 30 s · age 2-24 h: every 5 min.
- Adaptive: `requiredCallsPerMin = ceil(n30/30)*2 + ceil(n300/30)*0.2`. If it exceeds 12, multiply all intervals by `k = required/12`, rounded UP to a multiple of 15 s. Show the current multiplier on the Health screen.

## 3.7 Deep data (Tier 3) (`pipeline/deep.ts`)

Triggered when a token is opened in the Detail window (or has an open decision); stops 60 s after the window closes/changes.
- **Trades:** every 30 s, `poolTrades(address)`, upsert into `trades` (UNIQUE dedupes). Trades older than 24 h are not available from the source: rules needing them return `unknown`.
- **Holders:** `getTokenLargestAccounts(mint)` -> up to 20 token accounts; `getMultipleAccounts(those, jsonParsed)` -> owner of each;
  then `getMultipleAccounts(owners, jsonParsed)` -> owner program of each owner account.
  Class: `burn` if owner is `1nc1nerator11111111111111111111111111111111`; `program` if the owner account's own `owner` is not the System Program
  (`11111111111111111111111111111111`) or the account does not exist as system-owned; else `wallet`.
  `top1_pct`/`top10_pct` use WALLET rows only, as % of `getTokenSupply`. Refresh at most every 10 min per token. 3 RPC calls per refresh.
- **Creator derivation (best effort, tokens younger than 6 h only):** page `getSignaturesForAddress(mint, limit 1000)` backwards until a page has < 1000 results;
  oldest signature -> `getTransaction` -> `accountKeys[0]` (fee payer) = `creator_wallet`. Mark `creator_derived_at`. Older tokens: creator stays NULL (rule R05 = unknown).
- **Funders (R07, default OFF):** for up to 10 distinct earliest buyers, `getSignaturesForAddress(wallet, limit 20)` oldest -> `getTransaction` -> first System Program transfer into the wallet
  -> `funder`. Budget guard: skip if the month's RPC credits used > 80% of budget.

## 3.8 Normalization (`sources/normalize.ts`)

Pure functions, no I/O, fully covered by fixture tests:
`normalizePool(apiPool, included): {token, pool, snapshot}` and `normalizeTrade(apiTrade, poolId): Trade`.
Rules: strings trimmed; `symbol` max 32 chars, `name` max 64 (truncate); control characters removed; numeric strings parsed with `Number()`; NaN/Infinity -> null.
Mint = base token id with `solana_` prefix removed. Reject (and `error_log` as `PARSE_FAIL`) any pool whose mint or address is not valid base58 (length 32-44).
Skip pools whose quote token is not SOL, USDC or USDT in v1 (keep a counter shown on Health).

## 3.9 Scheduler (`pipeline/scheduler.ts`)

Single module that starts/stops: discovery (15 s), tracker snapshots (tick every 5 s, picks due pools), deep (30 s, only when a token is open),
retention (start + 6 h), SOL/USD refresh (hourly, only if wallet import is configured), judge recompute (on data change, debounced 60 s per token).
`startAll()` runs backfill FIRST, then starts loops. `stopAll()` waits for in-flight requests (max 5 s), then closes the DB. All timers use `clock`.
On `powerMonitor 'suspend'` stop loops; on `'resume'` run backfill again.

## 3.10 Phase 0 pass/fail numbers

Over a 24 h capture: observed launches >= 90% of the reference count in a 2 h comparison window; request error rate < 2%; no sustained 429 > 5 min;
RPC mint check success >= 95% on 50 sampled tokens; creator derivation success >= 70% for tokens younger than 6 h; measured monthly RPC credits (projected) <= 60% of budget.
Results: Full (all pass), Reduced (some fail -> list which features to drop), Not feasible (discovery fails).
