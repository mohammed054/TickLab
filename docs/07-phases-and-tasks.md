# 07 — Phases and Task Cards

Do cards strictly in order. Card format: **Files** (the only files you may touch) · **Spec** (what to read) · **Do** · **Accept** (must pass, paste output).
"Fixture test" = a vitest test that loads a saved real response from `fixtures/` and asserts on parsed values.
A phase is finished only when its **Phase gate** passes. Phase 0 and Phase 5 gates need the owner's review.

---
## PHASE 0 — Feasibility (plain Node scripts, no app yet)

**P0.1 Scripts workspace.** Files: `package.json`, `scripts/p0/.env.example`, `scripts/p0/lib.mjs`. Spec: 03 §3.1-3.3. Do: npm init; `lib.mjs` exports `getJson(url,{headers})` with timeout 10 s, a simple 24-calls/min limiter, and `appendJsonl(file,obj)`. Accept: `node scripts/p0/lib.mjs --selftest` prints `OK` and shows the limiter delaying the 25th call in a loop test.

**P0.2 Discovery capture.** Files: `scripts/p0/capture.mjs`. Spec: 03 §3.4. Do: poll `new_pools?page=1` every 15 s for N hours (`--hours`), append every response (raw) to `data/p0/gt-newpools.jsonl` with local timestamp + HTTP status; log errors and 429s. Accept: run with `--hours 0.05`; file has >= 10 lines; summary printed: calls, errors, unique pool addresses.

**P0.3 Fixture + field verification.** Files: `fixtures/gt/*.json`, `scripts/p0/fields.mjs`, `docs/build-spec/FIELDS.md`. Spec: 03 §3.1. Do: fetch ONE real response each for new_pools, pools/multi (5 addresses), pool trades, ohlcv minute, tokens info; save to `fixtures/gt/`. `fields.mjs` prints, for every expected field in 03 §3.1, `present/missing` and the real name if different. Write `FIELDS.md` = table of real field names + `max page served` + `pools per page`. Accept: `FIELDS.md` exists, no row says "assumed".

**P0.4 RPC probe.** Files: `scripts/p0/rpc.mjs`, `fixtures/rpc/*.json`. Spec: 03 §3.1B, §3.7. Do: take 50 tokens from the capture; for each run mint check, largest accounts, owners, creator derivation; measure latency and success; record the provider dashboard credits before/after (owner supplies numbers). Save one fixture per method. Accept: printed table: success % per method; fixtures saved.

**P0.5 Wallet-swap fixtures.** Files: `fixtures/rpc/swap-*.json`. Spec: 06 §6.5. Do: with the owner's help, save 3 real `getTransaction` (jsonParsed) results of DEX swaps (1 buy, 1 sell, 1 non-swap transfer) from any public wallet. Choose the SOL/USDC reference pool and record its address in `FIELDS.md`. Accept: files exist; owner confirms they are real.

**P0.6 Terms and cost check.** Files: `docs/build-spec/P0-TERMS.md`. Do: summarize (with links + date) GeckoTerminal and the chosen RPC provider terms for local storage; confirm free-tier limits; record real RPC credit cost per method. Accept: file has all three sections and a monthly credit projection.

**P0.7 Feasibility report + gate.** Files: `docs/build-spec/P0-REPORT.md`. Spec: 03 §3.10. Do: fill the numbers; verdict Full / Reduced / Not feasible with reasons; list spec items that must change. Accept: **PHASE 0 GATE: owner reads the report and replies "go".**

---
## PHASE 1 — Skeleton

**T1.1 Scaffold.** Files: whole scaffold. Spec: 01 §1.2-1.4. Do: `npm create @quick-start/electron` react-ts; install allowed deps; create the folder tree with empty `index.ts` placeholders; configure strict TS, ESLint, Prettier, vitest. Accept: `npm run typecheck`, `lint`, `test` pass; `npm run dev` opens a window.

**T1.2 Logger, clock, constants.** Files: `main/logger.ts`, `main/clock.ts`, `shared/constants.ts`. Do: per 01 §1.5. Accept: unit test: frozen clock returns set time; log file appears in userData/logs.

