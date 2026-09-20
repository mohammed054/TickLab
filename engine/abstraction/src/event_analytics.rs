//! Fill / Queue / Latency analytics over the extended stream (Task C).
//!
//! Every computation here runs against rows captured by
//! [`crate::extended_recorder::ExtendedRecorder`] — real captured data, never
//! mocked analytics inputs (Block 2.5 acceptance). Each function's doc comment
//! cites the exact `docs/09-analytics-and-investigation-suite.md` formula it
//! implements (`AGENTS.md` §5.3: no silent financial math).
//!
//! Scope: `docs/09` §9.5 (Trade/Fill Analysis), §9.8 (Queue Analysis), §9.9
//! (Latency Analysis), plus the §9.6 markout and §9.7 slippage primitives
//! those views are defined in terms of. Full P&L attribution (§9.4) and the
//! Regime/Volatility/Liquidity/Time views (§9.10–§9.13) belong to later blocks
//! (metrics placement, Task 2.4) and are not started here.

use std::collections::HashMap;

use crate::extended_events::{ExtendedEvent, ExtendedEventType};
use crate::types::Side;

/// Signed size convention (`docs/09` §9.6): buys positive, sells negative.
pub fn signed_size(side: Side, size: f64) -> f64 {
    match side {
        Side::Bid => size,
        Side::Ask => -size,
    }
}

/// Markout at horizon `h` (`docs/09` §9.6):
/// `markout(h) = signed_size * (mid_price(fill_time + h) - fill_price)`.
/// Positive means the fill was favorable in hindsight.
pub fn markout(fill_price: f64, side: Side, size: f64, mid_at_horizon: f64) -> f64 {
    signed_size(side, size) * (mid_at_horizon - fill_price)
}

/// Slippage in quote currency (`docs/09` §9.7):
/// `slippage = (fill_price - expected_price) * signed_size`, where
/// `expected_price` is the limit price at submission (limit orders) or the
/// best available price at submission (market/IOC/FOK orders).
pub fn slippage(fill_price: f64, expected_price: f64, side: Side, size: f64) -> f64 {
    (fill_price - expected_price) * signed_size(side, size)
}

/// Slippage in basis points (`docs/09` §9.7):
/// `(fill - expected) / expected * 10_000` (signed by side via [`slippage`]
/// sign convention applied to the price diff first).
pub fn slippage_bps(fill_price: f64, expected_price: f64) -> f64 {
    if expected_price == 0.0 {
        return 0.0;
    }
    (fill_price - expected_price) / expected_price * 10_000.0
}

/// Aggregate fill statistics (`docs/09` §9.5 "Trade Analysis", aggregate).
///
/// Win/loss classification is by markout at the investigation horizon (§9.5:
/// "determined by its markout at the configured investigation horizon, §9.6,
/// not by raw fill price vs. entry"); pass per-fill markouts in alongside the
/// events so this function never invents the classification input.
#[derive(Clone, Debug, PartialEq)]
pub struct FillStats {
    pub fills: u64,
    pub partial_fills: u64,
    pub buy_fills: u64,
    pub sell_fills: u64,
    /// Sum of executed size across full fills.
    pub total_filled_size: f64,
    /// Size-weighted average fill price across full fills.
    pub avg_fill_price: f64,
    /// Mean queue-ahead-at-submission for filled orders (join submit→fill by
    /// order id; orders without a submit row are skipped, never zero-filled).
    pub avg_queue_ahead_at_submit: f64,
    /// Winners/losers by markout sign (see note on [`FillStats`]).
    pub winning_fills: u64,
    pub losing_fills: u64,
}

