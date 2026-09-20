//! Headline metrics engine (Block 2.4, `docs/09` §9.1).
//!
//! Placement decision (Task 2.4.A, `docs/16` Block 2.4; logged in `STATE.md`):
//! series-based headline computation lives HERE, in pure-std Rust, because the
//! engine must produce `BacktestResult::headline` synchronously inside the gRPC
//! service with no Python/Polars dependency on the hot path (`docs/03` §3.1,
//! §3.4). The Python mirror in `backend/experiments/app/metrics/` wraps
//! upstream's `Metric` classes directly (`docs/04` §4.7) for the analytics-suite
//! path and cross-checks these numbers (parity test, same fixture inputs).
//!
//! Every formula below is a line-for-line port of upstream
//! `py-hftbacktest/hftbacktest/stats/metrics.py` (+ `utils.py`), cited per
//! function — `docs/09` §9.1 says "do not reimplement; call the upstream
//! metric," which the Rust side honors by replicating upstream semantics
//! exactly (verified by the Python parity test that DOES call upstream).
//! Deliberate deviations from upstream, all documented at the use site:
//! - upstream divides by zero into ±inf (numpy `errstate(ignore)`); we return
//!   `NaN`, because JSON/gRPC doubles and the Results screen (`docs/08` §8.16)
//!   have no honest rendering for infinite performance figures, and `NaN` is
//!   already this codebase's convention for "uncomputable, not fabricated"
//!   (Block 2.2).
//! - upstream annualizes with `trading_days_per_year = 252` (trad-fi default);
//!   we use 365 because the engine's markets run 24/7 (crypto), which upstream
//!   itself recommends for this case (`AnnualRet`/`SR` docstrings). The
//!   assumption is a named constant, and `docs/09` §9.1 requires it stated next
//!   to the figure in the UI (Phase 4 concern, recorded here as the source).
//! - upstream warns on inconsistent sampling intervals and uses the first one
//!   (`get_num_samples_per_day`); we use the first interval silently — the
//!   sampling policy is fixed and documented by the caller
//!   (`hftbacktest_impl`: post-drain, post-each-fill, terminal), so there is no
//!   ad-hoc interval to warn about.
//!
//! Risk-free rate is 0% unless configured (`RISK_FREE_RATE`, `docs/09` §9.1).
//! No financial math here cites anything but `docs/09` §9.1–§9.3 and the
//! upstream sources above (`AGENTS.md` §5.3).

use crate::types::HeadlineMetrics;

/// Trading days per year for annualization (`docs/09` §9.1, upstream
/// `AnnualRet`-style convention). 365, not 252: crypto markets run 24/7 —
/// upstream's own recommendation for this case.
pub const TRADING_DAYS_PER_YEAR: f64 = 365.0;

/// Risk-free rate assumption, stated explicitly per `docs/09` §9.1 ("0% unless
/// configured"). Subtracted as a per-sample excess; zero changes nothing
/// arithmetically but keeps the assumption visible instead of implicit.
pub const RISK_FREE_RATE: f64 = 0.0;

/// Seconds per (24h) day, matching upstream `SECONDS_PER_DAY` (`utils.py`).
pub const SECONDS_PER_DAY: f64 = 86_400.0;

/// One Recorder observation.
///
/// Field-for-field mirror of upstream's per-tick record (`docs/04` §4.6; Rust
/// `BacktestRecorder::record` in
/// `engine/vendor/hftbacktest/hftbacktest/src/backtest/recorder.rs`):
/// `timestamp, price (= mid), position, balance, fee, num_trades,
/// trading_volume, trading_value`. The caller samples these at the documented
/// observation points; this module only computes over them.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RecorderSample {
    pub timestamp_ns: i64,
    pub price: f64,
    pub position: f64,
    pub balance: f64,
    pub fee: f64,
    pub num_trades: i64,
    pub trading_volume: f64,
    pub trading_value: f64,
}

/// Net equity of one sample, quote currency.
///
/// `equity = (balance + position * price) - fee` for `LinearAsset` with
/// contract size 1. Upstream: `LinearAssetRecord.prepare`
/// (`stats.py`: `equity_wo_fee = balance + position * price * contract_size`,
/// default 1.0), then every metric uses `equity_wo_fee - fee` (`metrics.py`:
/// `Ret`, `SR`, `Sortino`, `MaxDrawdown` all open with
/// `equity = df['equity_wo_fee'] - df['fee']`).
fn equity_of(s: &RecorderSample) -> f64 {
    (s.balance + s.position * s.price) - s.fee
}