**T1.3 DB open + migrations.** Files: `db/open.ts`, `db/migrate.ts`, `db/migrations/001_init.sql`. Spec: 02 entire. Do: copy SQL exactly, add the append-only triggers for ALL tables listed. Accept: test opens a temp DB, runs migrations twice (idempotent), and UPDATE/DELETE on `decisions`, `fills`, `fill_voids`, `decision_notes`, `rule_configs`, `equity_events`, `risk_acks` each throw `append-only table`.

**T1.4 Settings store + secrets.** Files: `settings/*.ts`. Spec: 01 §1.6-1.7, 06 §6.3 (cooldown). Do: typed get/set with zod per key, defaults, audit rows, `effectiveLimits`, secrets via `safeStorage` (fallback in tests: in-memory). Accept: tests: defaults load; loosening `risk.maxPositionPct` 5->8 writes audit with `effective_at = now+24h` and `effectiveLimits(now)` still returns 5; tightening applies immediately; secret round-trips and is never in SQLite.

**T1.5 Shared types + IPC contracts.** Files: `shared/types.ts`, `shared/ipc.ts`, `shared/format.ts`. Spec: 06 §6.1-6.2, 05 §5.2. Do: all types, channel name constants, zod schemas for payloads, format functions. Accept: format unit tests cover every rule in 05 §5.2 including null and tiny prices (`0.00001234` -> `$0.00001234`).

**T1.6 Preload + IPC registry.** Files: `preload/index.ts`, `ipc/register.ts`. Spec: 01 §1.6, 06 §6.1. Do: allowlist bridge; `register()` wires handlers (stubs return `{ok:false,error:{code:'NOT_IMPLEMENTED'}}`). Accept: test: unknown channel rejected; invalid payload returns `VALIDATION`.

**T1.7 Window manager.** Files: `main/windows.ts`, `main/index.ts`, `main/menu.ts`. Spec: 01 §1.1, 05 §5.5/5.7. Do: create Feed and Detail windows with sizes/mins from 05, security flags, save/restore bounds+display, single-display fallback (Detail right 40%), `detail:select` + `evt:detail-selected` plumbing, minimal menu (File: Quit; View: Reload, Toggle DevTools in dev only). Accept: manual: two windows open; closing Detail then selecting a token in Feed reopens it; relaunch restores positions.

**T1.8 Design tokens + base components.** Files: `renderer/styles/*.css`, `components/{Button,Input,Select,Toggle,Chip,ScoreChip,Tabs,Tooltip,Spinner}.tsx`. Spec: 05 §5.1, 5.3. Do: exact sizes/colors. Accept: a dev-only `#/kit` route renders every component; component tests assert heights (28/18/32) via computed style.

**T1.9 Table, Modal, Toast.** Files: `components/{Table,Modal,Toast}.tsx`. Spec: 05 §5.3. Do: virtualized table with sticky header, row selection, keyboard handling hooks; modal with focus trap + Esc; toast manager (max 3, 5 s, hover pause). Accept: test renders 5,000 rows and only < 60 DOM rows exist; Esc closes modal.

**T1.10 Shell: sidebar, top bar, status bar, router.** Files: `Sidebar.tsx`, `TopBar.tsx`, `StatusBar.tsx`, `router.tsx`, `main.tsx`, `screens/*/index.tsx` (placeholders). Spec: 05 §5.4-5.5. Do: layout exactly as the diagram; placeholders show screen name; shortcuts. Accept: Playwright: sidebar width 48, top bar 40, status bar 24; `Ctrl+3` navigates to `#/journal`.

**T1.11 Zustand store + event hooks.** Files: `state/store.ts`, `state/hooks.ts`. Do: store for filters, selection, source status, alerts, risk; `useIpcEvent(channel, cb)` hook with cleanup. Accept: unit test of reducers; no memory leak test (subscribe/unsubscribe 100x leaves 0 listeners).

**T1.12 Packaging smoke.** Files: `electron-builder.yml`. Do: NSIS x64 installer config, appId `com.ticklab.radar`. Accept: `npm run dist` produces an installer; installed app launches and creates `radar.db`. **PHASE 1 GATE:** typecheck, lint, test, e2e smoke all green.

---
## PHASE 2 — Data pipeline

**T2.1 TokenBucket.** Files: `net/tokenBucket.ts`+test. Spec: 03 §3.2. Accept: tests with fake clock: burst of 6 passes, 7th waits; `penalize(60000)` blocks; priority ordering respected.

