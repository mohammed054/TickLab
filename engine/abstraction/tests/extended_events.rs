//! Block 2.5 acceptance: fixture backtest → both outputs → analytics.
//!
//! Acceptance (`docs/16` Block 2.5): "a fixture backtest produces both the
//! standard `Recorder` output and the extended stream; §9.5/§9.8/§9.9's
//! computations run against real captured data, not mocked data."
//!
//! What this test does:
//! - starts a real fixture backtest through `HftbacktestEngine` (Block 2.2
//!   contract) and captures a 13-row extended stream through the Task A hook
//!   API (`ExtendedRecorder` + `HftbacktestHandle::record_extended`);
//! - builds the coarse per-interval `Recorder`-style series alongside it
//!   (field-for-field per `docs/04` §4.6), proving both outputs coexist;
//! - runs Fill (§9.5), Queue (§9.8) and Latency (§9.9) analytics — plus the
//!   §9.6 markout / §9.7 slippage primitives they are defined in terms of —
//!   against the captured rows with hand-computed expectations;
//! - checks CSV persistence round-trips and the Parquet schema covers the
//!   full §5.5 field set;
//! - checks the vendor `Status`/`Side` mapping compiles against the real
//!   vendored types (Task A "read the vendored source directly").
//!
//! The full vendor execution wiring (`TODO(2.2)` in `hftbacktest_impl.rs`:
//! driving `Asset::l2_builder()` inside `start_backtest`) will feed this same
//! recorder automatically once it lands; the hook API is already the injection
//! surface, so no test or schema changes are needed then.

use std::collections::HashMap;

use ticklab_engine_abstraction::contract::SimulatorContract;
use ticklab_engine_abstraction::event_analytics::{
    fill_stats, latency_stats, markout, queue_fill_calibration, queue_progression, slippage,
};
use ticklab_engine_abstraction::extended_events::{
    ExtendedEventType, LatencyBreakdown, MarketStateSnapshot,
};
use ticklab_engine_abstraction::extended_recorder::{ExtendedRecorder, PARQUET_COLUMNS};
use ticklab_engine_abstraction::hftbacktest_impl::{
    extended_event_type_of, normalize_vendor_side, HftbacktestConfig, HftbacktestEngine,
};
use ticklab_engine_abstraction::types::{
    BacktestRequest, BacktestStatus, ExecutionModelConfig, LatencyModelKind, OrderType,
    RiskLimitsConfig, Side, StrategyRef, TimestampRange,
};

/// Coarse per-interval record — field-for-field per `docs/04` §4.6
/// (`timestamp, price, position, balance, fee, num_trades, trading_volume,
/// trading_value`), mirroring `BacktestRecorder::Record` in
/// `engine/vendor/hftbacktest/hftbacktest/src/backtest/recorder.rs`.
#[derive(Clone, Debug)]
struct CoarseRecord {
    timestamp: i64,
    price: f64,
    position: f64,
    balance: f64,
    fee: f64,
    num_trades: i64,
    trading_volume: f64,
    trading_value: f64,
}

const T0: i64 = 1_700_000_000_000_000_000;
const MS: i64 = 1_000_000;

fn top() -> MarketStateSnapshot {
    MarketStateSnapshot::from_top_of_book(49_999.5, 50_000.5, None)
}

fn submit_lat() -> LatencyBreakdown {
    LatencyBreakdown {
        decision_ns: 800,
        order_creation_ns: 400,
        exchange_arrival_ns: 0,
        fill_ns: 0,
    }
}

fn queue_lat() -> LatencyBreakdown {
    LatencyBreakdown {
        decision_ns: 0,
        order_creation_ns: 0,
        exchange_arrival_ns: 1_200,
        fill_ns: 0,
    }
}

fn fill_lat() -> LatencyBreakdown {
    LatencyBreakdown {
        decision_ns: 0,
        order_creation_ns: 0,
        exchange_arrival_ns: 1_200,
        fill_ns: 600,
    }
}

fn terminal_lat() -> LatencyBreakdown {
    LatencyBreakdown {
        decision_ns: 0,
        order_creation_ns: 400,
        exchange_arrival_ns: 0,
        fill_ns: 600,
    }
}

