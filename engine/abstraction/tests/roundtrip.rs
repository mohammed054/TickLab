//! Block 2.2 acceptance: round-trip a minimal real backtest.
//!
//! Acceptance (`docs/16` Block 2.2): "a round-trip gRPC call runs a minimal
//! real backtest against a tiny fixture dataset and returns a `BacktestResult`."
//!
//! The engine executes the bundled deterministic fixture (`FIXTURE_DATASET_ID`)
//! through a real `Backtest<MD>` run (`ROIVectorMarketDepth` default, `docs/04`
//! §4.4), so these tests assert real hand-computed numbers, not fabricated ones
//! (`AGENTS.md` §5.3, §5.7):
//!
//! - feed: bid 99 × 10 at T0, ask 101 × 10 at T0 + 1ms (dual EXCH+LOCAL events);
//! - orders: marketable limit buy 1 @ 101 (taker), marketable limit sell 1 @ 99
//!   (taker); each fills immediately at the far touch;
//! - terminal local state: balance −2, position 0, fees 0.10, 2 trades;
//! - metrics per `docs/09` §9.1: net_pnl = (equity − fee) − 0 = −2.10,
//!   final_capital = 100_000 − 2.10 = 99_997.90, return_pct = −0.0021.

use std::collections::HashMap;
use std::sync::Arc;

use ticklab_engine_abstraction::contract::SimulatorContract;
use ticklab_engine_abstraction::error::EngineError;
use ticklab_engine_abstraction::grpc_service::proto;
use ticklab_engine_abstraction::grpc_service::EngineService;
use ticklab_engine_abstraction::hftbacktest_impl::{
    HftbacktestConfig, HftbacktestEngine, MarketDepthKind, FIXTURE_DATASET_ID,
    FIXTURE_FEED_STEP_NS, FIXTURE_T0_NS,
};
use ticklab_engine_abstraction::types::{
    BacktestRequest, BacktestStatus, EventType, ExecutionModelConfig, LatencyModelKind, OrderType,
    RiskLimitsConfig, StrategyRef, TimestampRange,
};

