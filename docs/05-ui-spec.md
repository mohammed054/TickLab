# 05 — UI Spec (dark, dense trading terminal)

All sizes in CSS px at 100% zoom. Use the default Windows window frame (no custom title bar).
Content sizes below are the window **content area**. Implement tokens as CSS variables in `styles/tokens.css`.

## 5.1 Design tokens

```css
:root{
 --bg-0:#0B0E11; --bg-1:#11151A; --bg-2:#171C22; --bg-3:#1E252C;
 --border:#232B33; --border-strong:#2F3A44;
 --text-1:#E6EAEE; --text-2:#9AA6B2; --text-3:#66727E;
 --accent:#3BA3FF; --good:#2EBD85; --warn:#F0B90B; --bad:#F6465D; --info:#8B7CF6;
 --band-low:#2EBD85; --band-medium:#F0B90B; --band-high:#FF8A3D; --band-extreme:#F6465D; --band-lowdata:#66727E;
 --font-ui:'Inter',system-ui,sans-serif; --font-mono:'JetBrains Mono',ui-monospace,monospace;
 --r-sm:2px; --r-md:4px;
 --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s6:24px;
}
```
Type scale (px / line-height / weight): table body 12/16/400 · meta 11/16/400 · body 13/18/400 · section title 14/20/600 · big number 20/24/600 · score 11/16/700 mono.
Numbers: `font-variant-numeric: tabular-nums`, right-aligned in tables. Addresses and numbers use `--font-mono`.
Borders 1px `--border`. Radius `--r-sm` for inputs/chips/buttons, `--r-md` for panels. No shadows except modals/toasts: `0 8px 24px rgba(0,0,0,.5)`.
Focus ring: `outline:2px solid var(--accent); outline-offset:1px`. Icons: lucide 16px, stroke 1.5. Scrollbars: 8px wide, thumb `--border-strong`.
Body background `--bg-0`; panels `--bg-1`; hover `--bg-2`; selected `--bg-3`. Contrast of text on backgrounds must be >= 4.5:1 (text-3 only for non-essential meta).

## 5.2 Formatting (`shared/format.ts`, unit-tested)

- `fmtUsd(v)`: null -> `—`; `>=1e9` -> `$1.23B`; `>=1e6` -> `$1.23M`; `>=1e3` -> `$12.3K`; `>=1` -> `$12.34`; `<1` -> see `fmtPrice`.
- `fmtPrice(v)`: null -> `—`; `>=1` -> 2 decimals; `>=0.01` -> 4 decimals; `<0.01` -> 4 significant digits, no exponent (`toFixed(min(12, 3 - floor(log10(v))))`).
- `fmtPct(v)`: null -> `—`; one decimal, explicit sign for changes (`+4.2%`, `-12.0%`); colored `--good`/`--bad`, zero `--text-2`.
- `fmtAge(ms)`: `<60s` -> `45s`; `<1h` -> `4m 05s`; `<24h` -> `2h 14m`; else `3d 4h`.
- `fmtAddr(a)`: first 4 + `…` + last 4 (`7xKf…9aQp`); full on hover tooltip; click copies, toast "Copied".
- `fmtCompleteness(x)`: `72%`. Dates: `HH:mm:ss` today, else `DD MMM HH:mm`, 24-hour clock.

## 5.3 Components (`renderer/components`) — exact sizes

