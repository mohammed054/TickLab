# STATUS — TickLab Radar build handoff

## Done (verified in the build sandbox)
- Full main process: SQLite schema + append-only triggers, settings with loosening cooldown, judge (R01-R11), alerts, risk engine, journal (paper + real),
  GeckoTerminal/RPC clients with token bucket, discovery/tracker/deep/backfill/retention scheduler, Rules Lab, read-only wallet import, OpenRouter AI helper,
  IPC handlers (zod-validated, channel allowlist), preload bridge, two-window Electron entry, CSP, safeStorage secrets, daily backups, diagnostics.
- Renderer: Feed, Detail, Watchlist, Journal, Lab, Health, Settings, first-run notice.
- Phase 0 scripts (`scripts/p0/`), electron-builder config, USER-GUIDE, README, QUESTIONS.md (#1-#22).
- Checks: `npm test` 159 passing, `typecheck` clean, `lint` clean, `electron-vite build` succeeds. No signing/sending code, no banned wording, files <= 300 lines.

## Needs the owner (could not be done here)
1. **Phase 0 live capture** (sandbox had no network access to GeckoTerminal/RPC): run `p0:capture` (24 h), `p0:report`, `p0:rpc`; fill FIELDS.md, P0-TERMS.md, P0-REPORT.md; reply "go".
   Until then every GT/RPC field name is from the spec and fixtures are synthetic. If real names differ, fix `src/main/sources/normalize.ts`.
2. Real swap fixtures (P0.5) and the SOL/USDC reference pool for `wallet.solUsdPool`.
3. Run the app on Windows (`npm install`, `npm run dev`), manual live checks, e2e/soak tests, and `npm run dist` to produce the installer.
4. Phase gates and review of QUESTIONS.md.
Note: dev-mode HMR may be blocked by the strict CSP (QUESTIONS #2).