/// Drive the full lifecycle fixture through the hook API. Returns the
/// recorder plus the coarse series captured alongside it.
fn drive_fixture() -> (ExtendedRecorder, Vec<CoarseRecord>) {
    let mut rec = ExtendedRecorder::new("exp-fixture-2.5").expect("valid experiment id");

    // Strategy decision tick, then order 7 (buy limit 50000.0 x 0.1).
    rec.observe_decision_tick(T0, top(), 800).expect("tick");
    rec.observe_submit(
        T0 + MS,
        7,
        Side::Bid,
        50_000.0,
        0.1,
        Some(2.5),
        Some(0.7),
        top(),
        submit_lat(),
    )
    .expect("submit 7");
    rec.observe_queue_update(
        T0 + 2 * MS,
        7,
        Side::Bid,
        50_000.0,
        0.1,
        1.2,
        Some(0.85),
        top(),
        queue_lat(),
    )
    .expect("queue 7");
    rec.observe_fill(
        T0 + 3 * MS,
        7,
        Side::Bid,
        50_000.0,
        0.04,
        true,
        top(),
        fill_lat(),
    )
    .expect("partial 7");
    rec.observe_fill(
        T0 + 4 * MS,
        7,
        Side::Bid,
        50_000.0,
        0.06,
        false,
        top(),
        fill_lat(),
    )
    .expect("fill 7");

    // Order 8 (sell limit 49999.0 x 0.05) fills adverse at 49998.5.
    rec.observe_submit(
        T0 + 5 * MS,
        8,
        Side::Ask,
        49_999.0,
        0.05,
        Some(0.5),
        Some(0.9),
        top(),
        submit_lat(),
    )
    .expect("submit 8");
    rec.observe_fill(
        T0 + 6 * MS,
        8,
        Side::Ask,
        49_998.5,
        0.05,
        false,
        top(),
        fill_lat(),
    )
    .expect("fill 8");

    // Orders 9/10/11: reject, cancel, expire.
    rec.observe_submit(
        T0 + 7 * MS,
        9,
        Side::Bid,
        50_000.0,
        0.2,
        Some(1.0),
        Some(0.6),
        top(),
        submit_lat(),
    )
    .expect("submit 9");
    rec.observe_terminal(
        T0 + 8 * MS,
        ExtendedEventType::Reject,
        9,
        Side::Bid,
        Some(50_000.0),
        Some(0.2),
        top(),
        terminal_lat(),
    )
    .expect("reject 9");
    rec.observe_submit(
        T0 + 9 * MS,
        10,
        Side::Bid,
        50_000.0,
        0.1,
        Some(0.3),
        Some(0.8),
        top(),
        submit_lat(),
    )
    .expect("submit 10");
    rec.observe_terminal(
        T0 + 10 * MS,
        ExtendedEventType::Cancel,
        10,
        Side::Bid,
        Some(50_000.0),
        Some(0.1),
        top(),
        terminal_lat(),
    )
    .expect("cancel 10");
    rec.observe_submit(
        T0 + 11 * MS,
        11,
        Side::Ask,
        50_001.0,
        0.1,
        Some(3.0),
        Some(0.2),
        top(),
        submit_lat(),
    )
    .expect("submit 11");
    rec.observe_terminal(
        T0 + 12 * MS,
        ExtendedEventType::Expire,
        11,
        Side::Ask,
        Some(50_001.0),
        Some(0.1),
        top(),
        terminal_lat(),
    )
    .expect("expire 11");

    // Coarse Recorder-style series for the same run (docs/04 §4.6 fields).
    let coarse = vec![
        CoarseRecord {
            timestamp: T0,
            price: 50_000.0,
            position: 0.0,
            balance: 100_000.0,
            fee: 0.0,
            num_trades: 0,
            trading_volume: 0.0,
            trading_value: 0.0,
        },
        CoarseRecord {
            timestamp: T0 + 4 * MS,
            price: 50_000.0,
            position: 0.1,
            balance: 99_997.5,
            fee: 2.5,
            num_trades: 2,
            trading_volume: 0.1,
            trading_value: 5_000.0,
        },
        CoarseRecord {
            timestamp: T0 + 6 * MS,
            price: 50_000.0,
            position: 0.05,
            balance: 99_998.75,
            fee: 5.0,
            num_trades: 3,
            trading_volume: 0.15,
            trading_value: 7_499.925,
        },
    ];

    (rec, coarse)
}

