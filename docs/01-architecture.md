# 01 — Architecture

## 1.1 Process model

```
┌────────────────────────── Electron MAIN process (Node) ──────────────────────────┐
│ SQLite (better-sqlite3)  ·  schedulers  ·  sources (HTTP)  ·  judge engine       │
│ risk engine  ·  journal service  ·  wallet import  ·  AI client  ·  settings     │
│                  IPC handlers (zod-validated)   ·   event emitter                 │
└───────────────▲──────────────────────────────────────────────▲────────────────────┘
        invoke / events (preload bridge `window.api`)   invoke / events
┌───────────────┴───────────────┐                ┌──────────────┴────────────────┐
│ FEED window (renderer #/feed) │                │ DETAIL window (#/detail/:id)  │
│ React, no Node access         │                │ React, no Node access         │
└───────────────────────────────┘                └───────────────────────────────┘
```

- Main owns ALL data, network and timers. Renderers are display + input only.
- Both windows load the same renderer bundle; the hash route decides the screen.
- Main keeps `selectedTokenId`. `detail:select` sets it and emits `evt:detail-selected`.
- If only one display is connected, the Detail window opens on the right 40% of that display.
- Window bounds + display id are saved in `settings` (`window.feed`, `window.detail`) on close and restored on open (clamp to a visible display).

## 1.2 Repo tree (create exactly this)

```
ticklab-radar/
  package.json  tsconfig.json  electron.vite.config.ts  vitest.config.ts  .eslintrc.cjs
  QUESTIONS.md
  fixtures/gt/ fixtures/rpc/            # real API responses saved in Phase 0
  scripts/p0/                           # Phase 0 feasibility scripts (plain Node)
  src/
    shared/        types.ts  ipc.ts  format.ts  constants.ts  glossary.ts
    main/
      index.ts  windows.ts  menu.ts  logger.ts  clock.ts
      db/          open.ts  migrate.ts  migrations/001_init.sql  queries/*.ts
      settings/    store.ts  defaults.ts  secrets.ts  audit.ts
      net/         tokenBucket.ts  http.ts
      sources/     geckoterminal.ts  solanaRpc.ts  normalize.ts
      pipeline/    discovery.ts  backfill.ts  tracker.ts  deep.ts  retention.ts  scheduler.ts
      judge/       engine.ts  config.ts  exitImpact.ts  rules/R01..R11.ts  alerts.ts
      lab/         replay.ts  stats.ts  prng.ts
      journal/     risk.ts  service.ts  paperFill.ts  stats.ts  exportCsv.ts
      wallet/      import.ts  parseSwap.ts  solUsd.ts
      ai/          openrouter.ts  context.ts  sanitize.ts  safety.ts  prompts.ts
      ipc/         register.ts  handlers/*.ts
    preload/       index.ts
    renderer/
      index.html  main.tsx  router.tsx  styles/tokens.css  styles/base.css
      state/       store.ts (zustand)  hooks.ts
      components/  Button Chip ScoreChip Table Modal Toast Tooltip Input Select Toggle Tabs Spinner StatusBar Sidebar TopBar
      screens/     Feed/ Detail/ Watchlist/ Journal/ Lab/ Health/ Settings/
  tests/           unit/ e2e/
```

## 1.3 Scripts (package.json)

`dev`, `build`, `typecheck` (tsc --noEmit for main, preload, renderer), `lint`, `test` (vitest run),
`test:e2e` (Playwright electron), `dist` (electron-builder NSIS x64), `p0:capture`, `p0:rpc`, `p0:report`.
`postinstall`: `electron-builder install-app-deps` (rebuilds better-sqlite3 for Electron).
Bootstrap with: `npm create @quick-start/electron@latest ticklab-radar -- --template react-ts`.

## 1.4 Allowed dependencies (nothing else without owner approval)

Runtime: `electron`, `react`, `react-dom`, `react-router-dom` (HashRouter), `zustand`, `zod`,
`better-sqlite3`, `@tanstack/react-virtual`, `lightweight-charts` (pin `^4.2.0`; use the v4 API
`addCandlestickSeries`/`addLineSeries`/`addHistogramSeries`), `lucide-react`,
`@fontsource/inter`, `@fontsource/jetbrains-mono`, `electron-log`, `bs58`.
Dev: `typescript`, `electron-vite`, `vite`, `vitest`, `@playwright/test`, `eslint`,
`@typescript-eslint/*`, `prettier`, `electron-builder`, `@types/*`.
Pin exact versions in the lockfile at install time; do not use `latest` ranges for `electron`.