**T2.2 HTTP client.** Files: `net/http.ts`+test. Spec: 03 §3.3. Accept: tests with a local mock server: timeout, 500 retry x2 then fail, 429 no retry, usage counters incremented.

**T2.3 GeckoTerminal client.** Files: `sources/geckoterminal.ts`+test. Spec: 03 §3.1, FIELDS.md. Do: methods `newPools(page)`, `poolsMulti(addrs)`, `poolTrades(addr,minUsd?)`, `poolOhlcv(addr,tf)`, all through bucket + http, returning `Result`. Accept: fixture tests parse every fixture into typed objects; unknown response shape returns `PARSE_FAIL` not a throw.

**T2.4 Normalizers.** Files: `sources/normalize.ts`+test. Spec: 03 §3.8. Accept: fixture tests: symbol/name truncation, control-char stripping, invalid base58 rejected, null numbers stay null, non-SOL/USDC/USDT quote skipped and counted.

**T2.5 Queries layer.** Files: `db/queries/{tokens,pools,snapshots,trades,holders,judgements,alerts,gaps,usage}.ts`. Spec: 02. Do: prepared statements, upserts, `listLaunches(filters,sort,limit)` joining latest snapshot + latest judgement. Accept: tests with temp DB: upsert idempotent; `listLaunches` filters/sorts correctly for each Filters field; query on 10,000 pools returns < 50 ms.

**T2.6 Discovery loop.** Files: `pipeline/discovery.ts`+test. Spec: 03 §3.4. Accept: test with mocked client: first poll inserts N launches and emits N `launch-new`; second identical poll emits 0 and inserts N new snapshots; failure updates `error_log` but not `last_ok_at`; status transitions LIVE->DELAYED->STALE with fake clock.

**T2.7 Backfill and gaps.** Files: `pipeline/backfill.ts`+test. Spec: 03 §3.5. Accept: tests: closed 30 min -> pages until overlap, no gap; closed 3 h with cap reached -> `backfill_cap` gap; closed 10 h -> `app_closed` gap, zero calls; first run -> nothing.

**T2.8 Usage meter + source status.** Files: `pipeline/usage.ts`, `pipeline/status.ts`. Do: per-day counters, calls-last-minute window, `evt:source-status` every 5 s. Accept: test of counters and status events.

**T2.9 Tracker.** Files: `pipeline/tracker.ts`+test. Spec: 03 §3.6. Accept: tests: filter promotes only qualifying young pools; due-selection picks the right pools per cadence; adaptive multiplier rises when 120 pools tracked and is a multiple of 15 s; tracking ends at 24 h unless watchlisted.

**T2.10 RPC client.** Files: `sources/solanaRpc.ts`+test. Spec: 03 §3.1B. Accept: fixture tests for mint info, largest accounts, multiple accounts, signatures, transaction; credit accounting uses the cost table.

**T2.11 Deep fetch.** Files: `pipeline/deep.ts`+test. Spec: 03 §3.7. Accept: fixture tests for holder classification (wallet/program/burn), `top1/top10` math, creator derivation, 10-minute refresh throttle, stop 60 s after Detail closes.

**T2.12 Retention.** Files: `pipeline/retention.ts`+test. Spec: 02 §2.2. Accept: test: old snapshots deleted, watchlisted/decision-linked kept, journal rows untouched.

**T2.13 Scheduler + wiring.** Files: `pipeline/scheduler.ts`, `main/index.ts`. Spec: 03 §3.9. Accept: manual run: app opens, within 30 s the DB has launches; closing and reopening backfills; suspend/resume handled.

**T2.14 IPC: launches + health + settings handlers.** Files: `ipc/handlers/{launches,health,settings,alerts,app}.ts`. Spec: 06 §6.1. Accept: handler tests with temp DB; payload validation; `app:openExternal` rejects a non-allowlisted URL. **PHASE 2 GATE:** run the app 2 hours: no crash, Health shows live counters, no 429 storm, DB has > 100 launches (if the market produced them).

---
## PHASE 3 — Feed window

**T3.1 Filters to SQL.** Files: `db/queries/listLaunches.ts`+test. Spec: 05 §5.6, 06 §6.2. Accept: tests for every filter and sort key, including NULL-safe sorting (nulls last).

**T3.2 Event batching.** Files: `ipc/events.ts`+test. Spec: 06 §6.1. Do: coalesce `launches-updated` ids into one event per second. Accept: test: 500 updates in 900 ms -> one event with unique ids.

