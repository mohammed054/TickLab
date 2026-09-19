//! Block 2.2 acceptance scaffold: round-trip a minimal backtest.
//!
//! Acceptance (`docs/16` Block 2.2): "a round-trip gRPC call runs a minimal
//! real backtest against a tiny fixture dataset and returns a `BacktestResult`."
//!
//! What runs without the vendor toolchain here:
//! - fixture request construction and structural validation;
//! - the `MarketDepthKind` default (Task 2.2 decision, `docs/04` §4.4);
//! - the handle lifecycle: start -> poll -> cancel -> poll;
//! - protobuf encode/decode round-trip of the fixture messages.
//!
//! The full vendor execution path (`TODO(2.2)` in `hftbacktest_impl.rs`) and
//! the live gRPC round-trip execute once `engine/vendor/hftbacktest` is
//! initialized and a Rust toolchain is available; until then
//! `collect_results` honestly reports `Unsupported` instead of fabricating
//! fills or metrics (`AGENTS.md` §5.3, §5.7).

use std::sync::Arc;

use ticklab_engine_abstraction::contract::SimulatorContract;
use ticklab_engine_abstraction::error::EngineError;
use ticklab_engine_abstraction::grpc_service::proto;
use ticklab_engine_abstraction::hftbacktest_impl::{
    HftbacktestConfig, HftbacktestEngine, MarketDepthKind,
};
use ticklab_engine_abstraction::types::{
    BacktestRequest, BacktestStatus, ExecutionModelConfig, LatencyModelKind, OrderType,
    RiskLimitsConfig, StrategyRef, TimestampRange,
};

/// Tiny fixture request: one BTCUSDT day, one iteration, fixed latency.
fn fixture_request() -> BacktestRequest {
    BacktestRequest {
        strategy_ref: StrategyRef {
            id: "strat-fixture".to_string(),
            version: "0.1.0".to_string(),
            code_hash: "deadbeef".to_string(),
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
            // Preset names finalize in Task 2.3.B (`docs/04` §4.4); this is
            // fixture data, not a finalized preset.
            queue_model_preset: "probabilistic".to_string(),
            allow_partial_fills: true,
            order_types_allowed: vec![OrderType::Limit, OrderType::Market],
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
        random_seed: Some(42),
        iterations: 1,
    }
}

#[test]
fn market_depth_defaults_to_roi_vector() {
    // Task 2.2 decision (`docs/04` §4.4): ROIVectorMarketDepth default for
    // well-bounded markets such as BTC/USDT; BTreeMarketDepth fallback.
    assert_eq!(
        HftbacktestConfig::default().market_depth,
        MarketDepthKind::RoiVector
    );
    assert_eq!(MarketDepthKind::default(), MarketDepthKind::RoiVector);
}

#[test]
fn malformed_requests_are_rejected_with_typed_errors() {
    let engine = HftbacktestEngine::new(HftbacktestConfig::default());

    let mut bad = fixture_request();
    bad.dataset_id.clear();
    assert!(matches!(
        engine.start_backtest(bad),
        Err(EngineError::InvalidRequest(_))
    ));

    let mut bad = fixture_request();
    bad.date_range = TimestampRange {
        start_ns: 2,
        end_ns: 1,
    };
    assert!(matches!(
        engine.start_backtest(bad),
        Err(EngineError::InvalidRequest(_))
    ));

    let mut bad = fixture_request();
    bad.iterations = 0;
    assert!(matches!(
        engine.start_backtest(bad),
        Err(EngineError::InvalidRequest(_))
    ));
}

#[test]
fn handle_lifecycle_start_poll_cancel() {
    let engine = HftbacktestEngine::new(HftbacktestConfig::default());
    let handle = engine.start_backtest(fixture_request()).expect("valid fixture");

    let progress = engine.poll_progress(&handle);
    assert_eq!(progress.status, BacktestStatus::Queued);
    assert_eq!(progress.job_id, handle.id());

    engine.cancel(&handle).expect("cancel known handle");
    assert_eq!(engine.poll_progress(&handle).status, BacktestStatus::Cancelled);

    // No fabricated results: without a vendor run there is nothing to collect.
    assert!(matches!(
        engine.collect_results(&handle),
        Err(EngineError::Unsupported(_))
    ));
}

#[test]
fn cancel_is_idempotent_and_sticky() {
    let engine = HftbacktestEngine::new(HftbacktestConfig::default());
    let handle = engine.start_backtest(fixture_request()).expect("valid fixture");

    engine.cancel(&handle).expect("first cancel");
    engine.cancel(&handle).expect("second cancel is idempotent");
    assert_eq!(engine.poll_progress(&handle).status, BacktestStatus::Cancelled);
    // Handles are engine-scoped: a second engine starts its own id sequence.
    let engine2 = HftbacktestEngine::new(HftbacktestConfig::default());
    let handle2 = engine2.start_backtest(fixture_request()).expect("valid fixture");
    assert_eq!(engine2.poll_progress(&handle2).status, BacktestStatus::Queued);
    let _ = Arc::clone(&handle);
}

#[test]
fn proto_handle_round_trips_through_prost() {
    use prost::Message;

    let handle = proto::BacktestHandle {
        handle_id: "bt-1".to_string(),
    };
    let mut buf = Vec::new();
    handle.encode(&mut buf).expect("encode");
    let back = proto::BacktestHandle::decode(buf.as_slice()).expect("decode");
    assert_eq!(back.handle_id, "bt-1");
}
