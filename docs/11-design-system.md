# 11 — Design System

Location: `frontend/src/shared/design-system/` (tokens as CSS custom properties +
a small set of primitive React components). Every feature component
(`docs/07`, `docs/08`) consumes these tokens/primitives rather than hardcoding
colors, spacing, or type styles inline.

## 11.1 Color System

Restrained, professional palette. Semantic tokens, not literal color names, so a
future theme adjustment never requires touching feature code:

```css
--color-positive       /* green — positive P&L, buy side, healthy status */
--color-negative       /* red — negative P&L, sell side, danger/breach */
--color-warning        /* yellow — pending, approaching a limit, degraded state */
--color-info           /* blue — analysis/informational elements, AI-assistant accents */
--color-neutral        /* grey — neutral/inactive elements */
--color-bg-base        /* very dark neutral background */
--color-bg-panel        /* slightly lighter than base, for panel surfaces */
--color-border-subtle   /* low-contrast borders/dividers */
--color-text-primary    /* high-contrast primary text */
--color-text-secondary  /* muted secondary text/labels */
```

Rules:
- **No color-intensity-as-magnitude gradients.** A −$50,000 P&L and a −$5 P&L use
  the same `--color-negative` red — magnitude is communicated through the number
  and typography (§11.3), never through a deeper/brighter shade implying "more
  danger." This keeps the palette calm and prevents the casino-like effect the
  product brief explicitly rules out.
- **Connection/status dots** (used in the Global Header, Strategy Panel, Data
  Quality panel, etc.) use exactly three states: `--color-positive` (connected/
  healthy), `--color-warning` (degraded/reconnecting), `--color-negative`
  (disconnected/failed) — never a fourth ad hoc color.