**T3.3 Filter rail.** Files: `screens/Feed/FilterRail.tsx`. Spec: 05 §5.6. Accept: Playwright: width 240; each control present; Reset restores defaults; filters persist in memory while navigating screens.

**T3.4 Feed table.** Files: `screens/Feed/{FeedTable.tsx,columns.tsx,index.tsx}`. Spec: 05 §5.6. Accept: Playwright with a seeded DB of 2,000 rows: column widths match spec, default sort = newest first, header click sorts, scrolling stays at 60 fps (no frame > 32 ms in a 5-second scroll trace), live inserts do not move the viewport.

**T3.5 Keyboard + selection -> Detail.** Files: `screens/Feed/keys.ts`. Accept: Playwright: arrow keys move selection; 150 ms debounce calls `detail:select` once for rapid presses; `Enter` focuses Detail; `W` toggles watchlist.

**T3.6 New-row flash + LATE badge.** Files: `screens/Feed/rowEffects.tsx`. Accept: unit test of the effect timing (1200 ms); LATE badge shows when `late=true`.

**T3.7 Context menu + watchlist.** Files: `screens/Feed/ContextMenu.tsx`, `ipc/handlers/watchlist.ts`, `screens/Watchlist/index.tsx`. Spec: 05 §5.6, 5.8. Accept: add/remove updates star instantly; notes editable and saved; watched tokens auto-tracked (Tier 2).

**T3.8 Top bar + status bar live data + bell.** Files: `TopBar.tsx`, `StatusBar.tsx`, `AlertsPopover.tsx`. Spec: 05 §5.5. Accept: Playwright: statuses change with mocked events; bell badge counts unseen; `Mark all seen` clears.

**T3.9 Empty/offline states.** Files: `screens/Feed/states.tsx`. Spec: 05 §5.6. Accept: three states render under mocked conditions. **PHASE 3 GATE:** owner opens the app, sees live launches, filters/sorts them, and screenshots match the layout spec.

---
## PHASE 4 — Detail window

**T4.1 Detail shell + follow selection.** Files: `screens/Detail/{index.tsx,Header.tsx}`. Spec: 05 §5.7. Accept: Playwright with two windows: selecting in Feed updates Detail within 300 ms; Pin stops following; empty state text exact.

**T4.2 Overview tab.** Files: `screens/Detail/Overview.tsx`, `ipc/handlers/detail.ts`. Spec: 05 §5.7. Accept: stat cards show formatted values; stale clock icon appears when snapshot > 3 min old; flags list sorted by points desc.

**T4.3 Exit estimate panel.** Files: `screens/Detail/ExitEstimate.tsx`, `judge/exitImpact.ts`+test. Spec: 04 §4.2. Accept: tests: `S=10, L=1000 -> impact 1.96%`; null liquidity -> `—`; labelled "estimate".

**T4.4 Deep-data lifecycle.** Files: `pipeline/deepLifecycle.ts`. Spec: 03 §3.7. Accept: opening Detail triggers trades+holders fetch; closing stops within 60 s; no duplicate timers after 20 rapid selections.

**T4.5 Trades tab.** Files: `screens/Detail/Trades.tsx`. Accept: columns/widths per spec; min-USD filter; summary strip numbers equal values computed from rows.

**T4.6 Holders tab.** Files: `screens/Detail/Holders.tsx`. Accept: class chips; inline bars; program rows grey; observed-time footer.

**T4.7 Chart tab.** Files: `screens/Detail/ChartTab.tsx`, `ipc/handlers/candles.ts`. Spec: 05 §5.7. Accept: candles render from the fixture; timeframe switch refetches; "Not enough history yet." for < 5 candles.

**T4.8 Evidence tab.** Files: `screens/Detail/Evidence.tsx`. Accept: all enabled rules listed incl. unknown; evidence JSON pretty-printed; hash/time header correct.

**T4.9 Glossary tooltips + external links.** Files: `components/GlossaryTerm.tsx`, `shared/glossary.ts`. Spec: 06 §6.7. Accept: every term in 06 §6.7 present with exact text; GeckoTerminal/Solscan links go through `app:openExternal`. **PHASE 4 GATE:** owner walks a real token through every tab.

---
## PHASE 5 — Judge, Alerts, Rules Lab

