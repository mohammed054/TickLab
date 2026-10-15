# Phase 0 — Verified provider fields

**Status:** NOT VERIFIED. A field is verified only when its real response fixture is saved, dated, and checked. Synthetic fixtures do not count.

## Launch and pool response

| Canonical field | Provider JSON path | Present? | Null/unknown behavior | Fixture |
|---|---|---|---|---|
| launch/pool address | TODO | TODO | TODO | TODO |
| token mint/address | TODO | TODO | TODO | TODO |
| venue/DEX | TODO | TODO | TODO | TODO |
| quote mint/symbol | TODO | TODO | TODO | TODO |
| pool creation time | TODO | TODO | TODO | TODO |
| first-seen response metadata | TODO | TODO | TODO | TODO |
| price USD | TODO | TODO | TODO | TODO |
| liquidity USD/reserves | TODO | TODO | TODO | TODO |
| FDV/market cap semantics | TODO | TODO | TODO | TODO |
| volume/trade/buy/sell windows | TODO | TODO | TODO | TODO |
| metadata/social links | TODO | TODO | TODO | TODO |

## Trade and candle response

| Canonical field | Provider JSON path | Present? | Timestamp meaning | Fixture |
|---|---|---|---|---|
| transaction/signature | TODO | TODO | TODO | TODO |
| event timestamp/slot | TODO | TODO | TODO | TODO |
| base/quote token and amount | TODO | TODO | TODO | TODO |
| buy/sell side | TODO | TODO | TODO | TODO |
| wallet/trader | TODO | TODO | TODO | TODO |
| price USD | TODO | TODO | TODO | TODO |
| OHLCV values and interval | TODO | TODO | TODO | TODO |

## Coverage evidence

- Maximum page/cursor observed: TODO
- Records/pools per page: TODO
- Supported venues in the tested window: TODO
- Known missing venues/fields: TODO
- Provider event-time to response/available-time delay: TODO
- History start/end per endpoint: TODO
- Failed/dead token examples tested: TODO
- Exact fixture directory and capture date: TODO

Do not change normalizers from guessed field paths. If the real provider shape differs from the previous specification, report the evidence and request Planner review.