/// Compute [`FillStats`] over captured rows plus per-fill markouts.
///
/// `markouts` maps `order_id` → `markout(h_fixed)` for the single
/// consistently-applied horizon (`docs/09` §9.6: one `h_fixed` everywhere so
/// views never disagree).
pub fn fill_stats(events: &[ExtendedEvent], markouts: &HashMap<u64, f64>) -> FillStats {
    let mut fills = 0u64;
    let mut partial_fills = 0u64;
    let mut buy_fills = 0u64;
    let mut sell_fills = 0u64;
    let mut notional = 0.0;
    let mut size_sum = 0.0;

    for e in events {
        match e.event_type {
            ExtendedEventType::Fill => {
                fills += 1;
                match e.side {
                    Some(Side::Bid) => buy_fills += 1,
                    Some(Side::Ask) => sell_fills += 1,
                    None => {}
                }
                if let (Some(price), Some(size)) = (e.price, e.size) {
                    notional += price * size;
                    size_sum += size;
                }
            }
            ExtendedEventType::PartialFill => {
                partial_fills += 1;
            }
            _ => {}
        }
    }

    let submit_queue: HashMap<u64, f64> = events
        .iter()
        .filter(|e| e.event_type == ExtendedEventType::Submit)
        .filter_map(|e| e.queue_ahead_estimate.map(|q| (e.order_id, q)))
        .collect();
    let mut queue_sum = 0.0;
    let mut queue_count = 0u64;
    for e in events {
        if e.event_type == ExtendedEventType::Fill {
            if let Some(q) = submit_queue.get(&e.order_id) {
                queue_sum += *q;
                queue_count += 1;
            }
        }
    }

    let mut winning_fills = 0u64;
    let mut losing_fills = 0u64;
    for e in events {
        if e.event_type == ExtendedEventType::Fill {
            match markouts.get(&e.order_id) {
                Some(m) if *m > 0.0 => winning_fills += 1,
                Some(m) if *m < 0.0 => losing_fills += 1,
                _ => {}
            }
        }
    }

    FillStats {
        fills,
        partial_fills,
        buy_fills,
        sell_fills,
        total_filled_size: size_sum,
        avg_fill_price: if size_sum > 0.0 {
            notional / size_sum
        } else {
            0.0
        },
        avg_queue_ahead_at_submit: if queue_count > 0 {
            queue_sum / queue_count as f64
        } else {
            0.0
        },
        winning_fills,
        losing_fills,
    }
}

/// Queue progression for one order (`docs/09` §9.8): the timeline of
/// queue-ahead estimates that lets the UI render "queue progression" —
/// `(timestamp_ns, queue_ahead)` from submit through queue updates to the
/// terminal row.
pub fn queue_progression(events: &[ExtendedEvent], order_id: u64) -> Vec<(i64, f64)> {
    let mut out: Vec<(i64, f64)> = events
        .iter()
        .filter(|e| e.order_id == order_id)
        .filter_map(|e| e.queue_ahead_estimate.map(|q| (e.timestamp_ns, q)))
        .collect();
    out.sort_by_key(|(ts, _)| *ts);
    out
}

/// One bucket of the queue-ahead-vs-fill-probability calibration view
/// (`docs/09` §9.8: "a scatter/binned-line chart plotting
/// queue-ahead-at-submission (x) against realized fill rate (y)").
#[derive(Clone, Debug, PartialEq)]
pub struct CalibrationBucket {
    pub bucket_index: usize,
    /// Mean queue-ahead-at-submission in the bucket (x).
    pub avg_queue_ahead: f64,
    /// Realized fill rate in the bucket (y): filled submits / all submits.
    pub fill_rate: f64,
    pub count: u64,
}