**T5.1 Config loader.** Files: `judge/config.ts`, `judge/rules_v1.json`+test. Spec: 04 §4.3. Accept: valid file loads; missing/extra keys rejected by zod.

**T5.2 Rules R01-R04.** Files: `judge/rules/R01..R04.ts`+tests. Spec: 04 §4.2. Accept: table-driven tests with boundaries (`top1 = 20.0` clear, `20.01` hit), null -> unknown.

**T5.3 Rules R05-R07.** Files: `judge/rules/R05..R07.ts`+tests. Accept: R05 with 3 priors/2 dumped = hit, 3 priors/1 dumped = clear, creator null = unknown; R06 window logic incl. unknown cases; R07 disabled by default.

**T5.4 Rules R08-R11.** Files: `judge/rules/R08..R11.ts`+tests. Accept: tier boundaries (`impact` exactly 0.03 clear, 0.0301 hit, 0.08 -> 10 pts, 0.0801 -> 20); R10 needs >= 3 snapshots.

**T5.5 Engine.** Files: `judge/engine.ts`+test. Spec: 04 §4.1. Accept: score cap 100; bands at 24/25, 49/50, 74/75; completeness math with a disabled rule; identical input -> identical `inputsHash`; engine is pure (test calls it 2x, no side effects).

**T5.6 Judge runner + persistence.** Files: `judge/runner.ts`. Spec: 04 §4.4. Do: build `JudgeInput` from DB, store judgement only when hash changed, emit `evt:judgement-updated`. Accept: test: unchanged data -> no new row; changed liquidity -> new row.

**T5.7 Alerts.** Files: `judge/alerts.ts`+test, `ipc/handlers/alerts.ts`. Spec: 04 §4.5. Accept: tests: all-conditions-true creates exactly one alert per token; completeness 0.59 blocks; text matches the exact format; `liq_drop` alert on watchlisted token.

**T5.8 Lab engine.** Files: `lab/{replay.ts,stats.ts,prng.ts}`+tests. Spec: 04 §4.6. Accept: synthetic DB tests: no look-ahead (a rule input timestamped after T is ignored — test by planting future data), exit-collapse override works, UNKNOWN conservative=-100, mulberry32 reproducible, bootstrap CI is deterministic for a seed, verdict stays `EDGE NOT PROVEN` when n < 200.

**T5.9 Lab UI + freeze.** Files: `screens/Lab/*`, `ipc/handlers/lab.ts`. Spec: 05 §5.8, 02 (`rule_configs`). Accept: Run produces results table + histogram; Freeze stores sha256; editing a frozen config in the UI is impossible (creates a new one).

**T5.10 Feed integration of scores.** Files: `screens/Feed/columns.tsx` (score/flags cells). Accept: ScoreChip colors/low-data style per 05; flags icons with tooltips. **PHASE 5 GATE:** owner reviews Lab output on collected data. If the verdict is `EDGE NOT PROVEN`, the roadmap says: do not trade; keep collecting.

---
## PHASE 6 — Journal

**T6.1 Risk engine.** Files: `journal/risk.ts`+test. Spec: 06 §6.3. Accept: tests: equity/peak/drawdown math; pause at 25.0%; 3 losing trades pause; midnight clears the daily pause (fake clock, local tz); size cap; open cap; cooldown-applied limits.

**T6.2 Decision/fill service.** Files: `journal/service.ts`+test. Spec: 06 §6.4, 02. Accept: createDecision blocked when paused; thesis < 20 rejected; in a transaction; void excluded from outcomes; closed PnL formula test.

**T6.3 Paper fills.** Files: `journal/paperFill.ts`+test. Spec: 06 §6.4. Accept: entry/exit math tests (`S=10, L=1000, p=0.001, fee 1%, net 0.10` expected values written in the test from the formulas); stale price refused.

**T6.4 Stats + CSV.** Files: `journal/{stats.ts,exportCsv.ts}`+tests. Accept: stats on a seeded 12-decision set; CSV has exactly the columns in 06 §6.4; unexitable (0 USD exit) counts as a loss.

**T6.5 Journal UI.** Files: `screens/Journal/*`, `ipc/handlers/journal.ts`. Spec: 05 §5.8. Accept: Playwright: account switch; summary cards; risk panel states; drawer actions.

