//! Real OHLCV CSV → SMA-crossover backtest vertical slice.
//!
//! Owner-directed milestone (STATE.md [V.1]): ONE fully real end-to-end
//! backtest — real CSV, real validation, one executable SMA 20/50 strategy, a
//! real chronological simulation loop, real order generation, real fill
//! simulation with fees + slippage, real portfolio accounting, real trade and
//! equity recording, and metrics computed from those records. No mocked
//! values anywhere in this crate.
//!
//! This is a bar-level simulator, not the L2/L3 `hftbacktest` path
//! (`engine/abstraction`, Phase 2 Blocks 2.1–2.6); the two coexist. Financial
//! formulas cite `docs/09-analytics-and-investigation-suite.md` per
//! `AGENTS.md` §5.3.

use std::fmt;

// ---------------------------------------------------------------------------
// Errors — typed, no panics on fallible paths (AGENTS.md §5.1).
// ---------------------------------------------------------------------------

/// Typed error for CSV parsing/validation and backtest execution.
#[derive(Clone, Debug, PartialEq)]
pub enum OhlcvError {
    /// CSV could not be parsed at all (empty, no usable rows, bad header).
    InvalidCsv(String),
    /// A specific row failed validation (1-based data-row index included).
    BadRow { row: usize, reason: String },
    /// The backtest request itself is invalid.
    InvalidRequest(String),
}

impl fmt::Display for OhlcvError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            OhlcvError::InvalidCsv(m) => write!(f, "invalid OHLCV CSV: {m}"),
            OhlcvError::BadRow { row, reason } => write!(f, "row {row}: {reason}"),
            OhlcvError::InvalidRequest(m) => write!(f, "invalid backtest request: {m}"),
        }
    }
}

impl std::error::Error for OhlcvError {}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// One OHLCV bar. Timestamps are ns-since-epoch (`docs/15` §15.1).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OhlcvBar {
    pub timestamp_ns: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

/// Summary of a parsed dataset (validation output).
#[derive(Clone, Debug, PartialEq)]
pub struct DatasetSummary {
    /// Content-derived id: `ohlcv-<16 hex chars of a 128-bit hash of the file bytes>`.
    /// Not cryptographic (no sha2 dependency per AGENTS.md §5.5) — unique
    /// enough to address datasets locally; logged as a deviation in STATE.md.
    pub dataset_id: String,
    pub bar_count: usize,
    pub start_ns: i64,
    pub end_ns: i64,
    /// Detected bar interval in ns (median of timestamp deltas); 0 for 1 bar.
    pub interval_ns: i64,
    pub source_name: String,
}

/// SMA-crossover strategy parameters.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SmaParams {
    pub short_period: usize,
    pub long_period: usize,
}

impl Default for SmaParams {
    fn default() -> Self {
        Self { short_period: 20, long_period: 50 }
    }
}

/// Execution cost model: taker fee percent of notional + adverse slippage in
/// basis points applied to the execution price (`docs/08` §8.7 fields).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CostModel {
    /// Taker fee, percent of notional (e.g. 0.05 = 0.05%).
    pub taker_fee_pct: f64,
    /// Adverse slippage in basis points (e.g. 5 = 0.05%).
    pub slippage_bps: f64,
}

/// One recorded fill (a "trade" row for inspection).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TradeRecord {
    pub timestamp_ns: i64,
    /// "buy" | "sell"
    pub side: &'static str,
    /// Raw reference price (next bar open) BEFORE slippage.
    pub reference_price: f64,
    /// Actual fill price AFTER slippage.
    pub fill_price: f64,
    pub qty: f64,
    pub notional: f64,
    pub fee: f64,
    /// Adverse slippage cost on this fill: |fill − reference| × qty.
    pub slippage_cost: f64,
    /// Realized P&L for closing fills (None on entries).
    pub realized_pnl: Option<f64>,
    pub cash_after: f64,
    pub position_after: f64,
    /// SMA values at the signal bar that caused this order (None before the
    /// long window warmed up — no signal can fire before that).
    pub sma_short_at_signal: Option<f64>,
    pub sma_long_at_signal: Option<f64>,
}

/// Equity marked-to-market at every bar close.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EquityPoint {
    pub timestamp_ns: i64,
    pub close: f64,
    pub cash: f64,
    pub position: f64,
    pub equity: f64,
}

