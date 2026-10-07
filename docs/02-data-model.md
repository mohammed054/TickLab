# 02 — Data Model (SQLite)

File: `src/main/db/migrations/001_init.sql`. DB path: `<userData>/radar.db`.
Open with: `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`, `busy_timeout=5000`.
Migrations: numbered files, applied in order inside a transaction, version in `meta('schema_version')`.
Never edit an applied migration; add `002_*.sql`.

```sql
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE settings(key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE settings_audit(
  id INTEGER PRIMARY KEY, key TEXT NOT NULL, old_json TEXT, new_json TEXT NOT NULL,
  changed_at INTEGER NOT NULL, effective_at INTEGER NOT NULL);   -- effective_at > changed_at for loosened risk limits

-- ===== market data =====
CREATE TABLE tokens(
  id INTEGER PRIMARY KEY,
  mint TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL, name TEXT NOT NULL,
  decimals INTEGER, supply REAL,
  creator_wallet TEXT, creator_derived_at INTEGER,          -- NULL creator = unknown
  mint_authority TEXT, freeze_authority TEXT,               -- NULL means revoked ONLY IF authorities_checked_at IS NOT NULL
  authorities_checked_at INTEGER,
  first_seen_at INTEGER NOT NULL);

CREATE TABLE pools(
  id INTEGER PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  token_id INTEGER NOT NULL REFERENCES tokens(id),
  quote_mint TEXT, quote_symbol TEXT, dex TEXT,
  created_at_chain INTEGER NOT NULL,                        -- pool creation time from source
  first_seen_at INTEGER NOT NULL,
  source TEXT NOT NULL,                                     -- 'geckoterminal'
  tier INTEGER NOT NULL DEFAULT 1,                          -- 1 discovered, 2 tracked
  tracked_since INTEGER, tracked_until INTEGER,
  last_snapshot_at INTEGER);
CREATE INDEX idx_pools_token ON pools(token_id);
CREATE INDEX idx_pools_created ON pools(created_at_chain DESC);
CREATE INDEX idx_pools_tier ON pools(tier, tracked_until);

CREATE TABLE pool_snapshots(
  id INTEGER PRIMARY KEY,
  pool_id INTEGER NOT NULL REFERENCES pools(id),
  observed_at INTEGER NOT NULL,
  price_usd REAL, liquidity_usd REAL, fdv_usd REAL, mcap_usd REAL,
  vol_m5 REAL, vol_h1 REAL, vol_h24 REAL,
  buys_m5 INTEGER, sells_m5 INTEGER, buyers_m5 INTEGER, sellers_m5 INTEGER,
  buys_h1 INTEGER, sells_h1 INTEGER, buyers_h1 INTEGER, sellers_h1 INTEGER,
  chg_m5 REAL, chg_h1 REAL,
  source TEXT NOT NULL);
CREATE INDEX idx_snap_pool_time ON pool_snapshots(pool_id, observed_at);

CREATE TABLE trades(
  id INTEGER PRIMARY KEY,
  pool_id INTEGER NOT NULL REFERENCES pools(id),
  tx_sig TEXT NOT NULL, block_time INTEGER NOT NULL, slot INTEGER,
  side TEXT NOT NULL CHECK(side IN('buy','sell')),
  wallet TEXT NOT NULL, usd_value REAL, token_amount REAL, price_usd REAL,
  observed_at INTEGER NOT NULL,
  UNIQUE(pool_id, tx_sig, side, wallet));
CREATE INDEX idx_trades_pool_time ON trades(pool_id, block_time);

CREATE TABLE holder_snapshots(
  id INTEGER PRIMARY KEY, token_id INTEGER NOT NULL REFERENCES tokens(id),
  observed_at INTEGER NOT NULL, supply REAL,
  top1_pct REAL, top10_pct REAL,             -- wallets only (programs/burn excluded), % of supply
  programs_pct REAL, burned_pct REAL,
  rows_json TEXT NOT NULL);                  -- [{address,owner,pct,class:'wallet'|'program'|'burn'}]
CREATE INDEX idx_holders_token ON holder_snapshots(token_id, observed_at);

CREATE TABLE wallet_links(                   -- funding evidence for R07
  id INTEGER PRIMARY KEY, token_id INTEGER NOT NULL REFERENCES tokens(id),
  wallet TEXT NOT NULL, funder TEXT, evidence_json TEXT, observed_at INTEGER NOT NULL);
CREATE INDEX idx_links_token ON wallet_links(token_id);

-- ===== judging (derived data; rows referenced by a decision/alert are never deleted) =====
CREATE TABLE judgements(
  id INTEGER PRIMARY KEY, token_id INTEGER NOT NULL REFERENCES tokens(id),
  pool_id INTEGER NOT NULL REFERENCES pools(id),
  rules_version TEXT NOT NULL, computed_at INTEGER NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
  band TEXT NOT NULL CHECK(band IN('LOW','MEDIUM','HIGH','EXTREME')),
  completeness REAL NOT NULL, inputs_hash TEXT NOT NULL);
CREATE INDEX idx_judg_token ON judgements(token_id, computed_at);
CREATE TABLE rule_results(
  id INTEGER PRIMARY KEY, judgement_id INTEGER NOT NULL REFERENCES judgements(id),
  rule_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('hit','clear','unknown')),
  points INTEGER NOT NULL, evidence_json TEXT NOT NULL);
CREATE INDEX idx_rr_j ON rule_results(judgement_id);

CREATE TABLE rule_configs(                   -- frozen configs (append-only)
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, config_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE, frozen_at INTEGER NOT NULL);
CREATE TABLE lab_runs(
  id INTEGER PRIMARY KEY, config_id INTEGER REFERENCES rule_configs(id),
  params_json TEXT NOT NULL, run_at INTEGER NOT NULL, result_json TEXT NOT NULL);

-- ===== operations =====
CREATE TABLE gaps(
  id INTEGER PRIMARY KEY, source TEXT NOT NULL,
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, reason TEXT NOT NULL,  -- 'app_closed'|'backfill_cap'|'outage'|'rate_limited'
  resolved INTEGER NOT NULL DEFAULT 0);
CREATE TABLE api_usage(
  id INTEGER PRIMARY KEY, source TEXT NOT NULL, day TEXT NOT NULL,          -- 'YYYY-MM-DD' local
  calls INTEGER NOT NULL DEFAULT 0, credits REAL NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0, UNIQUE(source, day));
CREATE TABLE jobs_state(
  name TEXT PRIMARY KEY, last_run_at INTEGER, last_ok_at INTEGER, last_error TEXT, cursor_json TEXT);
CREATE TABLE error_log(
  id INTEGER PRIMARY KEY, at INTEGER NOT NULL, source TEXT NOT NULL, code TEXT NOT NULL, message TEXT NOT NULL);
CREATE TABLE watchlist(token_id INTEGER PRIMARY KEY REFERENCES tokens(id), added_at INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '');
CREATE TABLE alerts(
  id INTEGER PRIMARY KEY, token_id INTEGER NOT NULL REFERENCES tokens(id),
  judgement_id INTEGER REFERENCES judgements(id), created_at INTEGER NOT NULL,
  kind TEXT NOT NULL, text TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0,
  UNIQUE(token_id, kind));                    -- one alert per token per kind

-- ===== journal (append-only except where noted) =====
CREATE TABLE decisions(
  id INTEGER PRIMARY KEY,
  account TEXT NOT NULL CHECK(account IN('paper','real')),
  token_id INTEGER NOT NULL REFERENCES tokens(id), pool_id INTEGER NOT NULL REFERENCES pools(id),
  created_at INTEGER NOT NULL,
  size_usd REAL NOT NULL CHECK(size_usd > 0),
  planned_entry_price REAL, stop_rule TEXT NOT NULL, target_rule TEXT NOT NULL,
  thesis TEXT NOT NULL CHECK(length(thesis) >= 20),
  judgement_id INTEGER NOT NULL REFERENCES judgements(id),
  equity_before REAL NOT NULL, risk_state_json TEXT NOT NULL);
CREATE TABLE fills(
  id INTEGER PRIMARY KEY, decision_id INTEGER NOT NULL REFERENCES decisions(id),
  kind TEXT NOT NULL CHECK(kind IN('entry','exit')),
  occurred_at INTEGER NOT NULL, price_usd REAL NOT NULL, token_amount REAL NOT NULL,
  usd_value REAL NOT NULL, fee_usd REAL NOT NULL DEFAULT 0, slippage_pct REAL,
  source TEXT NOT NULL CHECK(source IN('manual','wallet','paper_sim')),
  tx_sig TEXT, note TEXT NOT NULL DEFAULT '');
CREATE TABLE fill_voids(fill_id INTEGER PRIMARY KEY REFERENCES fills(id), voided_at INTEGER NOT NULL, reason TEXT NOT NULL);
CREATE TABLE decision_notes(
  id INTEGER PRIMARY KEY, decision_id INTEGER NOT NULL REFERENCES decisions(id),
  created_at INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN('cancel','review','note')), text TEXT NOT NULL);
CREATE TABLE equity_events(
  id INTEGER PRIMARY KEY, account TEXT NOT NULL CHECK(account IN('paper','real')),
  at INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN('deposit','withdraw','adjust')),
  amount_usd REAL NOT NULL, note TEXT NOT NULL DEFAULT '');
CREATE TABLE risk_acks(id INTEGER PRIMARY KEY, account TEXT NOT NULL, at INTEGER NOT NULL, reason TEXT NOT NULL);

CREATE TABLE sol_usd(hour_ts INTEGER PRIMARY KEY, price REAL NOT NULL);       -- hourly SOL/USD cache
CREATE TABLE unlinked_trades(                                                 -- imported wallet swaps not yet linked to a decision
  id INTEGER PRIMARY KEY, tx_sig TEXT NOT NULL UNIQUE, block_time INTEGER NOT NULL,
  mint TEXT NOT NULL, side TEXT NOT NULL CHECK(side IN('buy','sell')),
  token_amount REAL NOT NULL, sol_amount REAL NOT NULL, usd_value REAL, fee_sol REAL NOT NULL,
  linked_fill_id INTEGER REFERENCES fills(id), dismissed INTEGER NOT NULL DEFAULT 0);

-- ===== AI =====
CREATE TABLE ai_cache(
  id INTEGER PRIMARY KEY, token_id INTEGER NOT NULL, data_hash TEXT NOT NULL, question TEXT NOT NULL,
  model TEXT NOT NULL, created_at INTEGER NOT NULL, response_text TEXT NOT NULL,
  UNIQUE(token_id, data_hash, question));
CREATE TABLE ai_usage(day TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0);

-- ===== append-only enforcement =====
-- For EACH of: decisions, fills, fill_voids, decision_notes, rule_configs, equity_events, risk_acks
-- create two triggers (example for decisions; repeat with the table name changed):
CREATE TRIGGER decisions_no_update BEFORE UPDATE ON decisions BEGIN SELECT RAISE(ABORT,'append-only table'); END;
CREATE TRIGGER decisions_no_delete BEFORE DELETE ON decisions BEGIN SELECT RAISE(ABORT,'append-only table'); END;
-- Exception: unlinked_trades.linked_fill_id/dismissed may be UPDATEd (it is a work queue, not a record).

CREATE VIEW v_fills_valid AS
  SELECT f.* FROM fills f WHERE NOT EXISTS (SELECT 1 FROM fill_voids v WHERE v.fill_id = f.id);
```