- **Warning treatment** (used for risk-limit breaches, `docs/07-main-monitor-components.md`
  §7.14; unreconciled P&L-attribution residuals, `docs/09-analytics-and-investigation-suite.md`
  §9.4; latency-budget gaps, `docs/09` §9.9): two-stage — `--color-warning`
  background/border tint when *approaching* a threshold (configurable, typically
  80% of limit), `--color-negative` when *breached*. Always paired with a text
  label, never color alone (accessibility + the "never rely on color alone"
  principle carried over from the product's chart-tooling conventions).
- Do not introduce neon/cyberpunk tones, glow effects, or gradients beyond subtle
  panel-elevation shading.

## 11.2 Dark Mode

Default and, for Phase 1–3, only theme. `--color-bg-base` is a very dark neutral
(not pure black — pure black adjacent to bright chart lines causes visual ringing).
Panels use `--color-bg-panel`, a step lighter, with `--color-border-subtle` hairline
borders — never heavy drop shadows or glassmorphism/blur effects. Grid lines on
charts use a low-opacity variant of `--color-border-subtle`.

## 11.3 Typography

- A single, highly legible sans-serif for UI text; a **tabular-numeral** font
  variant (or `font-variant-numeric: tabular-nums`) mandatorily applied to every
  price, quantity, timestamp, statistic, and P&L figure, so columns of numbers
  align precisely — this is not optional polish, it's required for the ladder
  (`docs/07` §7.3), tables, and any numeric column anywhere in the product.
- Type scale: a small, fixed set of sizes (e.g., `--font-size-xs` through
  `--font-size-xl`) — panels should default to compact/dense sizing
  (`--font-size-sm`/`xs`) per §11.9, reserving larger sizes for the Global Header's
  primary price and section headings only.

## 11.4 Order Book / Ladder Visual Conventions

The mid/spread divider row (`docs/07-main-monitor-components.md` §7.3) is rendered
with a full-width horizontal rule using `--color-border-subtle` at higher opacity
than ordinary row dividers, plus a centered label showing the spread value — this
must remain visible and legible even at the densest depth-level setting (100
levels, `docs/07` §7.5). Liquidity bars use a single neutral fill hue per side (bid
side and ask side each get a fixed, low-saturation tint — not `--color-positive`/
`--color-negative` directly, to avoid visually conflating "bid/ask" with "good/bad")
with opacity/width scaled by size, per `docs/07` §7.3's `maxVisibleSizeInCurrentView`
normalization.

## 11.5 Order & Fill Lifecycle State Styling

The seven order states referenced throughout `docs/07-main-monitor-components.md`
§7.12 and `docs/08-secondary-monitor-components.md` map to a fixed visual language,
applied consistently everywhere an order/fill appears (ladder, chart overlay,
event inspector, fill analysis):

| State | Treatment |
|---|---|
| `submitted` | Dashed outline, `--color-neutral` |
| `working` | Solid outline, `--color-info` |
| `partial_fill` | Solid outline, `--color-info`, partially filled progress indicator (e.g., a fill-proportion bar within the row) |
| `filled` | Solid fill, `--color-positive` or `--color-negative` matching buy/sell, brief (≤400ms) transition animation on the state change so a fill is noticeable without being distracting |
| `cancelled` | Struck-through / reduced opacity, `--color-neutral` |
| `rejected` | Solid outline, `--color-negative`, with an attached tooltip reason (never a bare red mark with no explanation) |
| `expired` | Reduced opacity, `--color-neutral`, distinct from `cancelled` via label text since the visual treatment is otherwise similar |

## 11.6 Sparklines and Small Multiples

Used throughout for compact trend context (Order Flow Panel readouts,
`docs/07-main-monitor-components.md` §7.8; Inventory history, §7.13; Execution
Monitor's latency graph, §7.15). Rules: no axis labels/gridlines on sparklines
(they are context, not analysis — clicking one opens the full analytical view in
`docs/09-analytics-and-investigation-suite.md` for actual axis-labeled analysis),
single-color line matching the metric's semantic color where one applies (e.g., a
P&L sparkline uses `--color-positive`/`--color-negative` segments), fixed minimal
height (defined as a token, `--sparkline-height`, so panel rows stay visually
uniform).

## 11.7 Form Controls and Inline Help

Every configurable field (strategy parameters, `docs/08-secondary-monitor-components.md`
§8.6; execution model, §8.7; risk limits, `docs/12-execution-modes-and-risk.md`
§12.5) uses the shared primitive set: `SliderField`, `NumericField` (with
min/max/step enforcement and a visible unit suffix), `SelectField`, `PresetChips`,
and a `ResetToDefaultButton`. Every field must render its `description` as inline
help — a small `(?)` affordance opening a tooltip/popover on hover/focus, never a
separate help page — and a field with no description string is treated as an
incomplete spec, not shipped silently blank.

## 11.8 Badges and Attribution Markers

A small, consistent badge component (`AttributionBadge`) distinguishes
AI-originated content from human-originated content wherever both can appear:
AI-authored research notes (`docs/10-experiment-management-and-ai-research.md`
§10.4), AI-generated strategy code before human review (`docs/10` §10.5.3). Visual
treatment: a compact label (e.g., "AI") in `--color-info`, never styled to look
identical to a human/system-verified marker — this is a trust/attribution signal,
not decoration, and must never be omitted for AI-originated content.

## 11.9 Information Density

The product is dense but never cluttered:
- Prefer compact panels, tables, mini charts, heatmaps, sparklines (§11.6),
  expandable rows, and detail-on-demand (click/hover to expand) over large single-
  metric cards. A panel showing one number in a large card, alone, is almost always
  wrong for this product — pack related figures into grouped, labeled clusters
  instead (see `docs/07-main-monitor-components.md` §7.11's Strategy Monitor for the
  reference pattern: many related numbers, clearly labeled, in one compact panel).
- Tables default to the densest row height that keeps tabular numerals (§11.3)
  legible; a "comfortable" density toggle may exist as a user preference but dense
  is the default, matching a professional trading-terminal expectation rather than
  a consumer-app expectation.

## 11.10 Component Primitives

Base primitives implemented once in `frontend/src/shared/design-system/` and reused
everywhere (do not reimplement any of these per-feature):

`Panel`, `PanelHeader`, `StatusDot`, `MetricRow` (label + value + optional
sparkline), `DataTable` (virtualized, per
`docs/03-tech-stack-and-repo-structure.md` §3.6), `Tabs`, `SegmentedControl`,
`SliderField`, `NumericField`, `SelectField`, `PresetChips`, `Tooltip`,
`AttributionBadge`, `EmptyState`, `LoadingState`, `ErrorState` (the latter three
specified functionally in `docs/14-cross-cutting-systems.md` §14.7–§14.9, styled
here).