/// Headline metrics (`docs/15` §15.5 `HeadlineMetrics` field-for-field).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HeadlineMetrics {
    pub initial_capital: f64,
    pub final_capital: f64,
    pub net_pnl: f64,
    pub return_pct: f64,
    pub max_drawdown_pct: f64,
    pub sharpe: f64,
    pub sortino: f64,
    pub trades: u64,
    pub fill_rate_pct: f64,
    pub fees: f64,
    /// Total adverse slippage cost as % of initial capital (docs/09 §9.7).
    pub slippage_pct: f64,
}

/// Everything one real run produced.
#[derive(Clone, Debug, PartialEq)]
pub struct SmaBacktestOutput {
    pub trades: Vec<TradeRecord>,
    pub equity: Vec<EquityPoint>,
    pub orders_submitted: u64,
    pub fills: u64,
    pub headline: HeadlineMetrics,
    /// Bars actually processed inside the selected date range.
    pub bars_processed: usize,
}

// ---------------------------------------------------------------------------
// CSV parsing + validation
// ---------------------------------------------------------------------------

/// 128-bit FNV-1a over the raw text, hex-encoded: the dataset id basis.
fn content_hash(text: &str) -> String {
    // 128-bit FNV-1a parameters (36-bit prime extended per published 128-bit variant).
    let mut h1: u64 = 0x6c62272e07bb0142;
    let mut h2: u64 = 0x62c9ee36ed2b1c0a;
    for b in text.as_bytes() {
        h1 ^= u64::from(*b);
        h1 = h1.wrapping_mul(0x100000001b3);
        h2 = h2.wrapping_add(h1);
    }
    format!("{h1:016x}{h2:016x}")
}

fn normalize_header(name: &str) -> String {
    name.trim().trim_matches('"').to_ascii_lowercase().replace([' ', '_', '-'], "")
}

/// Parse one timestamp cell: numeric epoch (s/ms/us/ns auto-detected by
/// magnitude) or ISO-8601 `YYYY-MM-DD[THH:MM[:SS]][Z]` interpreted as UTC.
fn parse_timestamp(raw: &str) -> Result<i64, OhlcvError> {
    let s = raw.trim().trim_matches('"');
    if s.is_empty() {
        return Err(OhlcvError::InvalidCsv("empty timestamp".to_string()));
    }
    if let Ok(n) = s.parse::<f64>() {
        if !n.is_finite() || n < 0.0 {
            return Err(OhlcvError::InvalidCsv(format!("bad numeric timestamp {s}")));
        }
        let ns = n * 1e9;
        // Magnitude-based unit detection: a 2020s date is ~1.6e9 s, 1.6e12 ms,
        // 1.6e15 us, 1.6e18 ns. Thresholds sit between decades of magnitude.
        let v = if n >= 1e17 { n as i64 }          // already ns
        else if n >= 1e14 { (n * 1e3) as i64 }      // us
        else if n >= 1e11 { (n * 1e6) as i64 }      // ms
        else { (n * 1e9) as i64 };                  // s
        let _ = ns;
        return Ok(v);
    }
    parse_iso8601_utc(s)
}

/// Days-from-civil (Howard Hinnant's algorithm) — UTC-only, no chrono dep.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn parse_iso8601_utc(s: &str) -> Result<i64, OhlcvError> {
    let bad = || OhlcvError::InvalidCsv(format!("unsupported timestamp format {s:?}"));
    let b = s.as_bytes();
    if b.len() < 10 || b[4] != b'-' || b[7] != b'-' {
        return Err(bad());
    }
    let num = |r: std::ops::Range<usize>| -> Result<i64, OhlcvError> {
        s.get(r)
            .and_then(|p| p.parse::<i64>().ok())
            .ok_or_else(bad)
    };
    let (y, mo, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) {
        return Err(bad());
    }
    let mut ns = days_from_civil(y, mo, d) * 86_400_000_000_000;
    if b.len() > 10 {
        let rest = s.get(11..).ok_or_else(bad)?;
        // HH:MM[:SS[.frac]][Z]
        let rb = rest.as_bytes();
        if rb.len() < 5 || rb[2] != b':' {
            return Err(bad());
        }
        let (hh, mi) = (
            rest.get(0..2).and_then(|p| p.parse::<i64>().ok()).ok_or_else(bad)?,
            rest.get(3..5).and_then(|p| p.parse::<i64>().ok()).ok_or_else(bad)?,
        );
        if !(0..=23).contains(&hh) || !(0..=59).contains(&mi) {
            return Err(bad());
        }
        ns += (hh * 3_600 + mi * 60) * 1_000_000_000;
        let mut tail = &rest[5..];
        if let Some(stripped) = tail.strip_prefix(':') {
            tail = stripped;
        }
        // Optional seconds[.fraction] then optional Z / offset (offset unsupported).
        let sec_part: String = tail.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
        if !sec_part.is_empty() {
            if let Some(sec) = sec_part.parse::<f64>().ok() {
                ns += (sec * 1e9) as i64;
            }
        }
    }
    Ok(ns)
}

