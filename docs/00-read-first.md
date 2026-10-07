# 00 — READ FIRST (every builder AI, every session)

Product: **TickLab Radar**, a Windows desktop app for ONE owner. It watches new Solana
token launches, scores each for rug/manipulation risk, keeps an honest trade journal
(paper + real), and has a free AI helper that explains things to a non-trader.

It is NOT a trading bot. It never holds private keys, never signs, never submits orders.

## 0.1 Locked decisions (owner answers, do not reopen)

| Topic | Decision |
|---|---|
| Form | Desktop app, **Electron + TypeScript + React**. Windows 10/11 only. |
| Scope of "final" | Personal tool only: Radar + Judge + Journal + AI helper. No public site, no accounts, no payments. |
| Windows | **Two windows**: Feed window (main) and Detail window (second monitor). |
| Sources | All Solana DEX launches (not only Pump.fun). Real market data only. |
| Data strategy | **Tiered**: shallow data on every launch, deep data on tracked/pinned ones. |
| Always on? | No. App runs only while open. On open it **backfills**; unfillable time is recorded as a **gap**. |
| Alerts | **In-app only** (toasts + bell list). No sound, no OS notification, no Telegram. |
| Look | **Dark, dense trading terminal.** |
| Verdict style | **Risk score 0-100 plus flags** with evidence. |
| Journal | Paper AND real. Real trades via manual form AND read-only wallet-address import. |
| Trade venue | Undecided. The app never integrates with a venue. |
| AI | OpenRouter **free (`:free`) models**, to explain things to a beginner. |
| Risk defaults | 5% of equity max per position, max 3 open positions, pause at 25% drawdown from peak, pause for the day after 3 losing trades. Editable; loosening takes effect after 24h. |
| Start equity | $200 (paper and real tracked separately). |

If anything in `docs/16`, `docs/19` or `docs/20` disagrees with these files on scope
(sources, AI, framework), **this folder wins**.

## 0.2 Phase map (build phases vs. roadmap stages in docs/16)

| Build phase | Roadmap stage |
|---|---|
| Phase 0 Feasibility scripts | Stage 1 |
| Phases 1-4 Skeleton, data, Feed, Detail | Stage 2 |
| Phase 5 Judge + Rules Lab | Stage 3 |
| Phase 6 Journal | Stage 4 tooling |
| Phase 7 AI helper, Phase 8 Hardening | Stage 2-4 support |

**Phase 0 is a gate.** If it returns "Not feasible", stop and report to the owner.

## 0.3 Worker protocol (you are a small model; follow this exactly)

1. Do ONE task card at a time, in order, from `07-phases-and-tasks.md`.
2. Read only the files the card lists. Do not "explore" the repo.
3. Never invent an API field name, endpoint, or number. If a card says VERIFY,
   fetch a real response, save it under `fixtures/`, and code against the fixture.
4. If the spec is ambiguous or contradicts itself: append a numbered entry to
   `QUESTIONS.md` and STOP. Do not guess.
5. Do not add dependencies not listed in `01-architecture.md` section 1.4.
6. Do not refactor, rename, "improve" or reformat code outside the card's file list.
7. Every card ends with its **Acceptance** checks. Run them. Paste the real command
   output into your reply. A card is not done until all checks pass.
8. Commit message format: `P<phase>.<task>: <short summary>` (e.g. `P2.3: GeckoTerminal client`).
9. Max 300 lines per source file. Split if larger.
10. TypeScript `strict: true`. No `any`. No `@ts-ignore`. No `console.log` (use the logger).
11. All network code lives ONLY in `src/main/sources/` and `src/main/ai/`. Nowhere else.
12. Never UPDATE or DELETE rows in `decisions`, `fills`, `fill_voids`, `decision_notes`,
    `rule_configs`, `equity_events`, `risk_acks`. They are append-only (enforced by DB triggers).
13. Never log or display API keys. Never put secrets in the DB or settings JSON.
14. Never render remote images or remote HTML. Text only (React escapes it).
15. Never write text implying a guaranteed or expected profit anywhere in the UI.

## 0.4 Definition of done (per task)

- Code compiles (`npm run typecheck` passes).
- `npm run lint` passes.
- `npm test` passes, including tests the card requires.
- Acceptance checks on the card pass with pasted evidence.
- No file outside the card's list changed (`git status` shows only listed files).

## 0.5 Vocabulary (use these exact words in code and UI)

- **Token**: a mint address. **Pool**: a DEX trading pair for a token. **Launch**: a newly seen pool.
- **Snapshot**: one observation of a pool's market numbers at a time.
- **Tier 1**: discovered (shallow data only). **Tier 2**: tracked (periodic snapshots + one-time on-chain checks).
  **Tier 3**: deep (Detail window open or open position: trades, holders refresh).
- **Judgement**: the output of the rules for one token at one time. **Rule result**: one rule's hit/clear/unknown.
- **Completeness**: share of enabled rules that were not `unknown`.
- **Gap**: a time span where the app could not observe launches.
- **Decision**: a pre-registered plan to enter (paper or real). **Fill**: an actual or simulated execution.
- **Account**: `paper` or `real`.