/// Empirical calibration of the modeled `fill_probability_estimate`
/// (`docs/09` §9.8).
///
/// Input: one `(queue_ahead_at_submit, filled)` pair per submitted order.
/// Buckets are equal-count quantiles over queue-ahead (configurable count);
/// an empty input yields no buckets (never a fabricated flat line).
pub fn queue_fill_calibration(
    submits: &[(f64, bool)],
    bucket_count: usize,
) -> Vec<CalibrationBucket> {
    if submits.is_empty() || bucket_count == 0 {
        return Vec::new();
    }
    let mut sorted: Vec<(f64, bool)> = submits.to_vec();
    sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let bucket_count = bucket_count.min(sorted.len());
    let mut out = Vec::with_capacity(bucket_count);
    for (i, chunk) in sorted
        .chunks((sorted.len() + bucket_count - 1) / bucket_count)
        .enumerate()
    {
        let n = chunk.len() as f64;
        let avg_queue_ahead = chunk.iter().map(|(q, _)| *q).sum::<f64>() / n;
        let filled = chunk.iter().filter(|(_, f)| *f).count() as f64;
        out.push(CalibrationBucket {
            bucket_index: i,
            avg_queue_ahead,
            fill_rate: filled / n,
            count: chunk.len() as u64,
        });
    }
    out
}

/// Latency distribution summary (`docs/09` §9.9: "a latency distribution
/// (histogram, with p50/p90/p99 annotated)").
#[derive(Clone, Debug, PartialEq)]
pub struct LatencyStats {
    pub count: u64,
    pub mean_ns: f64,
    pub p50_ns: f64,
    pub p90_ns: f64,
    pub p99_ns: f64,
    /// Per-component means: (decision, order_creation, exchange_arrival, fill).
    pub component_means_ns: (f64, f64, f64, f64),
    /// Reconciliation gap: `mean(total) - sum(component means)` — must be ~0;
    /// an unreconciled gap is flagged like §9.4's "Other" residual (`docs/09`
    /// §9.9: "these three must sum to (or clearly account for the gap to) the
    /// total latency figure").
    pub reconciliation_gap_ns: f64,
}