fn parse_f64(raw: &str) -> Result<f64, OhlcvError> {
    raw.trim()
        .trim_matches('"')
        .parse::<f64>()
        .map_err(|_| OhlcvError::InvalidCsv(format!("bad number {raw:?}")))
}

/// Parse and validate a full OHLCV CSV. Returns the bars (in file order) and
/// a content-derived summary.
///
/// Accepted layout: a header row whose normalized names contain
/// timestamp/time/date, open, high, low, close, and (optionally) volume, in
/// any order; every data row must then have those columns. Rows must be
/// strictly time-increasing; OHLC must satisfy low ≤ min(open,close) ≤
/// max(open,close) ≤ high; prices > 0; volume ≥ 0.
pub fn parse_ohlcv_csv(text: &str, source_name: &str) -> Result<(DatasetSummary, Vec<OhlcvBar>), OhlcvError> {
    let mut lines = text
        .lines()
        .map(|l| l.trim_end_matches(['\r']))
        .filter(|l| !l.trim().is_empty());
    let header_line = lines.next().ok_or_else(|| OhlcvError::InvalidCsv("empty file".to_string()))?;
    let headers: Vec<String> = header_line.split(',').map(normalize_header).collect();
    let col = |aliases: &[&str]| -> Result<usize, OhlcvError> {
        headers
            .iter()
            .position(|h| aliases.contains(&h.as_str()))
            .ok_or_else(|| {
                OhlcvError::InvalidCsv(format!(
                    "header must contain a {} column (found: {})",
                    aliases[0],
                    headers.join(", ")
                ))
            })
    };
    let c_ts = col(&["timestamp", "time", "date", "datetime", "opentime"])?;
    let c_o = col(&["open"])?;
    let c_h = col(&["high"])?;
    let c_l = col(&["low"])?;
    let c_c = col(&["close"])?;
    let c_v = col(&["volume", "vol", "v"]).unwrap_or(usize::MAX);
    let ncols = headers.len();

    let mut bars: Vec<OhlcvBar> = Vec::new();
    for (idx, line) in lines.enumerate() {
        let row_no = idx + 2; // 1-based, counting header
        let cells: Vec<&str> = line.split(',').collect();
        if cells.len() != ncols {
            return Err(OhlcvError::BadRow {
                row: row_no,
                reason: format!("expected {ncols} columns, found {}", cells.len()),
            });
        }
        let timestamp_ns = parse_timestamp(cells[c_ts]).map_err(|e| match e {
            OhlcvError::BadRow { .. } => e,
            other => OhlcvError::BadRow { row: row_no, reason: other.to_string() },
        })?;
        let open = parse_f64(cells[c_o]).map_err(|e| OhlcvError::BadRow { row: row_no, reason: e.to_string() })?;
        let high = parse_f64(cells[c_h]).map_err(|e| OhlcvError::BadRow { row: row_no, reason: e.to_string() })?;
        let low = parse_f64(cells[c_l]).map_err(|e| OhlcvError::BadRow { row: row_no, reason: e.to_string() })?;
        let close = parse_f64(cells[c_c]).map_err(|e| OhlcvError::BadRow { row: row_no, reason: e.to_string() })?;
        let volume = if c_v == usize::MAX {
            0.0
        } else {
            parse_f64(cells[c_v]).map_err(|e| OhlcvError::BadRow { row: row_no, reason: e.to_string() })?
        };
        if open <= 0.0 || high <= 0.0 || low <= 0.0 || close <= 0.0 {
            return Err(OhlcvError::BadRow { row: row_no, reason: "prices must be positive".to_string() });
        }
        if volume < 0.0 {
            return Err(OhlcvError::BadRow { row: row_no, reason: "volume must be >= 0".to_string() });
        }
        if low > open.min(close) || high < open.max(close) || low > high {
            return Err(OhlcvError::BadRow {
                row: row_no,
                reason: format!("OHLC invariant violated: o={open} h={high} l={low} c={close}"),
            });
        }
        if let Some(prev) = bars.last() {
            if timestamp_ns <= prev.timestamp_ns {
                return Err(OhlcvError::BadRow {
                    row: row_no,
                    reason: format!(
                        "timestamp {} not strictly after previous {}",
                        timestamp_ns, prev.timestamp_ns
                    ),
                });
            }
        }
        bars.push(OhlcvBar { timestamp_ns, open, high, low, close, volume });
    }
    if bars.is_empty() {
        return Err(OhlcvError::InvalidCsv("no data rows".to_string()));
    }

    // Median timestamp delta → bar interval.
    let mut deltas: Vec<i64> = bars.windows(2).map(|w| w[1].timestamp_ns - w[0].timestamp_ns).collect();
    deltas.sort_unstable();
    let interval_ns = if deltas.is_empty() { 0 } else { deltas[deltas.len() / 2] };

    let summary = DatasetSummary {
        dataset_id: format!("ohlcv-{}", &content_hash(text)[..16]),
        bar_count: bars.len(),
        start_ns: bars[0].timestamp_ns,
        end_ns: bars[bars.len() - 1].timestamp_ns,
        interval_ns,
        source_name: source_name.to_string(),
    };
    Ok((summary, bars))
}