## 1.5 Conventions

- **Time**: epoch **milliseconds, UTC**, INTEGER everywhere. Display in the system time zone.
- **Money**: USD as REAL (double). Never use floats for lamports: store lamports as INTEGER.
- **Addresses**: base58 strings, case-sensitive, never lowercased.
- **IDs in code**: `tokenId`, `poolId`, `decisionId` are SQLite INTEGER rowids.
- **Null means unknown** in snapshot/judge data. Never coerce null to 0.
- **Errors**: functions return `Result<T> = {ok:true,value:T} | {ok:false,error:{code:string,message:string}}`
  at module boundaries (sources, ipc). Throwing is for programmer errors only.
  Error codes: `NET_TIMEOUT NET_OFFLINE HTTP_429 HTTP_5XX HTTP_4XX PARSE_FAIL RPC_ERROR DB_ERROR VALIDATION RISK_BLOCKED AI_LIMIT AI_FAIL`.
- **Clock**: all code reads time via `clock.now()` so tests can freeze it.
- **Logging**: `electron-log`, file in userData/logs, 5 files x 2 MB rotation, levels error/warn/info/debug. No secrets.

## 1.6 Security (Electron)

BrowserWindow options for BOTH windows: `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`,
`webSecurity:true`. Preload exposes only `window.api.invoke(channel,payload)` and
`window.api.on(channel,cb)` limited to an allowlist from `shared/ipc.ts`.
Set a CSP meta tag: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'none'`
(renderers make NO network calls). `setWindowOpenHandler` returns `{action:'deny'}`;
`will-navigate` is prevented. `app:openExternal` accepts only `https://www.geckoterminal.com/`,
`https://solscan.io/`, `https://dexscreener.com/` prefixes. Secrets (RPC key, OpenRouter key)
are encrypted with `safeStorage` (Windows DPAPI) and stored in `userData/secrets.bin`, never in SQLite.
Token names/symbols are attacker-controlled text: always display as plain text; sanitize before AI use (see 06).

## 1.7 Default settings (`settings/defaults.ts`, stored as JSON per key)

```json
{
 "sources.gt.enabled": true,
 "sources.gt.callsPerMinuteCap": 24,
 "sources.gt.discoveryIntervalSec": 15,
 "sources.rpc.url": "https://api.mainnet-beta.solana.com",
 "sources.rpc.creditCost": {"default": 1},
 "sources.rpc.monthlyCreditBudget": 1000000,
 "track.minLiquidityUsd": 3000,
 "track.minTx5m": 10,
 "track.maxAgeMinForEntry": 30,
 "track.durationHours": 24,
 "backfill.maxPages": 10,
 "backfill.maxClosedHours": 6,
 "retention.snapshotDays": 30,
 "retention.tradeDays": 30,
 "judge.rulesVersion": "rules_v1",
 "judge.defaultPositionUsd": 10,
 "costs.tradeFeePctPerSide": 1.0,
 "costs.networkFeeUsdPerTx": 0.10,
 "alerts.enabled": true,
 "alerts.maxScore": 30,
 "alerts.minCompleteness": 0.6,
 "alerts.minLiquidityUsd": 5000,
 "alerts.minBuyersH1": 20,
 "alerts.minAgeMin": 5,
 "alerts.maxAgeMin": 120,
 "journal.startEquityUsd": 200,
 "risk.maxPositionPct": 5,
 "risk.maxOpenPositions": 3,
 "risk.maxDrawdownPct": 25,
 "risk.maxLosingTradesPerDay": 3,
 "risk.loosenCooldownHours": 24,
 "ai.enabled": true,
 "ai.models": [],
 "ai.dailyLimit": 50,
 "wallet.address": null,
 "ui.feedMaxRows": 5000
}
```
Notes: fee/slippage numbers are ASSUMPTIONS to be replaced by measured values from real fills.
`ai.models` is filled from the OpenRouter models list (only ids ending `:free`).