/// Totals are `LatencyBreakdown::total_ns` per row (`docs/09` §9.9); rows of
/// kind `DecisionTick` carry only the decision component and are included as
/// any other row (their zeros are real zeros, not missing data).
pub fn latency_stats(events: &[ExtendedEvent]) -> Option<LatencyStats> {
    if events.is_empty() {
        return None;
    }
    let mut totals: Vec<f64> = events.iter().map(|e| e.latency.total_ns() as f64).collect();
    totals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = totals.len() as f64;
    let mean_ns = totals.iter().sum::<f64>() / n;
    let quantile = |q: f64| {
        let idx = ((q * n).ceil() as usize)
            .saturating_sub(1)
            .min(totals.len() - 1);
        totals[idx]
    };
    let component_means_ns = (
        events
            .iter()
            .map(|e| e.latency.decision_ns as f64)
            .sum::<f64>()
            / n,
        events
            .iter()
            .map(|e| e.latency.order_creation_ns as f64)
            .sum::<f64>()
            / n,
        events
            .iter()
            .map(|e| e.latency.exchange_arrival_ns as f64)
            .sum::<f64>()
            / n,
        events.iter().map(|e| e.latency.fill_ns as f64).sum::<f64>() / n,
    );
    let component_sum =
        component_means_ns.0 + component_means_ns.1 + component_means_ns.2 + component_means_ns.3;
    Some(LatencyStats {
        count: events.len() as u64,
        mean_ns,
        p50_ns: quantile(0.5),
        p90_ns: quantile(0.9),
        p99_ns: quantile(0.99),
        component_means_ns,
        reconciliation_gap_ns: mean_ns - component_sum,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extended_events::{LatencyBreakdown, MarketStateSnapshot};

    fn snap() -> MarketStateSnapshot {
        MarketStateSnapshot::from_top_of_book(49_999.5, 50_000.5, None)
    }

    fn lat() -> LatencyBreakdown {
        LatencyBreakdown {
            decision_ns: 800,
            order_creation_ns: 400,
            exchange_arrival_ns: 1_200,
            fill_ns: 600,
        }
    }

    fn fill(order_id: u64, side: Side, price: f64, size: f64) -> ExtendedEvent {
        ExtendedEvent {
            timestamp_ns: 1_000,
            event_type: ExtendedEventType::Fill,
            order_id,
            side: Some(side),
            price: Some(price),
            size: Some(size),
            queue_ahead_estimate: Some(0.0),
            fill_probability_estimate: None,
            market_state: snap(),
            latency: lat(),
        }
    }

    #[test]
    fn markout_sign_convention_matches_spec() {
        // docs/09 §9.6: positive markout = favorable in hindsight.
        // Buy 0.1 @ 50000, mid moves to 50001 → +0.1 * 1 = +0.1... in notional:
        // 0.1 * (50001 - 50000) = +0.1 * 1.0 = +0.1? No: 0.1*1.0 = 0.1.
        assert_eq!(markout(50_000.0, Side::Bid, 0.1, 50_001.0), 0.1);
        // Sell 0.1 @ 50000, mid moves up to 50001 → adverse: -0.1.
        assert_eq!(markout(50_000.0, Side::Ask, 0.1, 50_001.0), -0.1);
    }

    #[test]
    fn slippage_matches_spec_formula() {
        // docs/09 §9.7: (fill - expected) * signed_size.
        // Buy 0.1, limit 50000, filled 50000.5 → +0.05 adverse cost.
        assert_eq!(slippage(50_000.5, 50_000.0, Side::Bid, 0.1), 0.05);
        // Sell 0.1, limit 50000, filled 49999.5 → (49999.5-50000)*(-0.1) = +0.05.
        assert_eq!(slippage(49_999.5, 50_000.0, Side::Ask, 0.1), 0.05);
    }

    #[test]
    fn fill_stats_hand_computed() {
        let events = vec![
            fill(1, Side::Bid, 50_000.0, 0.1),
            fill(2, Side::Ask, 50_001.0, 0.2),
            ExtendedEvent {
                event_type: ExtendedEventType::PartialFill,
                ..fill(3, Side::Bid, 50_000.0, 0.05)
            },
        ];
        let stats = fill_stats(&events, &HashMap::new());
        assert_eq!(stats.fills, 2);
        assert_eq!(stats.partial_fills, 1);
        assert_eq!(stats.buy_fills, 1);
        assert_eq!(stats.sell_fills, 1);
        // total size 0.1 + 0.2 = 0.3; notional 5000 + 10000.2 = 15000.2.
        assert!((stats.total_filled_size - 0.3).abs() < 1e-9);
        assert!((stats.avg_fill_price - 15_000.2 / 0.3).abs() < 1e-6);
    }

    #[test]
    fn calibration_buckets_are_quantiled() {
        // 4 submits: queue 1,2,3,4; filled,filled,missed,missed → 2 buckets.
        let submits = vec![(1.0, true), (2.0, true), (3.0, false), (4.0, false)];
        let buckets = queue_fill_calibration(&submits, 2);
        assert_eq!(buckets.len(), 2);
        assert_eq!(buckets[0].fill_rate, 1.0);
        assert_eq!(buckets[1].fill_rate, 0.0);
        assert!((buckets[0].avg_queue_ahead - 1.5).abs() < 1e-9);
        assert!((buckets[1].avg_queue_ahead - 3.5).abs() < 1e-9);
        assert!(queue_fill_calibration(&[], 4).is_empty());
    }

    #[test]
    fn latency_totals_reconcile() {
        let events = vec![
            fill(1, Side::Bid, 50_000.0, 0.1),
            fill(2, Side::Ask, 50_001.0, 0.2),
        ];
        let stats = latency_stats(&events).expect("non-empty");
        assert_eq!(stats.count, 2);
        // Each row totals 3000 → mean/p50/p90/p99 all 3000.
        assert_eq!(stats.mean_ns, 3_000.0);
        assert_eq!(stats.p50_ns, 3_000.0);
        assert_eq!(stats.p90_ns, 3_000.0);
        assert_eq!(stats.p99_ns, 3_000.0);
        assert_eq!(stats.component_means_ns, (800.0, 400.0, 1_200.0, 600.0));
        assert!(stats.reconciliation_gap_ns.abs() < 1e-9);
        assert!(latency_stats(&[]).is_none());
    }
}