/// Finite equity series, in order.
///
/// Mirrors upstream `Ret`'s `.drop_nans()`: samples whose equity is not finite
/// (e.g. observed while the book had no touch, so mid was NaN) carry no P&L
/// information and are skipped rather than poisoning the series.
fn finite_equity(samples: &[RecorderSample]) -> Vec<f64> {
    samples
        .iter()
        .map(equity_of)
        .filter(|e| e.is_finite())
        .collect()
}

/// Return, quote currency (`docs/09` §9.1).
///
/// Upstream `Ret.compute` (`metrics.py`): `pnl = equity[-1] - equity[0]`
/// (after `drop_nans`). Empty series has no first/last observation → `NaN`
/// (upstream would index-crash; `NaN` keeps the `Result`-free pure contract).
/// A single observation yields exactly `0.0`, as upstream does.
pub fn net_return(samples: &[RecorderSample]) -> f64 {
    let equity = finite_equity(samples);
    match (equity.first(), equity.last()) {
        (Some(first), Some(last)) => last - first,
        _ => f64::NAN,
    }
}

/// Maximum drawdown, as a positive percent magnitude of `initial_capital`
/// (`docs/09` §9.1, §9.3).
///
/// Upstream `MaxDrawdown.compute` (`metrics.py`): `dd = equity - cum_max(equity)`,
/// result `abs(dd.min())` — an absolute quote-currency magnitude, optionally
/// divided by `book_size` into a ratio. The headline field is a *percent*
/// (`maxDrawdownPct`, `docs/15` §15.5; displayed as `-{max_drawdown_pct}%` in
/// `docs/08` §8.16), so the ratio is scaled by 100 here, exactly like
/// `return_pct`. Non-positive capital cannot normalize → `NaN`. Series with
/// fewer than one finite observation → `NaN`; a single observation draws down
/// `0.0`, as upstream.
pub fn max_drawdown_pct(samples: &[RecorderSample], initial_capital: f64) -> f64 {
    if initial_capital.is_nan() || initial_capital <= 0.0 {
        return f64::NAN;
    }
    let equity = finite_equity(samples);
    if equity.is_empty() {
        return f64::NAN;
    }
    let mut running_max = equity[0];
    let mut worst = 0.0f64;
    for &e in &equity {
        if e > running_max {
            running_max = e;
        }
        let dd = e - running_max;
        if dd < worst {
            worst = dd;
        }
    }
    worst.abs() / initial_capital * 100.0
}

/// Per-sample equity differences, in order. The first observation has no
/// predecessor (upstream `equity.diff()` yields null there, ignored by its
/// mean/std), so diffs start at the second finite observation.
fn equity_diffs(equity: &[f64]) -> Vec<f64> {
    equity.windows(2).map(|w| w[1] - w[0]).collect()
}

/// Annualization factor, mirroring upstream `SR`/`Sortino` (`metrics.py`):
/// `c = get_num_samples_per_day(timestamp) * trading_days_per_year` with
/// `get_num_samples_per_day = SECONDS_PER_DAY / first_interval_seconds`
/// (`utils.py`). Returns `NaN` when the first interval is not a positive,
/// finite span (upstream would divide by zero into ±inf under
/// `errstate(ignore)`; see module docs for why `NaN`).
fn annualization(samples: &[RecorderSample]) -> f64 {
    if samples.len() < 2 {
        return f64::NAN;
    }
    let interval_s = (samples[1].timestamp_ns - samples[0].timestamp_ns) as f64 / 1_000_000_000.0;
    if !interval_s.is_finite() || interval_s <= 0.0 {
        return f64::NAN;
    }
    SECONDS_PER_DAY / interval_s * TRADING_DAYS_PER_YEAR
}

/// Mean and *sample* standard deviation (ddof = 1) of `xs`.
///
/// Upstream `SR` calls Polars `Series.std()`, whose default is `ddof = 1`
/// (verified empirically against the vendored source: std of the fixture diffs
/// is `0.0007071… = 0.0005·√2`, i.e. divided by `n − 1`, not `n`). Fewer than
/// two values → `(NaN, NaN)` (upstream yields null there).
fn mean_sample_std(xs: &[f64]) -> (f64, f64) {
    if xs.len() < 2 {
        return (f64::NAN, f64::NAN);
    }
    let n = xs.len() as f64;
    let mean = xs.iter().sum::<f64>() / n;
    let var = xs.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
    (mean, var.sqrt())
}

/// Sharpe ratio (`docs/09` §9.1).
///
/// Upstream `SR.compute` (`metrics.py`): `mean(pnl_diff) / std(pnl_diff) *
/// sqrt(c)` over the equity-difference series, no benchmark (risk-free 0%,
/// `docs/09` §9.1). Returns `NaN` when there are fewer than two differences,
/// the dispersion is zero, or the sampling interval cannot annualize —
/// upstream yields ±inf/null in the same spots (see module docs).
pub fn sharpe(samples: &[RecorderSample]) -> f64 {
    let equity = finite_equity(samples);
    let diffs = equity_diffs(&equity);
    let (mean, std) = mean_sample_std(&diffs);
    if !mean.is_finite() || !std.is_finite() || std == 0.0 {
        return f64::NAN;
    }
    let c = annualization(samples);
    if !c.is_finite() {
        return f64::NAN;
    }
    (mean - RISK_FREE_RATE) / std * c.sqrt()
}