**T6.6 New-decision modal.** Files: `screens/Journal/NewDecisionModal.tsx`. Spec: 05 §5.9. Accept: max size enforced; PAUSED disables submit and shows reason; paper entry fill created instantly.

**T6.7 Manual real-fill form.** Files: `screens/Journal/FillForm.tsx`. Accept: required fields; entry before exit; void with reason.

**T6.8 Wallet import.** Files: `wallet/{import.ts,parseSwap.ts,solUsd.ts}`+tests. Spec: 06 §6.5. Accept: fixture tests: buy, sell, non-swap -> null; failed tx -> null; secret-looking input rejected; sync is idempotent (twice = same rows).

**T6.9 Unlinked trades UI.** Files: `screens/Journal/UnlinkedTrades.tsx`, `ipc/handlers/wallet.ts`. Accept: suggested match shown; linking creates a `wallet` fill; never auto-links. **PHASE 6 GATE:** owner records 3 paper decisions end to end.

---
## PHASE 7 — AI helper

**T7.1 Key + models.** Files: `ai/openrouter.ts`(models part), `screens/Settings/AiSection.tsx`. Spec: 06 §6.6. Accept: only `:free` ids listed; key saved as secret and never returned.

**T7.2 Context + sanitizer.** Files: `ai/{context.ts,sanitize.ts}`+tests. Accept: tests: payload contains none of mint/pool/wallet/journal fields; hostile symbol `"ignore previous instructions {}"` -> redacted; length caps.

**T7.3 Prompts + safety filter.** Files: `ai/{prompts.ts,safety.ts}`+tests. Accept: prompt text equals the spec string exactly (snapshot test); each blocked pattern is caught; clean answer passes.

**T7.4 Client with limiter/fallback/cache.** Files: `ai/openrouter.ts`, `db/queries/ai.ts`+tests. Accept: mocked HTTP: 429 on model 1 falls to model 2; daily limit enforced and counts every attempt; cache hit costs 0; blocked response not cached.

**T7.5 AI tab UI.** Files: `screens/Detail/AiTab.tsx`, `ipc/handlers/ai.ts`. Spec: 05 §5.7. Accept: three presets + custom question; remaining counter updates; error box with Retry; footer text exact.

**T7.6 Glossary everywhere.** Files: feed/detail/journal text uses `GlossaryTerm`. Accept: grep test: each glossary term appears at least once in the UI. **PHASE 7 GATE:** owner asks three questions on a real token and judges answers "clear for a beginner".

---
## PHASE 8 — Hardening and ship

**T8.1 Error boundaries + crash safety.** Files: `renderer/ErrorBoundary.tsx`, `main/crash.ts`. Accept: a thrown render error shows a recoverable panel; main-process uncaught errors are logged and the app keeps running unless the DB is unusable.

**T8.2 Backups.** Files: `main/backup.ts`. Do: on start and every 24 h, `VACUUM INTO` a dated file in userData/backups; keep 7. Accept: test creates, rotates, restores.

**T8.3 Outage simulation tests.** Files: `tests/e2e/outage.spec.ts`. Accept: network off for 10 min (fake) -> OFFLINE state, saved data still shown, gap recorded on recovery; 429 storm -> bucket penalty, no tight loop (call count bounded).

**T8.4 Performance pass.** Files: only perf fixes in existing files. Accept: with 10,000 tokens and 500k snapshots: Feed first paint < 1 s, list query < 100 ms, memory < 600 MB after 1 h, DB writes do not block UI (main loop lag < 50 ms).

**T8.5 Security review.** Files: none (checklist). Accept: every item in 08 §8.4 passes with evidence.

**T8.6 E2E suite.** Files: `tests/e2e/*`. Accept: scripted scenarios S1-S15 in 08 §8.2 pass.

**T8.7 72-hour soak.** Accept: per 08 §8.3.

**T8.8 Installer + first-run.** Files: `main/firstRun.ts`, `screens/Settings/*`. Do: first-run flow (create DB, insert initial deposits, explain two windows, prompt for optional RPC/OpenRouter keys, show the "not advice, no guarantees" notice once). Accept: fresh-profile run shows it; second run does not.

**T8.9 Docs.** Files: `README.md`, `docs/USER-GUIDE.md`. Accept: guide covers install, first run, each screen, backups, limits, troubleshooting (429, offline, gaps), glossary link. **FINAL GATE:** 08 §8.5.
