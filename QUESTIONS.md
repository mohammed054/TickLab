# QUESTIONS.md — open questions for the owner / planner

(Format per docs/08 §8.6: `#N | task | expected | actual | what I tried`)


#1 | Renderer: server sort column names | docs say "sortable: all except Flags/star" but no column ids for `launches:list` sort.col | none defined | Used LaunchRow-style names: age (asc = newest first), symbol, dex, score, completeness, priceUsd, liquidityUsd, fdvUsd, volH1, buysM5, buyersH1, chgM5. Main must accept these (nulls last).
#2 | Renderer: CSP vs electron-vite dev | spec CSP `default-src 'self'` | @vitejs/plugin-react injects an inline HMR preamble that CSP blocks in dev | Kept the exact CSP; dev HMR may fail until the CSP is relaxed for dev only (not touched: configs are off limits).
#3 | Renderer: F5 "poll now" | a channel to trigger a discovery poll | none exists in api.ts | F5 only re-queries the Feed (bumps refreshTick); no backfill is triggered.
#4 | Renderer: mini price chart | snapshot history for the last 2 h | no channel returns snapshots | Used `detail:candles` tf 1m, closing prices, last 2 h.
#5 | Renderer: LaunchRow lacks pool address and flag points | GeckoTerminal link and "rule name + points" tooltip from the Feed row | LaunchRow only has hitRuleIds | Context menu calls `launches:get` to get the pool address; flag tooltips show the default points from docs/04 (R08/R09 "10 or 20").
#6 | Renderer: units | winRate / ruggedRate / unknownRate as fraction or percent; returns in percent; Candle.t in s or ms | unspecified | Assumed rates are fractions (x100 for display), returns/CI/histogram are percent (docs/04 returnPct), candle time accepted in either unit (>1e12 = ms). Histogram assumed 40 bins, -100%..+300%, last = overflow.
#7 | Renderer: Journal "New decision" without a token | token picker or selected token | spec does not say | Uses the token selected in the Feed; otherwise shows a toast asking to select one.
#8 | Renderer: equity add sign | sign convention for `journal:equity:add` withdraw | schema only says finite number | Sends a positive amount for deposit/withdraw and a signed amount for adjust; main must apply the sign by kind.
#9 | Renderer: first-run | whether `app:firstRun {}` has side effects | contract has `app:info.firstRunDone` and `app:firstRun {done?}` | Notice shown when app:info.firstRunDone is false; dismiss calls `app:firstRun {done:true}`.
#10 | Renderer: Lab alert rule inputs | spec says "5 inputs" | LabParams.alertRule has 6 numbers | Rendered all 6. Wallet "last sync time": no channel, so it shows the last sync done in this session only.
#11 | Renderer: vitest JSX | dom tests need JSX transform | vitest.config/tsconfig.json set no automatic runtime | Tests set globalThis.React (classic transform) instead of editing configs.
#12 | Phase 0 | live GeckoTerminal/RPC captures | sandbox network blocks both | All GT/RPC field names are from the spec only; fixtures are `*.synthetic.json`. Owner must run `scripts/p0/*` (see FIELDS.md) and fix normalize.ts if names differ.
#13 | Pipeline | trade side/amount mapping | spec lists from/to token amounts, not which is the base token | Assumed buy uses to_* fields, sell uses from_*. VERIFY with real trades.
#14 | Tooling | extra dev deps beyond doc 01 §1.4 | plugin-react, jsdom, testing-library needed for the renderer build/tests | Added as devDependencies only.
#15 | Risk | is lowering `risk.loosenCooldownHours` a loosening? | unspecified | Treated as loosening (delayed by the current cooldown) so the cooldown cannot be bypassed.
#16 | Tracker | adaptive interval formula | gives 8 calls/min for 120 pools (multiplier stays 1) | Implemented per spec; test uses 200 pools to show a rise.
#17 | Journal | paper entry on stale price | spec silent | Paper entry/exit refuses snapshots older than 15 min.
#18 | AI | custom question handling | spec gives no redaction rules | Char sanitization + length cap only; no keyword redaction.
#19 | Pipeline | creator derivation | page cap | Capped at 10 signature pages; R07 shared-funder not wired (rule default OFF).
#20 | Lab | what "freeze" stores | rule_configs holds rule config only | alertRule params are not frozen with it; they stay in lab_runs.params_json.
#21 | IPC | openExternal allowlist | no host list given | https only: geckoterminal.com, solscan.io, openrouter.ai, helius.dev, dancesafe.org.
#22 | Phase gates | Phase gates, e2e/soak, Windows installer, manual live checks | need owner/Windows | Not run here.