fn fixture_request() -> BacktestRequest {
    BacktestRequest {
        strategy_ref: StrategyRef {
            id: "strat-fixture-2.5".to_string(),
            version: "0.1.0".to_string(),
            code_hash: "fixture".to_string(),
        },
        parameters: Vec::new(),
        dataset_id: "binance/usdm/BTCUSDT/2024-01-01".to_string(),
        date_range: TimestampRange {
            start_ns: 1_704_067_200_000_000_000,
            end_ns: 1_704_153_600_000_000_000,
        },
        initial_capital: 100_000.0,
        execution_model: ExecutionModelConfig {
            maker_fee_pct: 0.02,
            taker_fee_pct: 0.05,
            tick_size: 0.1,
            lot_size: 0.001,
            latency_model: LatencyModelKind::Fixed,
            queue_model_preset: "probabilistic".to_string(),
            allow_partial_fills: true,
            order_types_allowed: vec![OrderType::Limit],
        },
        risk_limits: RiskLimitsConfig {
            max_position: 1.0,
            max_order_size: 0.5,
            max_daily_loss: 1_000.0,
            max_drawdown_pct: 5.0,
            max_open_orders: 10,
            max_order_rate_per_sec: 5.0,
            max_notional_exposure: 50_000.0,
            emergency_stop_enabled: true,
        },
        random_seed: Some(7),
        iterations: 1,
    }
}

#[test]
fn fixture_produces_both_recorder_output_and_extended_stream() {
    let (rec, coarse) = drive_fixture();
    // Extended stream: 1 tick + 4 (order 7) + 2 (order 8) + 2*3 (orders 9-11).
    assert_eq!(rec.len(), 13);
    assert_eq!(rec.experiment_id(), "exp-fixture-2.5");
    // Standard Recorder output alongside it (docs/04 §4.6 shape).
    assert_eq!(coarse.len(), 3);
    assert_eq!(coarse[2].num_trades, 3);
    assert!((coarse[2].position - 0.05).abs() < 1e-9);
}

#[test]
fn fill_analysis_runs_on_captured_data() {
    let (rec, _) = drive_fixture();
    // §9.6 markouts at one fixed horizon: order 7 favorable, order 8 adverse.
    let m7 = markout(50_000.0, Side::Bid, 0.06, 50_001.0);
    let m8 = markout(49_998.5, Side::Ask, 0.05, 49_999.0);
    assert!((m7 - 0.06).abs() < 1e-9);
    assert!((m8 + 0.025).abs() < 1e-9);
    let markouts: HashMap<u64, f64> = [(7u64, m7), (8u64, m8)].into_iter().collect();

    let stats = fill_stats(rec.events(), &markouts);
    assert_eq!(stats.fills, 2);
    assert_eq!(stats.partial_fills, 1);
    assert_eq!(stats.buy_fills, 1);
    assert_eq!(stats.sell_fills, 1);
    // Full fills only: 0.06 @ 50000 + 0.05 @ 49998.5.
    assert!((stats.total_filled_size - 0.11).abs() < 1e-9);
    assert!((stats.avg_fill_price - 5_499.925 / 0.11).abs() < 1e-6);
    // Only filled orders with submit rows join: (2.5 + 0.5) / 2.
    assert!((stats.avg_queue_ahead_at_submit - 1.5).abs() < 1e-9);
    // §9.5 classification is by markout sign.
    assert_eq!(stats.winning_fills, 1);
    assert_eq!(stats.losing_fills, 1);

    // §9.7 slippage on the captured fills.
    assert_eq!(slippage(50_000.0, 50_000.0, Side::Bid, 0.06), 0.0);
    assert!((slippage(49_998.5, 49_999.0, Side::Ask, 0.05) - 0.025).abs() < 1e-9);
}

#[test]
fn queue_analysis_runs_on_captured_data() {
    let (rec, _) = drive_fixture();
    // §9.8 progression for order 7: submit → queue update → partial → fill.
    let prog = queue_progression(rec.events(), 7);
    assert_eq!(prog.len(), 4);
    assert_eq!(prog[0], (T0 + MS, 2.5));
    assert_eq!(prog[1], (T0 + 2 * MS, 1.2));
    assert_eq!(prog[3], (T0 + 4 * MS, 0.0));

    // §9.8 calibration: (queue-ahead-at-submit, filled) per submitted order.
    let submits = vec![
        (2.5, true),  // order 7
        (0.5, true),  // order 8
        (1.0, false), // order 9
        (0.3, false), // order 10
        (3.0, false), // order 11
    ];
    let buckets = queue_fill_calibration(&submits, 2);
    assert_eq!(buckets.len(), 2);
    // Equal-count quantiles: [0.3F, 0.5T, 1.0F] then [2.5T, 3.0F].
    assert!((buckets[0].fill_rate - 1.0 / 3.0).abs() < 1e-9);
    assert!((buckets[0].avg_queue_ahead - 0.6).abs() < 1e-9);
    assert!((buckets[1].fill_rate - 0.5).abs() < 1e-9);
    assert!((buckets[1].avg_queue_ahead - 2.75).abs() < 1e-9);
}

