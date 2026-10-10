# FIELDS — real GeckoTerminal field names

**STATUS: NOT YET VERIFIED.** Phase 0 live capture has not been run (the build sandbox had no access to api.geckoterminal.com).
Run on a Windows/any machine with internet:

    node scripts/p0/fields.mjs

It saves real responses to `fixtures/gt/` and writes `FIELDS.generated.md` (present/MISSING per field, pools per page, max page served).
Copy the table here, then fix `src/main/sources/normalize.ts` for any field whose real name differs and replace the `*.synthetic.json`
fixtures (see `fixtures/gt/README.md`). SOL/USDC reference pool address (set `wallet.solUsdPool` to it): `TODO (owner)`.