/// Fixture request: runs the engine's bundled deterministic fixture dataset.
fn fixture_request() -> BacktestRequest {
    BacktestRequest {
        strategy_ref: StrategyRef {
            id: "strat-fixture".to_string(),
            version: "0.1.0".to_string(),
            code_hash: "deadbeef".to_string(),
        },
        parameters: Vec::new(),
        dataset_id: FIXTURE_DATASET_ID.to_string(),
        date_range: TimestampRange {
            start_ns: FIXTURE_T0_NS,
            end_ns: FIXTURE_T0_NS + FIXTURE_FEED_STEP_NS + 1,
        },
        initial_capital: 100_000.0,
        execution_model: ExecutionModelConfig {
            maker_fee_pct: 0.02,
            taker_fee_pct: 0.05,
            tick_size: 0.1,
            lot_size: 0.001,
            latency_model: LatencyModelKind::Fixed,
            // The engine currently wires `RiskAdverseQueueModel` unconditionally
            // (the preset list finalizes in Task 2.3.B, `docs/04` §4.4), so the
            // string is honest about that rather than carried opaquely.
            queue_model_preset: "risk_adverse".to_string(),
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
fn non_fixture_dataset_is_unsupported_until_pipeline() {
    let engine = HftbacktestEngine::new(HftbacktestConfig::default());
    let mut req = fixture_request();
    req.dataset_id = "binance/usdm/BTCUSDT/2024-01-01".to_string();
    assert!(matches!(
        engine.start_backtest(req),
        Err(EngineError::Unsupported(_))
    ));
}

#[test]
fn handle_lifecycle_start_poll_complete_collect() {
    let engine = HftbacktestEngine::new(HftbacktestConfig::default());
    let handle = engine
        .start_backtest(fixture_request())
        .expect("valid fixture");

    // Block 2.2 executes the fixture synchronously (a sub-ms run); the gateway
    // job runner (Block 2.8) owns the long-running async path.
    let progress = engine.poll_progress(&handle);
    assert_eq!(progress.status, BacktestStatus::Complete);
    assert_eq!(progress.job_id, handle.id());
    assert_eq!(progress.events_processed, 2);
    assert_eq!(progress.orders_submitted, 2);
    assert_eq!(progress.fills, 2);
    assert_eq!(
        progress.simulated_time_ns,
        FIXTURE_T0_NS + FIXTURE_FEED_STEP_NS
    );

    let result = engine
        .collect_results(&handle)
        .expect("real result collected");
    assert_eq!(result.job_id, handle.id());
    assert!(!result.engine_version.is_empty());
    assert_eq!(result.headline.trades, 2);
    assert!(
        (result.headline.net_pnl - (-2.10)).abs() < 1e-9,
        "net_pnl {}",
        result.headline.net_pnl
    );
    assert!(
        (result.headline.final_capital - 99_997.90).abs() < 1e-9,
        "final_capital {}",
        result.headline.final_capital
    );
    assert!(
        (result.headline.return_pct - (-2.1e-3)).abs() < 1e-9,
        "return_pct {}",
        result.headline.return_pct
    );
    assert!((result.headline.fees - 0.10).abs() < 1e-9);
    assert_eq!(result.headline.fill_rate_pct, 100.0);
    // Block 2.4: series-based headline metrics are populated end to end
    // (hand-derived in `hftbacktest_impl::tests::headline_metrics_are_hand_computed`).
    assert!((result.headline.max_drawdown_pct - 0.0021).abs() < 1e-12);
    let rel = |a: f64, e: f64| (a - e).abs() / e.abs();
    assert!(rel(result.headline.sharpe, -1_076_544_471.91) < 1e-9);
    assert!(rel(result.headline.sortino, -724_982.676_2) < 1e-9);
    // Block 2.5 owns slippage: still NaN, never fabricated.
    assert!(result.headline.slippage.is_nan());
}

#[test]
fn cancel_after_completion_is_sticky_noop() {
    let engine = HftbacktestEngine::new(HftbacktestConfig::default());
    let handle = engine
        .start_backtest(fixture_request())
        .expect("valid fixture");

    engine.cancel(&handle).expect("cancel after completion");
    engine.cancel(&handle).expect("idempotent");
    assert_eq!(
        engine.poll_progress(&handle).status,
        BacktestStatus::Complete
    );
    // Result still collectable after a no-op cancel.
    engine.collect_results(&handle).expect("result preserved");
}

#[test]
fn stream_events_returns_fixture_book_updates() {
    let engine = HftbacktestEngine::new(HftbacktestConfig::default());
    let handle = engine
        .start_backtest(fixture_request())
        .expect("valid fixture");

    let events = engine.stream_events(&handle);
    assert_eq!(events.len(), 2);
    assert!(events.iter().all(|e| e.event_type == EventType::BookUpdate));
    assert!(events
        .iter()
        .all(|e| e.symbol == "BTCUSDT" && e.exchange == "binance"));
    // Bid event precedes ask event, matching the fixture feed timeline.
    assert_eq!(
        events[0].side,
        Some(ticklab_engine_abstraction::types::Side::Bid)
    );
    assert_eq!(events[0].price, Some(99.0));
    assert_eq!(
        events[1].side,
        Some(ticklab_engine_abstraction::types::Side::Ask)
    );
    assert_eq!(events[1].price, Some(101.0));
    assert_eq!(
        events[1].timestamp_ns,
        events[0].timestamp_ns + FIXTURE_FEED_STEP_NS
    );
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

/// The acceptance test itself: a live gRPC round-trip through an in-process
/// tonic server. StartBacktest -> StreamBacktestProgress -> StreamEvents ->
/// CollectResults, over an ephemeral TCP port.
#[tokio::test]
async fn grpc_round_trip_runs_real_backtest() -> Result<(), Box<dyn std::error::Error>> {
    use tokio_stream::wrappers::TcpListenerStream;

    let engine = Arc::new(HftbacktestEngine::new(HftbacktestConfig::default()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;

    let server = Arc::clone(&engine);
    let serve = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::engine_service_server::EngineServiceServer::new(
                EngineService::new(server),
            ))
            .serve_with_incoming(TcpListenerStream::new(listener))
            .await
            .expect("grpc server")
    });

    let mut client =
        proto::engine_service_client::EngineServiceClient::connect(format!("http://{addr}"))
            .await?;

    let request = proto::BacktestRequest {
        strategy_ref: Some(proto::StrategyRef {
            id: "strat-fixture".to_string(),
            version: "0.1.0".to_string(),
            code_hash: "deadbeef".to_string(),
        }),
        parameters: HashMap::new(),
        dataset_id: FIXTURE_DATASET_ID.to_string(),
        date_range: Some(proto::TimestampRange {
            start_ns: FIXTURE_T0_NS,
            end_ns: FIXTURE_T0_NS + FIXTURE_FEED_STEP_NS + 1,
        }),
        initial_capital: 100_000.0,
        execution_model: Some(proto::ExecutionModelConfig {
            maker_fee_pct: 0.02,
            taker_fee_pct: 0.05,
            tick_size: 0.1,
            lot_size: 0.001,
            latency_model: proto::LatencyModelKind::Fixed as i32,
            latency_data_file: String::new(),
            queue_model_preset: "risk_adverse".to_string(),
            allow_partial_fills: true,
            order_types_allowed: vec![proto::OrderType::Limit as i32],
        }),
        risk_limits: Some(proto::RiskLimitsConfig {
            max_position: 1.0,
            max_order_size: 0.5,
            max_daily_loss: 1_000.0,
            max_drawdown_pct: 5.0,
            max_open_orders: 10,
            max_order_rate_per_sec: 5.0,
            max_notional_exposure: 50_000.0,
            emergency_stop_enabled: true,
        }),
        random_seed: Some(42),
        iterations: 1,
    };

    let handle = client.start_backtest(request).await?.into_inner();
    assert!(!handle.handle_id.is_empty());

    // A handle we never created is not found.
    let err = client
        .collect_results(proto::BacktestHandle {
            handle_id: "bt-999".to_string(),
        })
        .await
        .expect_err("unknown handle is not found");
    assert_eq!(err.code(), tonic::Code::NotFound);

    // Progress: exactly one completed message.
    let mut stream = client
        .stream_backtest_progress(proto::BacktestHandle {
            handle_id: handle.handle_id.clone(),
        })
        .await?
        .into_inner();
    let mut last = None;
    while let Some(item) = stream.message().await? {
        last = Some(item);
    }
    let progress = last.ok_or("no progress messages")?;
    assert_eq!(progress.job_id, handle.handle_id);
    assert_eq!(
        proto::BacktestStatus::try_from(progress.status),
        Ok(proto::BacktestStatus::Complete)
    );
    assert_eq!(progress.events_processed, 2);
    assert_eq!(progress.orders_submitted, 2);
    assert_eq!(progress.fills, 2);

    // Events: the two fixture book updates replay through the wire.
    let mut events = client
        .stream_events(proto::BacktestHandle {
            handle_id: handle.handle_id.clone(),
        })
        .await?
        .into_inner();
    let mut count = 0;
    while let Some(ev) = events.message().await? {
        assert_eq!(
            proto::EventType::try_from(ev.event_type),
            Ok(proto::EventType::BookUpdate)
        );
        count += 1;
    }
    assert_eq!(count, 2);

    // Results: real, hand-computed numbers come back over gRPC.
    let result = client
        .collect_results(proto::BacktestHandle {
            handle_id: handle.handle_id,
        })
        .await?
        .into_inner();
    assert_eq!(result.job_id, progress.job_id);
    let headline = result.headline.ok_or("headline missing")?;
    assert_eq!(headline.trades, 2);
    assert!((headline.net_pnl - (-2.10)).abs() < 1e-9);
    assert!((headline.final_capital - 99_997.90).abs() < 1e-9);
    assert!((headline.fees - 0.10).abs() < 1e-9);
    assert_eq!(headline.fill_rate_pct, 100.0);
    // Block 2.4 headline figures survive the proto round-trip.
    assert!((headline.max_drawdown_pct - 0.0021).abs() < 1e-12);
    assert!(headline.sharpe.is_finite() && headline.sharpe < 0.0);
    assert!(headline.sortino.is_finite() && headline.sortino < 0.0);
    assert!(headline.slippage.is_nan());

    serve.abort();
    Ok(())
}