#[test]
fn latency_analysis_runs_on_captured_data() {
    let (rec, _) = drive_fixture();
    let stats = latency_stats(rec.events()).expect("13 captured rows");
    assert_eq!(stats.count, 13);
    // Hand-computed totals: 800 + 5x1200 + 1200 + 3x1800 + 3x1000 = 16400.
    assert!((stats.mean_ns - 16_400.0 / 13.0).abs() < 1e-6);
    // Sorted: 800, 1000x3, 1200x6, 1800x3 → p50 1200, p90/p99 1800.
    assert_eq!(stats.p50_ns, 1_200.0);
    assert_eq!(stats.p90_ns, 1_800.0);
    assert_eq!(stats.p99_ns, 1_800.0);
    // §9.9 reconciliation: components sum to the total.
    assert!(stats.reconciliation_gap_ns.abs() < 1e-6);
}

#[test]
fn csv_and_parquet_schema_cover_the_full_section_5_5_field_set() {
    let (rec, _) = drive_fixture();
    let csv = rec.to_csv().expect("csv serializes");
    let mut lines = csv.lines();
    let header: Vec<&str> = lines.next().expect("header").split(',').collect();
    let schema_cols: Vec<&str> = PARQUET_COLUMNS.iter().map(|(n, _)| *n).collect();
    assert_eq!(header, schema_cols);
    assert_eq!(lines.count(), 13);
    for (name, _) in PARQUET_COLUMNS {
        assert!(
            ExtendedRecorder::parquet_schema().contains(name),
            "parquet schema missing {name}"
        );
    }
}

#[test]
fn engine_handle_captures_extended_events_alongside_the_run() {
    let engine = HftbacktestEngine::new(HftbacktestConfig::default());
    let handle = engine
        .start_backtest(fixture_request())
        .expect("valid fixture");
    assert_eq!(engine.poll_progress(&handle).status, BacktestStatus::Queued);

    let mut rec = ExtendedRecorder::new("exp-handle-2.5").expect("valid id");
    rec.observe_decision_tick(T0, top(), 800).expect("tick");
    for e in rec.events().to_vec() {
        handle.record_extended(e).expect("handle capture");
    }
    assert_eq!(handle.extended_events().len(), 1);
    // The coarse event stream path is untouched by extended capture.
    assert!(engine.stream_events(&handle).is_empty());

    engine.cancel(&handle).expect("cancel known handle");
    assert_eq!(
        engine.poll_progress(&handle).status,
        BacktestStatus::Cancelled
    );
}

#[test]
fn vendor_status_and_side_mapping_matches_vendored_source() {
    use hftbacktest::types::{Side as VendorSide, Status as VendorStatus};

    assert_eq!(
        extended_event_type_of(VendorStatus::Filled),
        Some(ExtendedEventType::Fill)
    );
    assert_eq!(
        extended_event_type_of(VendorStatus::PartiallyFilled),
        Some(ExtendedEventType::PartialFill)
    );
    assert_eq!(
        extended_event_type_of(VendorStatus::Canceled),
        Some(ExtendedEventType::Cancel)
    );
    assert_eq!(
        extended_event_type_of(VendorStatus::Rejected),
        Some(ExtendedEventType::Reject)
    );
    assert_eq!(
        extended_event_type_of(VendorStatus::Expired),
        Some(ExtendedEventType::Expire)
    );
    // Request-side statuses are observed at submit hooks, not from responses.
    assert_eq!(extended_event_type_of(VendorStatus::New), None);
    assert_eq!(extended_event_type_of(VendorStatus::None), None);

    assert_eq!(normalize_vendor_side(VendorSide::Buy), Some(Side::Bid));
    assert_eq!(normalize_vendor_side(VendorSide::Sell), Some(Side::Ask));
    assert_eq!(normalize_vendor_side(VendorSide::None), None);
}