| Component | Spec |
|---|---|
| Button | height 28, padding 0 12, font 12/600, radius 2. Variants: primary (bg `--accent`, text #06121F), secondary (bg `--bg-3`, border `--border-strong`), ghost (transparent), danger (bg `--bad`). Disabled opacity .4, cursor not-allowed. Icon-only: 28x28. |
| Input / Select | height 28, bg `--bg-3`, border `--border`, padding 0 8, font 12; focus: border `--accent`. Number inputs mono, right-aligned. |
| Toggle | 28x16 track, 12px knob, on = `--accent`. |
| Chip | height 18, padding 0 6, font 11, radius 2, bg = color @16% alpha, text = color. |
| ScoreChip | 40x18 chip showing score (mono 11/700) colored by band; right of it band text 11px (`LOW`, `MEDIUM`...). Low data: grey (`--band-lowdata`), band text with `?` suffix, 1px dashed border. |
| Table | header 28px (bg `--bg-1`, 11px uppercase `--text-3`, sticky, bottom border), rows 24px, hover `--bg-2`, selected `--bg-3` + 2px `--accent` left border. Virtualized with `@tanstack/react-virtual` (overscan 10). |
| Tabs | height 32, item padding 0 12, 12px/600, active: text `--text-1` + 2px bottom `--accent`; inactive `--text-2`. |
| Modal | centered, bg `--bg-1`, border `--border-strong`, radius 4, padding 16, backdrop rgba(0,0,0,.6), width as specified, Esc closes, focus trapped. |
| Toast | 320px wide, bg `--bg-2`, border-left 3px (type color), padding 8 12, 12px text, top-right at 12px from edges, 8px gap, max 3 visible, auto-dismiss 5000 ms, hover pauses, click = open token in Detail. |
| Tooltip | bg `--bg-3`, border `--border-strong`, padding 4 8, 11px, max-width 280, delay 300 ms. |
| Spinner | 14px ring, 2px stroke `--accent`. |
| Stat card | 120x64, bg `--bg-1`, border, padding 8; label 11px `--text-3`; value 16/600 mono; optional sub-line 11px. |
| Glossary term | dotted underline `--text-3`; tooltip shows definition from `shared/glossary.ts`. |

## 5.4 Routes

HashRouter. **Feed window** loads `#/feed`. **Detail window** loads `#/detail` (empty state until a token is selected) and `#/detail/:tokenId`.
Feed-window screens (sidebar order): `#/feed`, `#/watchlist`, `#/journal`, `#/lab`, `#/health`, `#/settings`.
Unknown route -> redirect to `#/feed`. Keyboard: `Ctrl+1..6` = those screens, `Ctrl+K` focus search, `Ctrl+,` Settings, `F5` poll now, `Esc` close modal.

## 5.5 Feed window — shell (default content 1440x900, min 1100x680)

```
x=0      48                                                               W
y=0  ┌──┬────────────────────────────────────────────────────────────────┐
     │  │ TOP BAR 40px: [Title 14/600] [Search 320x28] ....... [Src][Equity][Risk][Bell]│
 40  │S ├──────────┬─────────────────────────────────────────────────────┤
     │I │ FILTER   │ TABLE header 28px                                    │
     │D │ RAIL     │ rows 24px each, virtualized                          │
     │E │ 240px    │                                                      │
     │B │          │                                                      │
     │A │          │                                                      │
     │R │          │                                                      │
 H-24├──┴──────────┴─────────────────────────────────────────────────────┤
     │ STATUS BAR 24px                                                    │
     └────────────────────────────────────────────────────────────────────┘
```
- **Sidebar** 48 wide, bg `--bg-1`, right border. Items 40x40, icon 20px centered (lucide: Radar=Feed, Star=Watchlist, BookOpen=Journal, FlaskConical=Lab, Activity=Health, Settings). Active: bg `--bg-2` + 2px `--accent` left bar. Tooltip with name + shortcut. Bell badge handled in top bar.
- **Top bar** 40 high, bg `--bg-1`, bottom border. Left padding 12: screen title. Search input 320x28 centered-left (placeholder "Search symbol, mint or pool  (Ctrl+K)"). Right cluster, 8px gaps: **Source pill** (height 20: dot 6px + `GeckoTerminal LIVE 3s`), **Equity chip** (`Paper $203.40 · Real $200.00`, mono 11px), **Risk chip** (`ACTIVE` green / `PAUSED` red; click -> Journal), **Bell** (icon-only 28x28, red badge 14px with unseen count; click opens a 360px-wide popover list of alerts, newest first, max 50, "Mark all seen").
- **Status bar** 24 high, bg `--bg-1`, top border, 11px `--text-2`, items separated by 1px dividers, padding 0 12:
  `GT ● LIVE 3s` · `RPC ● OK` · `Gaps 0` · `Tracked 28 · Deep 1` · `API 14/24 per min` · `RPC credits 212K/1M` · (right aligned) `DB 84 MB` · `v1.0.0`.
  Dot colors: LIVE green, DELAYED amber, STALE/OFFLINE red. Click any item -> `#/health`.

## 5.6 Feed screen (`#/feed`)

**Filter rail** (240 wide, bg `--bg-1`, right border, padding 12, vertical gap 16, scrolls). Each section: title 11px uppercase `--text-3`, controls below with 8px gap.
1. *Age* — chips (28 high): `<5m` `<15m` `<1h` `<6h` `<24h` `All` (single select, default `<6h`).
2. *Min liquidity* — number input ($, default 0) + quick chips `$1K` `$5K` `$25K`.
3. *Risk band* — 4 checkboxes with ScoreChip colors, default all on.
4. *Min data completeness* — Select: Any / ≥25% / ≥50% / ≥75% (default Any).
5. *DEX* — checkbox list from distinct `dex` values in the table (max 8 + "Other").
6. *Toggles* — `Watchlist only`, `Hide LOW DATA`, `Alerts only`.
7. Footer: `Reset filters` (secondary, full width) pinned at bottom.

**Table columns** (px; header label · alignment):
`Age 64 (R)` · `Token 180 (L: symbol 12/600 + name 11 text-2 truncated; leading 14px identicon)` · `DEX 88 (L)` · `Risk 96 (L: ScoreChip + band)` ·
`Data 56 (R)` · `Price 96 (R)` · `Liq 88 (R)` · `FDV 88 (R)` · `Vol 1h 88 (R)` · `B/S 5m 84 (R: "12/5")` · `Buyers 1h 64 (R)` · `Δ5m 64 (R)` · `Flags (flex, min 160; up to 4 icon chips 16x16 for HIT rules, tooltip = rule name + points)` · `★ 32 (C)`.
Flag icons (lucide): R01 ShieldAlert · R02 Snowflake · R03 PieChart · R04 PieChart · R05 Repeat · R06 Zap · R07 Link2 · R08 DoorClosed · R09 Droplets · R10 TrendingDown · R11 Users. Badge `LATE` (chip, grey) next to Age when the launch was backfilled late.
Default sort: Age ascending (newest first). Click header toggles asc/desc, shows 8px caret. Sortable: all except Flags/★.
Row click selects (+ `detail:select` with 150 ms debounce). Double click or `Enter` focuses the Detail window. Right click: context menu (Add/Remove watchlist · Open in Detail · Copy mint · Open on GeckoTerminal · New paper decision).
New-row animation: background `rgba(59,163,255,.15)` fading to transparent over 1200 ms. Max rows loaded `ui.feedMaxRows`. Live updates arrive in 1 s batches; scroll position must NOT jump when rows insert above (keep the selected row in place if the user has scrolled > 0).
Keyboard in table: `↑/↓` move selection, `PageUp/Down` ±10, `Home/End`, `W` watchlist toggle, `P` new paper decision, `/` focus search, `R` reset filters.
Empty states (centered in the table area, 13px `--text-2`): no data yet -> Spinner + "Waiting for the first poll…"; offline -> "Can't reach GeckoTerminal. Showing saved data." (banner 28px amber across the top of the table, table still shows rows); filters hide all -> "No launches match these filters." + `Reset filters` button.
Top of table (above header) shows a 28px summary strip: `412 launches · 28 tracked · 6 alerts today` and, if any gap in the last 24 h, an amber chip `Gaps 1` (click -> Health).

## 5.7 Detail window (default content 1180x900, min 900x640)

```
┌ HEADER 56px ────────────────────────────────────────────────────────────────┐
│ [icon 28] SYMBOL 20/600  name 13 text-2   mint 7xKf…9aQp [copy]     [ScoreChip big] [★] [↗] [Paper decision] [Ask AI] │
├ TABS 32px: Overview | Evidence | Trades | Holders | Chart | Journal | AI ─────┤
│ content area (scrolls), padding 16                                             │
└────────────────────────────────────────────────────────────────────────────────┘
```
Header: bg `--bg-1`, bottom border, padding 0 16. Right cluster: big score `Risk 38 MEDIUM · Data 72%` (ScoreChip 56x24, 20px mono), `★` icon button, `↗` icon button (opens GeckoTerminal pool page via `app:openExternal`), `Paper decision` secondary button (opens modal 5.9), `Ask AI` primary button (switches to AI tab).
Empty state (`#/detail` no token): centered "Select a launch in the Feed window." 13px `--text-2`.
The window title shows `SYMBOL — TickLab Radar`. A `Pin` toggle (icon, header) stops the window following Feed selection.

**Overview tab** — CSS grid, columns `3fr 2fr`, gap 16:
- Left column: (a) stat-card grid, 3 columns x 2 rows, gap 8: Price · Liquidity · FDV · Vol 1h · Buyers 1h · Age (each card shows latest snapshot value and `as of {time}`; stale (>3 min old) values get an amber clock icon).
  (b) *Flags* panel (title "Risk flags"): one row per HIT rule, height 28: severity dot (points>=20 red, 10-19 amber, <10 grey), rule name 12/600, one-line evidence 11 `--text-2`, points `+25` right. Below, collapsed section "Unknown (data missing)" listing unknown rules in grey. If no hits: "No rules triggered. This does not mean the token is safe."
- Right column: (a) mini price line chart 100% x 200px (lightweight-charts line series from snapshots, last 2 h); (b) *Exit estimate* panel: size input (default `judge.defaultPositionUsd`), outputs `Estimated price impact 1.8%` and `You would receive ≈ $9.52 (estimate)`, with the glossary term "price impact"; footnote "Approximation from pool liquidity. Real fills differ."

**Evidence tab**: table (full width) of ALL rules: `Rule ID 160 · Name 220 · Status 80 (chip HIT/CLEAR/UNKNOWN) · Points 64 · Evidence (flex; monospace 11px, JSON pretty-printed, wrap) · Data time 120`. Row height auto (min 24). Above it: `Rules v1 · computed 12:04:11 · inputs hash a1b2c3…`.

**Trades tab**: summary strip (28px): `Unique buyers 31 · Buys 74 / Sells 40 · Last trade 12 s ago`; filter: `Min $` input (width 80). Table: `Time 88 · Side 56 (chip BUY green/SELL red) · USD 88 (R) · Price 96 (R) · Tokens 110 (R) · Wallet 110 (mono, click copies) · Tx 64 (link icon -> solscan)` . Limit 300 rows. If trades not available (older than source window): "Trades older than 24 h are not available from the free source."

**Holders tab**: summary cards (Top wallet %, Top 10 wallets %, In programs %, Burned %). Table top 20: `# 40 · Owner 130 (mono) · Class 90 (chip wallet/program/burn) · % of supply 80 (R) · bar 160 (inline bar 120x8, fill --accent, program rows grey)`. Footer `Observed 12:01:44 (refreshes every 10 min while open)`.

**Chart tab**: toolbar 32px: timeframe segmented `1m 5m 15m` (default 5m). Candlestick chart fills width, height 70% of remaining; volume histogram below 25%; dark theme: background `--bg-1`, grid `--border`, up `--good`, down `--bad`, crosshair `--text-3`. Loads via `detail:candles` (priority 0). If < 5 candles: "Not enough history yet."

**Journal tab**: this token's decisions + fills (same columns as Journal screen, filtered). Button `New paper decision`.

**AI tab**: see 06 section 6.6 for behaviour. Layout: top row of 3 preset buttons (secondary, 28 high): `Explain this launch simply` · `What are the biggest risks?` · `What should a beginner check next?`. Below: free-text Input (500 chars max, counter 11px) + `Ask` button. Output panel (bg `--bg-1`, border, padding 12, 13/18 text, markdown limited to paragraphs, bold, bullets). Footer 11px `--text-3`: `AI can be wrong and cannot see the future. Not financial advice. Free requests left today: 37`. Loading: Spinner + "Thinking…". Errors in a `--bad` bordered box with `Retry`.

## 5.8 Other Feed-window screens

**Watchlist (`#/watchlist`)**: same table as Feed restricted to watchlist; extra column `Note 240 (editable on click, saves on blur/Enter, max 200 chars)`; no filter rail (a single search box at top).

**Journal (`#/journal`)**:
- Account switch (segmented `Paper | Real`) at top-left, 28 high. Summary row of 6 stat cards (120x64): `Equity` · `Realized PnL` · `Win rate (n)` · `Open exposure` · `Drawdown from peak` · `Risk state`.
- Risk state panel (full width, 56 high, bg `--bg-1`): green `ACTIVE — max position $10.00, open 1/3` or red `PAUSED — {reason}` + button `I reviewed this` (enabled only when the pause rule allows an ack, see 06).
- Tabs: `Open | Closed | Pending | Equity`. Tables: Decisions: `Created 110 · Token 150 · Size 80 · Entry 90 · Exit 90 · PnL $ 80 · PnL % 70 · Score@entry 80 · Status 80 · Thesis (flex, truncated)`. Row click -> drawer (right side, 420 wide) with full decision, fills, notes, and buttons `Record entry fill`, `Record exit fill`, `Cancel decision`, `Add note`.
- `Equity` tab: line chart (equity after each closed decision) 100% x 260px + table of equity events + `Add deposit/withdrawal` button (modal 400 wide: kind, amount, note).
- Buttons top-right: `New decision` (primary), `Export CSV`.
- Real account only: panel `Imported wallet trades` listing `unlinked_trades` (Time · Side · Token · SOL · USD · `Link to decision ▾` · `Dismiss`).

**Rules Lab (`#/lab`)**: left panel 320 wide (form): Rules config select, Alert rule (5 inputs), Size, Horizons (checkboxes 1h/4h/24h), Fee %, Network fee $, Date range, Seed, Missing-data mode (segmented), buttons `Run`, `Freeze this config`.
Right: header strip with the VERDICT chip (28 high, grey for `EDGE NOT PROVEN`, blue for `EDGE SIGNAL (needs forward paper test)`), results table (rows: Alerts / Baseline ALL / Baseline RANDOM; columns n, mean %, 95% CI, median, p10, worst, win rate, rugged %, unknown %), histogram (SVG 100% x 200px) for the selected set, and a "Data quality" box: excluded for gaps, < 3 snapshots, most-unknown rules. A note in 12px `--text-2`: `Past replay with assumed costs. Not a forecast.`

**Data Health (`#/health`)**: 4 stat cards per source (state, last OK, calls today, errors today); budget bars (height 8): GT calls last minute / cap, RPC credits month / budget, AI requests today / limit; Gaps table (`Start · End · Duration · Reason · Source`); Errors list (last 100: time, source, code, message); buttons `Run backfill now`, `Export diagnostics`; adaptive-interval multiplier shown as `Snapshot interval x1.0`.

**Settings (`#/settings`)**: single column, max width 720, sections with 16px titles and 12px help text: Data sources (RPC URL, RPC key [secret, shows `•••• saved`], GT cap), Tracking filter numbers, Alerts numbers, Costs assumptions, Risk limits (note: "Loosening a limit takes 24 hours to apply."; pending changes listed with their effective time), AI (OpenRouter key, model multi-select max 3, daily limit number), Wallet (address, `Sync now`, last sync time; text "Read-only. This app never asks for keys."), Storage (DB size, retention days, `Backup now`, `Open data folder`), About (version, links). Each secret field: password input + `Save`; value never read back into the UI.

## 5.9 New decision modal (560 wide, auto height, padding 16)

Fields (label 11px `--text-3` above control, 12px gap): Token (read-only: symbol + score chip) · Account (segmented Paper/Real) · Size USD (number; default and MAX = risk engine's max; inline text `Max $10.00 (5% of $200.00)`) ·
Stop rule (Select: `Exit if liquidity falls 50%` / `Exit if price falls 30%` / `Time stop: exit after 1 hour` / `Custom` -> text) · Target rule (Select: `Take profit at +50%` / `Take profit at +100%` / `Time stop: exit after 4 hours` / `Custom`) ·
Thesis (textarea 80 high, min 20 chars, counter) · Checkbox `I read the risk flags above` (required) · a read-only flags summary list (hit rules, max 5 rows).
Buttons right-aligned: `Cancel` (ghost), `Record decision` (primary; disabled until valid or if risk state PAUSED; if PAUSED show the reason in `--bad` above the buttons).
After submit: paper -> immediate simulated entry fill (06 section 6.4) and toast `Paper entry recorded at $0.00012 (est.)`; real -> drawer opens to `Record entry fill`.

## 5.10 Copy rules (UI text)

Banned words/phrases anywhere in UI strings: "guaranteed", "profit target", "easy money", "can't lose", "moon", "buy now", "sure thing".
Disclaimers: Feed footer none; Alerts text as in 04; AI footer as in 5.7; Lab note as in 5.8.