## 2.1 Derived state (computed in code, never stored)

- **Decision status** (account-agnostic): `cancelled` if a `cancel` note exists; else `open` if a valid entry fill exists and no valid exit fill;
  `closed` if both exist; else `pending` (no entry yet). A `pending` decision older than 30 min is shown as `expired` (display only).
- **Realized PnL (USD)** = `exit.usd_value - exit.fee_usd - entry.usd_value - entry.fee_usd`, only for `closed`. Partial exits are NOT supported in v1 (one entry, one exit per decision).
- **Equity (account)** = sum(equity_events.amount_usd) + sum(realized PnL of closed decisions in that account) + settings start equity if no deposit event exists
  (on first run, insert a `deposit` event equal to `journal.startEquityUsd` for each account).
- **Peak equity** = max over time of equity after each equity-changing event.

## 2.2 Retention (`pipeline/retention.ts`, runs at start and every 6 h)

Delete `pool_snapshots` and `trades` older than the retention days UNLESS the token is on the watchlist or
referenced by any decision. Delete `judgements` (and their `rule_results`) older than the snapshot retention days, EXCEPT the latest per token and any referenced by `decisions` or `alerts`. Delete `error_log` older than 30 days. Never delete journal tables (they are append-only; triggers enforce it).
Run `PRAGMA optimize` after retention. Report DB size on the Health screen.
