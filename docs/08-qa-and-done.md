# 08 — Research-System QA and Definition of Done

This replaces the former live-journal/real-trade QA checks. No QA task is allowed to submit a transaction or connect a signer.

## 8.1 Test layers

- **Unit:** timestamp/provenance logic, normalization, gaps, feature/label construction, risk flags, cost formulas, ranking, split logic, strategy search budgets, worker protocol.
- **Integration:** provider fixtures, raw-to-Parquet replay, SQLite catalog/jobs, migrations, deterministic backtest, local worker lifecycle.
- **End-to-end:** Electron UI, local research worker, seeded datasets, mocked provider network. Tests never call the live internet.
- **Manual live-data checks:** owner-approved provider capture only, no wallet key and no transaction submission.
- **Research validation:** frozen out-of-sample and prospective paper results, reviewed separately from code test status.

## 8.2 Required application/data scenarios

| # | Scenario | Expected |
|---|---|---|
| S1 | Existing user DB opened after migration | Existing rows preserved; backup made; legacy real journal data is read-only/exportable. |
| S2 | Provider emits active, scam, dead, low-liquidity and migrated launches | Every discovered launch is retained in shallow corpus; no quality filter deletes it. |
| S3 | Provider response includes a field absent from prior schema | Raw response retained; normalized status unknown/unsupported; no crash or silent zero. |
| S4 | App is closed/offline and later reopens | Gap recorded; backfill result is explicit; unavailable data stays a gap. |
| S5 | Security result fetched today for old token | `availableAt` is today; historical feature builder excludes it from earlier decisions. |
| S6 | Token is missing holder or authority data | Flag status unknown; completeness reduced; it is not treated as safe/clear. |
| S7 | Data cap crosses 80%, 90%, 95% | Warning, deep-capture pause, and raw-write pause occur in order; no automatic deletion. |
| S8 | Raw fixture replayed twice with same normalizer | Same normalized output hash; prior dataset version unchanged. |
| S9 | Research worker emits malformed/oversized output or crashes | Typed error/interrupted job; UI and collector stay usable; no protocol output is rendered as trusted data. |
| S10 | Feature builder sees an event after decision time | Event is excluded, including late-fetched history whose `availableAt` is after decision time. |
| S11 | Backtest reaches rug/no exit/insufficient liquidity | Trade is counted as loss/unexitable under documented formula; it is not dropped. |
| S12 | Model ranks candidate | UI shows one score, horizons, uncertainty, data completeness, risk evidence, model/data versions. |
| S13 | Search tries many variants | Every candidate/run is logged; final test stays inaccessible to tuning; failed candidates remain visible. |
| S14 | Local LLM receives hostile token metadata | Metadata treated as untrusted; model cannot invoke data changes, strategy edits, worker commands, or network. |
| S15 | Paper signal is generated | Signal is immutable and prospective; no trading endpoint, signing code, or real wallet is called. |
| S16 | Disk/worker/provider errors occur overnight | Gaps/errors and job IDs persist; restart is safe; morning Health report shows what was missed. |

## 8.3 Security and local-only checklist

Each item needs evidence:

- [ ] Renderer has no network permission (`connect-src 'none'`) and all IPC is allowlisted and schema-validated.
- [ ] Python worker communicates only by parent-owned stdin/stdout pipes; no local HTTP server or socket listener.
- [ ] API keys/secrets are excluded from raw records, manifests, logs, diagnostics, and model prompts.
- [ ] Hosted AI endpoints are absent; all inference/training uses local model files. The optional Ollama client only accepts the configured `127.0.0.1` loopback host and has no cloud fallback.
- [ ] No wallet secret, seed phrase, transaction signing, send-order code, or venue integration exists.
- [ ] Token names/social metadata are treated as untrusted text in UI, prompts, logs, and exports.
- [ ] Raw data is append-only; derived versions and run artifacts are immutable and hashed.
- [ ] Migrations preserve existing user data and have tested backup/restore.
- [ ] Storage cap never triggers silent deletion; cleanup preview lists exact files/bytes and exclusions.
- [ ] No screen calls an unknown/missing measurement zero or a positive risk check “safe”.

## 8.4 Research validity checklist

- [ ] Every normalized record has source, event/observation time, available time, and quality status.
- [ ] Feature tests prove no future information leaks into historical decisions.
- [ ] Security/holder/social observations are never backdated.
- [ ] Dataset retains sampled scam/dead/untradeable launches and reports selection coverage.
- [ ] Fees, delay, liquidity, slippage, unexitable trades, and stress costs are included and versioned.
- [ ] Baselines run on identical splits and costs; every model/strategy variant tried is reported.
- [ ] Chronological splits, embargo, untouched test, walk-forward results, and cohort metrics are present.
- [ ] A “no edge” outcome is a valid result; models/strategies cannot be promoted by in-sample metrics alone.
- [ ] Forward paper evaluation uses frozen strategy/model/config and has predeclared duration/sample gates.
- [ ] Reports say “research estimate” and never promise a win, safety, or profit.

## 8.5 Final completion gates

The transformed research system is complete only when:

1. All phase gates in docs/07 are signed off by the owner.
2. `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, and Python worker tests pass from a clean checkout.
3. Phase 0 provider, terms, coverage, GPU/RAM, and storage measurements are present and dated.
4. At least 72-hour app-open soak and backup/restore pass; no unexplained data loss or silent deletion occurs.
5. Backtest reproduces deterministic fixtures and passes leakage tests.
6. Final reports include baselines, all tested variants, stress costs, untouched test, and prospective paper results.
7. The result is displayed honestly, including `NO ROBUST EDGE FOUND` when that is what the evidence supports.
8. Security/scope checklist in §8.3 passes. The app contains no live execution implementation.

Completing this system is not evidence of guaranteed profitability and does not authorize a live-trading project.
