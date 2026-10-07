# 08 — QA and Definition of Done

"10000% working" is measured here as: **every acceptance check passes, the app survives bad conditions, and no screen ever lies about missing data.**
It does NOT mean the app makes money. Profitability is decided only by the Rules Lab and forward paper results (roadmap stages 3-4).

## 8.1 Test layers

- **Unit (vitest):** pure logic: format, normalizers, rules, engine, risk, paper fills, replay, parseSwap, sanitizer, safety filter, token bucket.
- **Integration (vitest + temp SQLite):** queries, discovery/backfill/tracker with mocked sources, services, IPC handlers.
- **E2E (Playwright electron):** both windows, seeded DB, mocked network. Screenshots saved to `tests/e2e/shots/` for owner review.
- **Fixtures only:** no automated test may call the live internet. Live checks are manual (8.3).

## 8.2 Scenarios (all must pass; each is one Playwright spec)

| # | Scenario | Expected |
|---|---|---|
| S1 | First launch, empty DB | Feed shows spinner + "Waiting for the first poll…"; first-run notice appears once |
| S2 | Mock source emits 20 launches | Rows appear newest first; each flashes; Age updates every second |
| S3 | Select row in Feed | Detail window shows the token within 300 ms; header score matches the Feed chip |
| S4 | Pin Detail, select another row | Detail does not change; unpin follows again |
| S5 | Filter: liquidity >= $5K + bands LOW/MEDIUM | Only matching rows; Reset restores all |
| S6 | Token with R01 hit (mint authority) | ShieldAlert icon in Feed; Overview lists `+25`; Evidence shows raw authority value |
| S7 | Token with missing holders data | Rules R03/R04 `UNKNOWN`; completeness < 50% shows `LOW?` style and tooltip text |
| S8 | Alert conditions met | Toast appears with exact text; bell badge 1; click opens Detail; no second alert for same token |
| S9 | Network disabled for 6 min then restored | Status OFFLINE then LIVE; banner "Showing saved data"; a gap or backfill result is recorded |
| S10 | App closed 3 h then reopened with cap reached | `backfill_cap` gap shown in Health and as amber chip in Feed strip |
| S11 | New paper decision | Modal limits size to $10.00 at $200 equity; thesis < 20 chars blocks; success creates an entry fill |
| S12 | 3 losing paper trades in one day | Risk panel PAUSED (daily_losses), `New decision` disabled with reason; clears next day (fake clock) |
| S13 | Raise `risk.maxPositionPct` from 5 to 10 | Settings shows pending change effective in 24 h; modal max stays $10.00 until then |
| S14 | Paste a 12-word phrase / 64-byte key into the wallet field | Rejected with the secret warning; nothing stored |
| S15 | AI: ask 3 questions, then exceed the local daily limit | 3 answers shown with remaining counter dropping; at the limit `AI_LIMIT` message; hostile token name never appears in the request body |

## 8.3 Manual live checks (owner + builder, with real internet)

1. **Live 2-hour run:** compare the app's launch count with the public GeckoTerminal new-pools page for the same window; difference <= 10%.
2. **Rate check:** Health "API per min" never exceeds 24; zero sustained 429.
3. **72-hour soak** (app left open on the owner's PC across 3 days, sleeping allowed): no crash; memory at end < 600 MB; DB growth per day recorded; backups present; log files rotated; no screen freezes > 2 s;
   after sleep/resume the app backfills and shows correct gaps.
4. **Wallet import:** with the owner's real wallet (read-only address), 3 real swaps parse into `unlinked_trades` with correct side, token, SOL amount.
5. **Real vs displayed price:** for 5 tokens, price/liquidity in the app within 5% of GeckoTerminal's website at the same minute.

## 8.4 Security checklist (T8.5) — each item needs evidence

- [ ] `contextIsolation true`, `nodeIntegration false`, `sandbox true` on both windows (test reads webPreferences).
- [ ] Renderer cannot reach the network (CSP `connect-src 'none'`; a fetch from DevTools fails).
- [ ] Only allowlisted IPC channels exist; an unlisted channel call errors.
- [ ] `app:openExternal` rejects `http://`, `file://`, and non-allowlisted hosts.
- [ ] No remote images load anywhere (grep for `<img src="http` and CSS `url(http` returns nothing).
- [ ] Secrets are not in `radar.db`, logs, diagnostics export, or error messages (grep test with a canary key).
- [ ] Token names rendered as text only (a name `<img src=x onerror=alert(1)>` shows literally).
- [ ] Append-only triggers present and tested.
- [ ] AI payload contains no addresses or journal data (snapshot test).
- [ ] The app contains no code path that signs a transaction or sends funds (grep for `sendTransaction`, `signTransaction`, `Keypair`, `secretKey` returns nothing).

## 8.5 Final gate (all must be true)

1. All Phase gates 0-7 signed off by the owner.
2. `npm run typecheck`, `lint`, `test`, `test:e2e` all pass on a clean checkout (`git clone` + `npm ci`).
3. Scenarios S1-S15 pass; manual checks 8.3 (1-5) pass; security checklist complete.
4. Installer built from a clean checkout installs and runs on a fresh Windows user profile.
5. `docs/USER-GUIDE.md` exists and the owner can follow it unaided.
6. The Rules Lab verdict is displayed as-is, whatever it is. A result of `EDGE NOT PROVEN` is a valid, honest final state of the software.

## 8.6 Bug-report format for builder AIs

When a check fails, write in `QUESTIONS.md`: `#N | task | expected | actual | command output | what you tried`. Do not patch around a failing test by weakening it.