// ---------------------------------------------------------------------------
// The backtest
// ---------------------------------------------------------------------------

/// Configuration for one run.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SmaBacktestConfig {
    pub params: SmaParams,
    pub cost: CostModel,
    pub initial_capital: f64,
    /// Inclusive [start, end] ns filter over bar timestamps.
    pub start_ns: i64,
    pub end_ns: i64,
}

/// Compute the simple moving average over the last `period` closes of
/// `closes[..=i]`; None until `period` values exist.
fn sma(closes: &[f64], i: usize, period: usize) -> Option<f64> {
    if i + 1 < period {
        return None;
    }
    Some(closes[i + 1 - period..=i].iter().sum::<f64>() / period as f64)
}

/// Run the real SMA-crossover backtest.
///
/// Semantics (deterministic, documented so results are reproducible):
/// - Bars are processed strictly chronologically, filtered to
///   `[start_ns, end_ns]` inclusive.
/// - At each bar close the SMA(short) and SMA(long) of closes are computed;
///   the trend state is `short > long`. A state change observed at bar i is
///   executed as a market order at bar i+1's OPEN (no look-ahead): signal at
///   the close, fill at the next open.
/// - Fills apply adverse slippage: buy at open × (1 + bps/10⁴), sell at
///   open × (1 − bps/10⁴), plus taker fee = notional × pct/100.
/// - Position sizing: all-in on entry (cash / (fill_price × (1 + fee_frac)))
///   and all-out on exit. Long-only.
/// - Equity is marked to market at every bar close: cash + position × close.
/// - Metrics per docs/09 §9.1/§9.3 from the equity series; per-fill slippage
///   per §9.7. No value in the output is synthesized.
pub fn run_sma_backtest(
    bars: &[OhlcvBar],
    cfg: &SmaBacktestConfig,
) -> Result<SmaBacktestOutput, OhlcvError> {
    if cfg.params.short_period == 0 || cfg.params.long_period <= cfg.params.short_period {
        return Err(OhlcvError::InvalidRequest(format!(
            "requires 0 < short_period < long_period (got {} / {})",
            cfg.params.short_period, cfg.params.long_period
        )));
    }
    if cfg.initial_capital <= 0.0 {
        return Err(OhlcvError::InvalidRequest("initial_capital must be positive".to_string()));
    }
    if cfg.cost.taker_fee_pct < 0.0 || cfg.cost.slippage_bps < 0.0 {
        return Err(OhlcvError::InvalidRequest("fees and slippage must be >= 0".to_string()));
    }

    let selected: Vec<OhlcvBar> = bars
        .iter()
        .copied()
        .filter(|b| b.timestamp_ns >= cfg.start_ns && b.timestamp_ns <= cfg.end_ns)
        .collect();
    if selected.len() < cfg.params.long_period + 1 {
        return Err(OhlcvError::InvalidRequest(format!(
            "{} bars in range, need at least long_period + 1 = {} to produce a tradeable signal",
            selected.len(),
            cfg.params.long_period + 1
        )));
    }
    let n = selected.len();
    let closes: Vec<f64> = selected.iter().map(|b| b.close).collect();

    let fee_frac = cfg.cost.taker_fee_pct / 100.0;
    let slip = cfg.cost.slippage_bps / 10_000.0;

    let mut cash = cfg.initial_capital;
    let mut position = 0.0;
    let mut total_fees = 0.0;
    let mut total_slip_cost = 0.0;
    let mut orders_submitted = 0u64;
    let mut trades: Vec<TradeRecord> = Vec::new();
    let mut equity: Vec<EquityPoint> = Vec::with_capacity(n);

    // Entry fill reference (price incl. fees basis) for realized P&L on exit.
    let mut entry_cost_basis = 0.0f64; // total cash spent on the open position

    // Trend state at the previous bar (None until the long SMA exists).
    let mut prev_state: Option<bool> = None;
    // Pending market order generated at bar i, to fill at bar i+1's open.
    let mut pending: Option<(&'static str, Option<f64>, Option<f64>)> = None; // (side, sma_s, sma_l at signal)

    for i in 0..n {
        // 1. Fill any order pending from the previous bar's signal, at THIS
        //    bar's open — chronological, no look-ahead.
        if let Some((side, ss, sl)) = pending.take() {
            let reference = selected[i].open;
            if side == "buy" && position == 0.0 {
                let fill_price = reference * (1.0 + slip);
                let qty = cash / (fill_price * (1.0 + fee_frac));
                let notional = qty * fill_price;
                let fee = notional * fee_frac;
                let slip_cost = (fill_price - reference) * qty;
                cash -= notional + fee;
                position = qty;
                entry_cost_basis = notional + fee;
                total_fees += fee;
                total_slip_cost += slip_cost;
                trades.push(TradeRecord {
                    timestamp_ns: selected[i].timestamp_ns,
                    side,
                    reference_price: reference,
                    fill_price,
                    qty,
                    notional,
                    fee,
                    slippage_cost: slip_cost,
                    realized_pnl: None,
                    cash_after: cash,
                    position_after: position,
                    sma_short_at_signal: ss,
                    sma_long_at_signal: sl,
                });
            } else if side == "sell" && position > 0.0 {
                let fill_price = reference * (1.0 - slip);
                let notional = position * fill_price;
                let fee = notional * fee_frac;
                let slip_cost = (reference - fill_price) * position;
                let proceeds = notional - fee;
                // Realized P&L: what came back minus what went in (docs/09 §9.1).
                let realized = proceeds - entry_cost_basis;
                cash += proceeds;
                total_fees += fee;
                total_slip_cost += slip_cost;
                trades.push(TradeRecord {
                    timestamp_ns: selected[i].timestamp_ns,
                    side,
                    reference_price: reference,
                    fill_price,
                    qty: position,
                    notional,
                    fee,
                    slippage_cost: slip_cost,
                    realized_pnl: Some(realized),
                    cash_after: cash,
                    position_after: 0.0,
                    sma_short_at_signal: ss,
                    sma_long_at_signal: sl,
                });
                position = 0.0;
                entry_cost_basis = 0.0;
            }
            // An order that cannot change state (e.g. buy while long) is
            // never generated, so nothing else can land here.
        }

        // 2. Record mark-to-market equity at this bar's close.
        equity.push(EquityPoint {
            timestamp_ns: selected[i].timestamp_ns,
            close: selected[i].close,
            cash,
            position,
            equity: cash + position * selected[i].close,
        });

        // 3. Evaluate the strategy at this close; queue an order for bar i+1.
        if let (Some(s_s), Some(s_l)) = (sma(&closes, i, cfg.params.short_period), sma(&closes, i, cfg.params.long_period)) {
            let state = s_s > s_l;
            if let Some(prev) = prev_state {
                if state && !prev && position == 0.0 && i + 1 < n {
                    pending = Some(("buy", Some(s_s), Some(s_l)));
                    orders_submitted += 1;
                } else if !state && prev && position > 0.0 && i + 1 < n {
                    pending = Some(("sell", Some(s_s), Some(s_l)));
                    orders_submitted += 1;
                }
            }
            prev_state = Some(state);
        }
    }

    let headline = headline_from_series(&equity, trades.len() as u64, orders_submitted, total_fees, total_slip_cost, cfg.initial_capital);
    Ok(SmaBacktestOutput {
        fills: trades.len() as u64,
        trades,
        equity,
        orders_submitted,
        headline,
        bars_processed: n,
    })
}

/// Headline metrics from the mark-to-market equity series.
///
/// Formulas (docs/09 §9.1, §9.3):
/// - net_pnl = equity[last] − equity[first]; equity[0] == initial capital
///   (cash before any fill can happen at bar 0 — signals need long_period
///   bars first), so this equals equity[last] − initial_capital.
/// - max_drawdown_pct = |min(equity − running_max)| / initial × 100 (§9.3).
/// - Sharpe/Sortino over per-bar equity diffs, annualized with the detected
///   bar interval and 365 trading days, 0% risk-free (§9.1).
fn headline_from_series(
    equity: &[EquityPoint],
    fills: u64,
    orders_submitted: u64,
    fees: f64,
    slip_cost: f64,
    initial_capital: f64,
) -> HeadlineMetrics {
    let first = equity.first().map(|p| p.equity).unwrap_or(initial_capital);
    let last = equity.last().map(|p| p.equity).unwrap_or(initial_capital);
    let net_pnl = last - first;

    // Max drawdown (docs/09 §9.3).
    let mut peak = f64::NEG_INFINITY;
    let mut max_dd = 0.0f64;
    for p in equity {
        peak = peak.max(p.equity);
        max_dd = max_dd.max(peak - p.equity);
    }

    // Per-bar returns for Sharpe/Sortino (docs/09 §9.1).
    let rets: Vec<f64> = equity.windows(2).map(|w| w[1].equity - w[0].equity).collect();
    let (sharpe, sortino) = if rets.len() >= 2 {
        let mean = rets.iter().sum::<f64>() / rets.len() as f64;
        let var = rets.iter().map(|r| (r - mean) * (r - mean)).sum::<f64>() / (rets.len() - 1) as f64;
        let std = var.sqrt();
        let downside = (rets.iter().map(|r| r.min(0.0) * r.min(0.0)).sum::<f64>() / rets.len() as f64).sqrt();
        // Annualization from the detected bar interval.
        let interval = equity
            .get(1)
            .map(|p| p.timestamp_ns - equity[0].timestamp_ns)
            .unwrap_or(0);
        let per_year = if interval > 0 { 86_400_000_000_000.0 * 365.0 / interval as f64 } else { 1.0 };
        let ann = per_year.sqrt();
        (
            if std > 0.0 { mean / std * ann } else { f64::NAN },
            if downside > 0.0 { mean / downside * ann } else { f64::NAN },
        )
    } else {
        (f64::NAN, f64::NAN)
    };

    HeadlineMetrics {
        initial_capital,
        final_capital: initial_capital + net_pnl,
        net_pnl,
        return_pct: net_pnl / initial_capital * 100.0,
        max_drawdown_pct: max_dd / initial_capital * 100.0,
        sharpe,
        sortino,
        trades: fills,
        fill_rate_pct: if orders_submitted > 0 { 100.0 * fills as f64 / orders_submitted as f64 } else { f64::NAN },
        fees,
        slippage_pct: 100.0 * slip_cost / initial_capital,
    }
}

// ---------------------------------------------------------------------------
// Tests — hand-computed expected values (AGENTS.md §5.7)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn csv(rows: &[(&str, f64, f64, f64, f64)]) -> String {
        let mut s = String::from("timestamp,open,high,low,close,volume\n");
        for (t, o, h, l, c) in rows {
            s.push_str(&format!("{t},{o},{h},{l},{c},1.0\n"));
        }
        s
    }

    #[test]
    fn parses_epoch_seconds_ms_and_iso() {
        let iso = parse_timestamp("2024-01-02").unwrap();
        let secs = parse_timestamp("1704153600").unwrap();
        assert_eq!(iso, secs); // 2024-01-02T00:00:00Z
        assert_eq!(parse_timestamp("1704153600000").unwrap(), secs);
        assert_eq!(parse_timestamp("1704153600000000").unwrap(), secs);
        assert_eq!(parse_timestamp("1704153600000000000").unwrap(), secs);
        assert_eq!(parse_timestamp("2024-01-02T03:04:05Z").unwrap(), secs + (3 * 3600 + 4 * 60 + 5) * 1_000_000_000);
    }

    #[test]
    fn csv_validation_rejects_bad_rows() {
        let dup = csv(&[("1704163200", 1.0, 2.0, 0.5, 1.5), ("1704163200", 1.5, 2.0, 0.5, 1.8)]);
        assert!(matches!(parse_ohlcv_csv(&dup, "x.csv"), Err(OhlcvError::BadRow { .. })));

        let bad_ohlc = csv(&[("1704163200", 1.0, 1.2, 0.9, 1.5)]); // close > high
        assert!(matches!(parse_ohlcv_csv(&bad_ohlc, "x.csv"), Err(OhlcvError::BadRow { .. })));

        let no_header = "1,2,3,4,5\n".to_string();
        assert!(matches!(parse_ohlcv_csv(&no_header, "x.csv"), Err(OhlcvError::InvalidCsv(_))));
    }

    #[test]
    fn same_content_yields_same_dataset_id_regardless_of_name() {
        let text = csv(&[
            ("1704163200", 1.0, 2.0, 0.5, 1.5),
            ("1704166800", 1.5, 2.0, 0.5, 1.8),
        ]);
        let (a, bars_a) = parse_ohlcv_csv(&text, "a.csv").unwrap();
        let (b, bars_b) = parse_ohlcv_csv(&text, "b.csv").unwrap();
        assert_eq!(a.dataset_id, b.dataset_id);
        assert_eq!(bars_a, bars_b);
        assert_eq!(a.interval_ns, 3_600_000_000_000);
    }

    /// Deterministic hand-computable run: short=1, long=2 over 4 bars.
    ///
    /// closes: 10, 20, 30, 40
    /// SMA1 vs SMA2: bar1: 20 vs 15 → up; bar2: 30 vs 25 → up; bar3: 40 vs 35 → up.
    /// With a forced down-cross later we exercise a round trip; here instead
    /// we verify the up-cross entry mechanics exactly:
    /// bar0: state None (no SMA2). bar1: state up (prev None → no trade).
    /// No cross ever fires → flat, zero trades, equity constant.
    #[test]
    fn no_cross_means_no_trades_and_flat_equity() {
        let text = csv(&[
            ("1704163200", 10.0, 12.0, 9.0, 10.0),
            ("1704166800", 20.0, 21.0, 19.0, 20.0),
            ("1704170400", 30.0, 31.0, 29.0, 30.0),
            ("1704174000", 40.0, 41.0, 39.0, 40.0),
        ]);
        let (_, bars) = parse_ohlcv_csv(&text, "x.csv").unwrap();
        let out = run_sma_backtest(
            &bars,
            &SmaBacktestConfig {
                params: SmaParams { short_period: 1, long_period: 2 },
                cost: CostModel { taker_fee_pct: 0.1, slippage_bps: 10.0 },
                initial_capital: 10_000.0,
                start_ns: 0,
                end_ns: i64::MAX,
            },
        )
        .unwrap();
        assert_eq!(out.trades.len(), 0);
        assert_eq!(out.orders_submitted, 0);
        for p in &out.equity {
            assert!((p.equity - 10_000.0).abs() < 1e-9);
        }
        assert!((out.headline.net_pnl - 0.0).abs() < 1e-9);
        assert_eq!(out.headline.trades, 0);
        assert!(out.headline.fees.abs() < 1e-12);
    }

    /// Full hand-computed round trip: short=1, long=2.
    ///
    /// closes: 5, 10, 20, 10, 5
    /// states (SMA1 > SMA2): bar1: 10>7.5 up; bar2: 20>15 up; bar3: 10>15 down; bar4: 5>7.5 down.
    /// Up-cross at bar1 (prev state at bar1 vs bar... prev_state starts None at bar0—SMA2 needs 2 bars, so first defined state is bar1) — hmm:
    /// SMA2 exists from bar1 onward. prev_state set at bar1 (up). At bar2 still up. bar3 down → cross down, but position flat → nothing.
    /// To force an entry we need a down→up cross after bar1. Rewrite closes: 10, 5, 4, 20, 10.
    /// bar1: SMA1=5, SMA2=7.5 → down (first state). bar2: 4 vs 4.5 → down. bar3: 20 vs 12 → UP (cross!) → buy at bar4 open.
    /// bar4: SMA1=10, SMA2=15 → down (cross) → sell at bar5 open.
    ///
    /// Bars (opens = prior close for simplicity), capital 1000, fee 0.1%, slip 10bps:
    /// bar4 open 10: buy fill = 10 × 1.001 = 10.01; qty = 1000 / (10.01 × 1.001) = 99.8002...
    #[test]
    fn hand_computed_round_trip() {
        let text = csv(&[
            ("1704163200", 10.0, 11.0, 9.0, 10.0),  // i0
            ("1704166800", 9.5, 11.0, 4.5, 5.0),    // i1
            ("1704170400", 4.5, 11.0, 3.5, 4.0),    // i2
            ("1704174000", 5.0, 21.0, 4.5, 20.0),   // i3: up-cross
            ("1704177600", 10.0, 21.0, 9.5, 10.0),  // i4: buy fills at open 10; down-cross
            ("1704181200", 9.5, 11.0, 4.5, 5.0),    // i5: sell fills at open 9.5
        ]);
        let (_, bars) = parse_ohlcv_csv(&text, "x.csv").unwrap();
        let capital = 1000.0;
        let fee_pct = 0.1;
        let slip_bps = 10.0;
        let out = run_sma_backtest(
            &bars,
            &SmaBacktestConfig {
                params: SmaParams { short_period: 1, long_period: 2 },
                cost: CostModel { taker_fee_pct: fee_pct, slippage_bps: slip_bps },
                initial_capital: capital,
                start_ns: 0,
                end_ns: i64::MAX,
            },
        )
        .unwrap();

        assert_eq!(out.orders_submitted, 2);
        assert_eq!(out.trades.len(), 2);

        // Entry at i4 open 10 with slippage 10bps → 10.01.
        let buy = &out.trades[0];
        assert!((buy.fill_price - 10.01).abs() < 1e-12, "fill {}", buy.fill_price);
        assert_eq!(buy.side, "buy");
        let fee_frac = fee_pct / 100.0;
        let qty = capital / (10.01 * (1.0 + fee_frac));
        assert!((buy.qty - qty).abs() < 1e-9, "qty {} vs {qty}", buy.qty);
        let notional = qty * 10.01;
        assert!((buy.fee - notional * fee_frac).abs() < 1e-9);
        assert!((buy.slippage_cost - 0.01 * qty).abs() < 1e-9);

        // Exit at i5 open 9.5 with slippage → 9.49905.
        let sell = &out.trades[1];
        let exit_px = 9.5 * (1.0 - 10.0 / 10_000.0);
        assert!((sell.fill_price - exit_px).abs() < 1e-12);
        assert_eq!(sell.side, "sell");
        assert!((sell.qty - qty).abs() < 1e-9);

        // Hand-computed cash accounting: after both fills the position is
        // flat and cash = 1000 − buy_notional − buy_fee + sell_notional − sell_fee.
        let sell_notional = qty * exit_px;
        let sell_fee = sell_notional * fee_frac;
        let cash_final = capital - notional - buy.fee + sell_notional - sell_fee;
        assert!((sell.cash_after - cash_final).abs() < 1e-9);
        assert!(sell.position_after.abs() < 1e-12);
        let realized = sell_notional - sell_fee - (notional + buy.fee);
        assert!((sell.realized_pnl.unwrap() - realized).abs() < 1e-9);

        // Headline: final equity == final cash (flat). Fees = buy.fee + sell_fee.
        assert!((out.headline.net_pnl - (cash_final - capital)).abs() < 1e-9);
        assert!((out.headline.fees - (buy.fee + sell.fee)).abs() < 1e-9);
        assert!((out.headline.final_capital - cash_final).abs() < 1e-9);
        assert_eq!(out.headline.trades, 2);
        assert_eq!(out.headline.fill_rate_pct, 100.0);
        // Slippage pct of initial capital (docs/09 §9.7).
        let total_slip = (buy.slippage_cost + sell.slippage_cost) / capital * 100.0;
        assert!((out.headline.slippage_pct - total_slip).abs() < 1e-12);
        // Equity series: 6 points, marked at each close.
        assert_eq!(out.equity.len(), 6);
        assert!((out.equity[0].equity - capital).abs() < 1e-9);
        assert!((out.equity[5].equity - cash_final).abs() < 1e-9);
    }

    #[test]
    fn date_range_filters_bars_and_small_range_errors() {
        let text = csv(&[
            ("1704163200", 10.0, 11.0, 9.0, 10.0),
            ("1704166800", 9.5, 11.0, 4.5, 5.0),
            ("1704170400", 4.5, 11.0, 3.5, 4.0),
        ]);
        let (_, bars) = parse_ohlcv_csv(&text, "x.csv").unwrap();
        let cfg = SmaBacktestConfig {
            params: SmaParams { short_period: 1, long_period: 2 },
            cost: CostModel { taker_fee_pct: 0.0, slippage_bps: 0.0 },
            initial_capital: 1000.0,
            start_ns: 0,
            end_ns: i64::MAX,
        };
        // long_period + 1 = 3 bars are required; the filtered 2-bar range is
        // a typed rejection, and the full 3-bar range runs 2 bars.
        let narrow = SmaBacktestConfig { start_ns: 1704166800_000_000_000, end_ns: 1704170400_000_000_000, ..cfg };
        assert!(matches!(run_sma_backtest(&bars, &narrow), Err(OhlcvError::InvalidRequest(_))));
        let out = run_sma_backtest(&bars, &cfg).unwrap();
        assert_eq!(out.bars_processed, 3);
        assert_eq!(out.equity.len(), 3);

        let bad = SmaBacktestConfig { start_ns: 0, end_ns: 1, ..cfg };
        assert!(matches!(run_sma_backtest(&bars, &bad), Err(OhlcvError::InvalidRequest(_))));
    }

    #[test]
    fn default_params_are_sma_20_50() {
        assert_eq!(SmaParams::default(), SmaParams { short_period: 20, long_period: 50 });
    }
}