/// Sortino ratio (`docs/09` §9.1).
///
/// Upstream `Sortino.compute` (`metrics.py`): `mean(pnl_diff) / dr * sqrt(c)`
/// with downside deviation `dr = sqrt(mean(min(0, diff)²))`, same `c` as
/// Sharpe, no benchmark. `NaN` under the same degenerate conditions as
/// [`sharpe`] (no downside dispersion ⇒ `dr == 0` ⇒ `NaN`; upstream ±inf).
pub fn sortino(samples: &[RecorderSample]) -> f64 {
    let equity = finite_equity(samples);
    let diffs = equity_diffs(&equity);
    if diffs.len() < 2 {
        return f64::NAN;
    }
    let n = diffs.len() as f64;
    let mean = diffs.iter().sum::<f64>() / n;
    let downside = diffs.iter().map(|d| d.min(0.0).powi(2)).sum::<f64>() / n;
    let dr = downside.sqrt();
    if !mean.is_finite() || !dr.is_finite() || dr == 0.0 {
        return f64::NAN;
    }
    let c = annualization(samples);
    if !c.is_finite() {
        return f64::NAN;
    }
    (mean - RISK_FREE_RATE) / dr * c.sqrt()
}

/// Full headline computation over one Recorder series (`docs/09` §9.1).
///
/// - `net_pnl` / `return_pct` / `final_capital`: [`net_return`], percent and
///   capital exactly as the engine previously computed from terminal state
///   (series endpoints coincide with it, so accepted Block 2.2 numbers are
///   preserved bit-for-bit on the fixture).
/// - `max_drawdown_pct` / `sharpe` / `sortino`: [`max_drawdown_pct`],
///   [`sharpe`], [`sortino`].
/// - `trades`: fill count from the Recorder's cumulative `num_trades`
///   (`docs/09` §9.1: `num_trades[-1]`; differenced against the first sample
///   so a series that starts mid-run still counts only its own fills).
/// - `fill_rate_pct`: `fills / orders_submitted` (`docs/09` §9.1; submitted
///   count comes from the order path, not the Recorder).
/// - `fees`: cumulative fee at the series end (`docs/09` §9.1: `fee[-1]`;
///   differenced against the first sample, same reasoning as trades).
/// - `slippage`: filled by the caller — `NaN` until Block 2.5 captures
///   per-fill expected-vs-fill prices (`docs/09` §9.7); never fabricated.
pub fn headline(
    samples: &[RecorderSample],
    initial_capital: f64,
    orders_submitted: u64,
) -> HeadlineMetrics {
    let net_pnl = net_return(samples);
    let return_pct = net_pnl / initial_capital * 100.0;
    let (trades, fees) = match (samples.first(), samples.last()) {
        (Some(first), Some(last)) => (
            last.num_trades
                .saturating_sub(first.num_trades)
                .max(0)
                .cast_unsigned(),
            last.fee - first.fee,
        ),
        _ => (0, f64::NAN),
    };
    let fill_rate_pct = if orders_submitted > 0 {
        100.0 * trades as f64 / orders_submitted as f64
    } else {
        f64::NAN
    };
    HeadlineMetrics {
        initial_capital,
        final_capital: initial_capital + net_pnl,
        net_pnl,
        return_pct,
        max_drawdown_pct: max_drawdown_pct(samples, initial_capital),
        sharpe: sharpe(samples),
        sortino: sortino(samples),
        trades,
        fill_rate_pct,
        fees,
        slippage: f64::NAN,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Hand-built series with round equities. Timestamps 1s apart so the
    /// annualization factor is exactly 86_400 × 365 (hand-derived below).
    /// equities: s0: 0+0·100−0 = 0; s1: −50+1·100−1 = 49;
    ///           s2: −50+1·110−1 = 59; s3: 60+0·110−2 = 58.
    fn synthetic() -> Vec<RecorderSample> {
        let row = |t: i64, price: f64, position: f64, balance: f64, fee: f64| RecorderSample {
            timestamp_ns: t,
            price,
            position,
            balance,
            fee,
            num_trades: 0,
            trading_volume: 0.0,
            trading_value: 0.0,
        };
        vec![
            row(0, 100.0, 0.0, 0.0, 0.0),
            row(1_000_000_000, 100.0, 1.0, -50.0, 1.0),
            row(2_000_000_000, 110.0, 1.0, -50.0, 1.0),
            row(3_000_000_000, 110.0, 0.0, 60.0, 2.0),
        ]
    }

    /// Relative difference; expectations are hand-derived rounded decimals, so
    /// compare with a band that still discriminates every plausible formula
    /// error (wrong ddof shifts Sharpe 22%; 252 vs 365 days shifts 17%; a
    /// missing annualization is off by 5600×).
    fn assert_close(actual: f64, expected: f64, tol: f64) {
        assert!(
            (actual - expected).abs() <= tol * expected.abs().max(1e-12),
            "actual {actual} vs hand-derived {expected} (tol {tol})"
        );
    }

    #[test]
    fn return_and_drawdown_match_hand_computation() {
        let s = synthetic();
        // equity = [0, 49, 59, 58]; Return = 58 − 0 = 58 (upstream Ret).
        assert_eq!(net_return(&s), 58.0);
        // drawdown = equity − cummax = [0,0,0,−1]; |min| = 1;
        // pct of capital 1000 = 0.1 (upstream MaxDrawdown + ×100).
        assert_eq!(max_drawdown_pct(&s, 1000.0), 0.1);
    }

    #[test]
    fn sharpe_matches_hand_computation() {
        // diffs = [49, 10, −1]; mean = 58/3 = 19.3333…;
        // sample std (ddof=1, Polars default): deviations 89/3, −28/3, −61/3;
        // var = (7921+784+3721)/9/2 = 690.3333…; std = 26.2741…;
        // mean/std = 0.73583…; c = 86_400/1s × 365 = 31_536_000, √c = 5615.13…;
        // Sharpe = 0.73583… × 5615.13… = 4131.8… (hand-derived ≈ 4131.8).
        assert_close(sharpe(&synthetic()), 4131.8, 5e-3);
    }

    #[test]
    fn sortino_matches_hand_computation() {
        // Same diffs; downside dev = √mean(min(0,d)²): min(0,d)² = [0, 0, 1],
        // mean = 1/3, dr = √(1/3) = 0.577350…;
        // Sortino = (58/3)/0.577350… × √31_536_000
        //         = 33.4865… × 5615.13… = 188033.… (hand-derived ≈ 1.8803e5).
        assert_close(sortino(&synthetic()), 188033.0, 5e-3);
    }

    #[test]
    fn degenerate_series_yield_nan_not_infinities() {
        let row = |t: i64, bal: f64| RecorderSample {
            timestamp_ns: t,
            price: 100.0,
            position: 0.0,
            balance: bal,
            fee: 0.0,
            num_trades: 0,
            trading_volume: 0.0,
            trading_value: 0.0,
        };
        // Empty: nothing observable.
        assert!(net_return(&[]).is_nan());
        assert!(max_drawdown_pct(&[], 1000.0).is_nan());
        assert!(sharpe(&[]).is_nan());
        assert!(sortino(&[]).is_nan());
        // Single observation: Return 0, no drawdown, no dispersions.
        let one = vec![row(0, 5.0)];
        assert_eq!(net_return(&one), 0.0);
        assert_eq!(max_drawdown_pct(&one, 1000.0), 0.0);
        assert!(sharpe(&one).is_nan());
        assert!(sortino(&one).is_nan());
        // Flat series: zero return dispersion → Sharpe NaN (upstream: ±inf).
        let flat = vec![row(0, 0.0), row(1, 0.0), row(2, 0.0)];
        assert_eq!(net_return(&flat), 0.0);
        assert!(sharpe(&flat).is_nan());
        // No downside (all diffs ≥ 0, not all zero) → Sortino NaN; Sharpe finite.
        let up = vec![row(0, 0.0), row(1, 1.0), row(2, 3.0)];
        assert!(sortino(&up).is_nan());
        assert!(sharpe(&up).is_finite());
        // Non-positive capital cannot normalize drawdown.
        assert!(max_drawdown_pct(&synthetic(), 0.0).is_nan());
        // Zero sampling interval cannot annualize.
        let dup_ts = vec![row(7, 0.0), row(7, 1.0), row(7, 3.0)];
        assert!(sharpe(&dup_ts).is_nan());
        assert!(sortino(&dup_ts).is_nan());
    }

    #[test]
    fn non_finite_equity_samples_are_skipped_like_drop_nans() {
        let mut s = synthetic();
        s.insert(
            1,
            RecorderSample {
                timestamp_ns: 500_000_000,
                price: f64::NAN,
                position: 0.0,
                balance: 0.0,
                fee: 0.0,
                num_trades: 0,
                trading_volume: 0.0,
                trading_value: 0.0,
            },
        );
        assert_eq!(net_return(&s), 58.0);
    }
}
