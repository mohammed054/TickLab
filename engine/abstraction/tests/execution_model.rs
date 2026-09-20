//! Block 2.3 acceptance: every `docs/08` §8.7 execution-model field is settable
//! via the API and demonstrably affects backtest behavior.
//!
//! All assertions run against the REAL vendored `hftbacktest` models (fee math,
//! asset math, latency delays, exchange-processor selection, queue estimators
//! over a real `HashMapMarketDepth`, and a real `Backtest` run) — no mocks,
//! no re-implemented engine math (`AGENTS.md` §5.3, §5.7).

use std::sync::Arc;

use hftbacktest::backtest::assettype::AssetType as VendorAssetTypeTrait;
use hftbacktest::backtest::data::Data;
use hftbacktest::backtest::models::{FeeModel, LatencyModel, QueueModel};
use hftbacktest::backtest::DataSource;
use hftbacktest::depth::{HashMapMarketDepth, L2MarketDepth, MarketDepth};
use hftbacktest::types::{Bot, Event, OrdType, Order, Side, TimeInForce, EXCH_EVENT, LOCAL_EVENT};
use ticklab_engine_abstraction::contract::SimulatorContract;
use ticklab_engine_abstraction::error::EngineError;
use ticklab_engine_abstraction::execution_model::{
    build_exchange_kind, build_fee_model, build_fixed_latency, build_log2_queue,
    build_power2_queue, build_power3_queue, build_power_queue, build_probabilistic_queue,
    build_risk_adverse_queue, check_order_allowed, map_order_type, parse_queue_preset,
    resolve_execution_model, ProbFuncKind, QueuePreset, ResolvedExecutionModel, ResolvedLatency,
    ResolvedQueue, VendorAssetType, VendorOrderKind, PARAM_ASSET_TYPE, PARAM_CONTRACT_SIZE,
    PARAM_LATENCY_ENTRY_NS, PARAM_LATENCY_RESPONSE_NS, PARAM_QUEUE_POWER_N, PARAM_QUEUE_PROB_FUNC,
};
use ticklab_engine_abstraction::hftbacktest_impl::{HftbacktestConfig, HftbacktestEngine};
use ticklab_engine_abstraction::types::{
    BacktestRequest, ExecutionModelConfig, LatencyModelKind, NamedParameter, OrderType,
    ParameterValue, RiskLimitsConfig, StrategyRef, TimestampRange,
};

fn num(name: &str, value: f64) -> NamedParameter {
    NamedParameter {
        name: name.to_string(),
        value: ParameterValue::Number(value),
    }
}

fn text(name: &str, value: &str) -> NamedParameter {
    NamedParameter {
        name: name.to_string(),
        value: ParameterValue::Text(value.to_string()),
    }
}

fn execution_model() -> ExecutionModelConfig {
    ExecutionModelConfig {
        maker_fee_pct: 0.02,
        taker_fee_pct: 0.05,
        tick_size: 0.1,
        lot_size: 0.001,
        latency_model: LatencyModelKind::Fixed,
        queue_model_preset: "probabilistic".to_string(),
        allow_partial_fills: true,
        order_types_allowed: vec![OrderType::Limit, OrderType::Market],
    }
}

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
        execution_model: execution_model(),
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
fn queue_presets_parse_to_finalized_set() {
    // Task 2.3.B: the doc's UI preset names resolve to the finalized set.
    assert_eq!(
        parse_queue_preset("risk-averse").unwrap(),
        QueuePreset::RiskAverse
    );
    assert_eq!(
        parse_queue_preset("probabilistic").unwrap(),
        QueuePreset::Probabilistic
    );
    assert_eq!(parse_queue_preset("power").unwrap(), QueuePreset::Power);
    assert_eq!(parse_queue_preset("custom").unwrap(), QueuePreset::Custom);
    // Tolerant spelling, same presets.
    assert_eq!(
        parse_queue_preset("Risk_Averse").unwrap(),
        QueuePreset::RiskAverse
    );
    assert_eq!(
        parse_queue_preset("PROBABILISTIC").unwrap(),
        QueuePreset::Probabilistic
    );
    // Unknown presets are typed errors, never silent fallbacks.
    assert!(matches!(
        parse_queue_preset("aggressive"),
        Err(EngineError::InvalidRequest(_))
    ));
    assert!(matches!(
        parse_queue_preset(""),
        Err(EngineError::InvalidRequest(_))
    ));
    // Canonical strings round-trip.
    assert_eq!(QueuePreset::RiskAverse.as_str(), "risk-averse");
    assert_eq!(QueuePreset::Probabilistic.as_str(), "probabilistic");
    assert_eq!(QueuePreset::Power.as_str(), "power");
    assert_eq!(QueuePreset::Custom.as_str(), "custom");
}

#[test]
fn fee_preset_affects_cost() {
    // Fee per trading value, maker/taker variants (`docs/04` §4.4 fee row,
    // `docs/08` §8.7 maker/taker fields): hand-computed — 200_000 notional at
    // 0.02% maker = 40.0, at 0.05% taker = 100.0.
    let resolved = resolve_execution_model(&execution_model(), &[]).unwrap();
    assert!((resolved.maker_rate - 0.0002).abs() < 1e-12);
    assert!((resolved.taker_rate - 0.0005).abs() < 1e-12);
    let fees = build_fee_model(&resolved);

    let mut maker = Order::new(
        1,
        100,
        0.1,
        1.0,
        Side::Buy,
        OrdType::Limit,
        TimeInForce::GTC,
    );
    maker.maker = true;
    assert!((fees.amount(&maker, 200_000.0) - 40.0).abs() < 1e-9);

    let mut taker = Order::new(
        2,
        100,
        0.1,
        1.0,
        Side::Buy,
        OrdType::Market,
        TimeInForce::IOC,
    );
    taker.maker = false;
    assert!((fees.amount(&taker, 200_000.0) - 100.0).abs() < 1e-9);

    // Zero fees stay zero — the field demonstrably drives the charge.
    let mut no_fee = execution_model();
    no_fee.maker_fee_pct = 0.0;
    no_fee.taker_fee_pct = 0.0;
    let resolved = resolve_execution_model(&no_fee, &[]).unwrap();
    let fees = build_fee_model(&resolved);
    assert_eq!(fees.amount(&maker, 200_000.0), 0.0);
    assert_eq!(fees.amount(&taker, 200_000.0), 0.0);
}

#[test]
fn asset_kind_changes_contract_math() {
    // Linear vs. inverse contract math (`docs/04` §4.4 AssetType row),
    // hand-computed: Linear(1.0).amount(100, 2) = 200;
    // equity(100, 1000, 2, 1) = 1000 + 200 - 1 = 1199.
    // Inverse(1.0).amount(100, 2) = 0.02;
    // equity(100, -50, 2, 1) = 50 - 0.02 - 1 = 48.98.
    let linear = VendorAssetType::build(&resolve_execution_model(&execution_model(), &[]).unwrap());
    assert!((linear.amount(100.0, 2.0) - 200.0).abs() < 1e-12);
    assert!((linear.equity(100.0, 1000.0, 2.0, 1.0) - 1199.0).abs() < 1e-9);

    let params = vec![text(PARAM_ASSET_TYPE, "inverse")];
    let inverse =
        VendorAssetType::build(&resolve_execution_model(&execution_model(), &params).unwrap());
    assert!((inverse.amount(100.0, 2.0) - 0.02).abs() < 1e-12);
    assert!((inverse.equity(100.0, -50.0, 2.0, 1.0) - 48.98).abs() < 1e-9);

    // Contract size scales the notional: Linear(2.0).amount(100, 2) = 400.
    let params = vec![num(PARAM_CONTRACT_SIZE, 2.0)];
    let sized =
        VendorAssetType::build(&resolve_execution_model(&execution_model(), &params).unwrap());
    assert!((sized.amount(100.0, 2.0) - 400.0).abs() < 1e-12);

    assert!(matches!(
        resolve_execution_model(&execution_model(), &[text(PARAM_ASSET_TYPE, "quanto")]),
        Err(EngineError::InvalidRequest(_))
    ));
}

#[test]
fn exchange_kind_follows_partial_fill_toggle() {
    use hftbacktest::backtest::ExchangeKind as VendorExchangeKind;

    let mut exec = execution_model();
    exec.allow_partial_fills = true;
    let resolved = resolve_execution_model(&exec, &[]).unwrap();
    assert!(matches!(
        build_exchange_kind(&resolved),
        VendorExchangeKind::PartialFillExchange
    ));

    exec.allow_partial_fills = false;
    let resolved = resolve_execution_model(&exec, &[]).unwrap();
    assert!(matches!(
        build_exchange_kind(&resolved),
        VendorExchangeKind::NoPartialFillExchange
    ));
}

#[test]
fn latency_fixed_sets_entry_and_response_delays() {
    // Fixed delays are honored verbatim — different values delay orders
    // differently, which is what shifts fill timing in a run.
    let params = vec![
        num(PARAM_LATENCY_ENTRY_NS, 50.0),
        num(PARAM_LATENCY_RESPONSE_NS, 70.0),
    ];
    let resolved = resolve_execution_model(&execution_model(), &params).unwrap();
    assert_eq!(
        resolved.latency,
        ResolvedLatency::Fixed {
            entry_ns: 50,
            response_ns: 70
        }
    );
    let latency = build_fixed_latency(&resolved).expect("fixed builds ConstantLatency");
    let order = Order::new(
        1,
        100,
        0.1,
        1.0,
        Side::Buy,
        OrdType::Limit,
        TimeInForce::GTC,
    );
    let mut latency = latency;
    assert_eq!(latency.entry(0, &order), 50);
    assert_eq!(latency.response(0, &order), 70);

    // Defaults are zero artificial delay.
    let resolved = resolve_execution_model(&execution_model(), &[]).unwrap();
    let latency = build_fixed_latency(&resolved).expect("fixed builds");
    let mut latency = latency;
    assert_eq!(latency.entry(0, &order), 0);
    assert_eq!(latency.response(0, &order), 0);

    // Empirical requires its data file; custom resolves as a descriptor whose
    // construction needs a user trait impl at run time.
    let mut exec = execution_model();
    exec.latency_model = LatencyModelKind::Empirical {
        data_file: String::new(),
    };
    assert!(matches!(
        resolve_execution_model(&exec, &[]),
        Err(EngineError::InvalidRequest(_))
    ));
    exec.latency_model = LatencyModelKind::Empirical {
        data_file: "latency_20240215.npz".to_string(),
    };
    let resolved = resolve_execution_model(&exec, &[]).unwrap();
    assert_eq!(
        resolved.latency,
        ResolvedLatency::Empirical {
            data_file: "latency_20240215.npz".to_string()
        }
    );
    assert!(build_fixed_latency(&resolved).is_none());

    exec.latency_model = LatencyModelKind::Custom;
    let resolved = resolve_execution_model(&exec, &[]).unwrap();
    assert_eq!(resolved.latency, ResolvedLatency::Custom);
    assert!(build_fixed_latency(&resolved).is_none());

    // Negative fixed latency is rejected (upstream gives negative latency a
    // rejection meaning — never implied by §8.7's "fixed").
    assert!(matches!(
        resolve_execution_model(&execution_model(), &[num(PARAM_LATENCY_ENTRY_NS, -5.0)]),
        Err(EngineError::InvalidRequest(_))
    ));
}

#[test]
fn queue_preset_selects_distinct_upstream_models() {
    // Each preset constructs its finalized upstream model over a real depth.
    let mut depth = HashMapMarketDepth::new(1.0, 1.0);
    depth.update_bid_depth(100.0, 10.0, 0);

    let risk = build_risk_adverse_queue::<HashMapMarketDepth>();
    let prob = build_probabilistic_queue::<HashMapMarketDepth>();
    let power = build_power_queue::<HashMapMarketDepth>(2.0);
    let log2 = build_log2_queue::<HashMapMarketDepth>();
    let power2 = build_power2_queue::<HashMapMarketDepth>(2.0);
    let power3 = build_power3_queue::<HashMapMarketDepth>(3.0);

    // All six are usable estimators over the same book: each accepts a new
    // order at the 10-lot bid level without error.
    let mut orders = Vec::new();
    for (i, mut order) in [
        Order::new(
            101,
            100,
            1.0,
            1.0,
            Side::Buy,
            OrdType::Limit,
            TimeInForce::GTC,
        ),
        Order::new(
            102,
            100,
            1.0,
            1.0,
            Side::Buy,
            OrdType::Limit,
            TimeInForce::GTC,
        ),
        Order::new(
            103,
            100,
            1.0,
            1.0,
            Side::Buy,
            OrdType::Limit,
            TimeInForce::GTC,
        ),
        Order::new(
            104,
            100,
            1.0,
            1.0,
            Side::Buy,
            OrdType::Limit,
            TimeInForce::GTC,
        ),
        Order::new(
            105,
            100,
            1.0,
            1.0,
            Side::Buy,
            OrdType::Limit,
            TimeInForce::GTC,
        ),
        Order::new(
            106,
            100,
            1.0,
            1.0,
            Side::Buy,
            OrdType::Limit,
            TimeInForce::GTC,
        ),
    ]
    .into_iter()
    .enumerate()
    {
        match i {
            0 => risk.new_order(&mut order, &depth),
            1 => prob.new_order(&mut order, &depth),
            2 => power.new_order(&mut order, &depth),
            3 => log2.new_order(&mut order, &depth),
            4 => power2.new_order(&mut order, &depth),
            _ => power3.new_order(&mut order, &depth),
        }
        orders.push(order);
    }
    assert_eq!(orders.len(), 6);

    // The resolved descriptors are distinct per preset.
    let params = vec![num(PARAM_QUEUE_POWER_N, 3.0)];
    let mut exec = execution_model();
    for (preset, expected) in [
        ("risk-averse", ResolvedQueue::RiskAverse),
        ("probabilistic", ResolvedQueue::Probabilistic),
        ("power", ResolvedQueue::Power { n: 3.0 }),
    ] {
        exec.queue_model_preset = preset.to_string();
        let resolved = resolve_execution_model(&exec, &params).unwrap();
        assert_eq!(resolved.queue, expected);
    }
    exec.queue_model_preset = "custom".to_string();
    let params = vec![
        text(PARAM_QUEUE_PROB_FUNC, "power3"),
        num(PARAM_QUEUE_POWER_N, 3.0),
    ];
    let resolved = resolve_execution_model(&exec, &params).unwrap();
    assert_eq!(
        resolved.queue,
        ResolvedQueue::Custom {
            func: ProbFuncKind::Power3,
            n: 3.0
        }
    );
    // `custom` without a func is a typed error, not a guess.
    assert!(matches!(
        resolve_execution_model(&exec, &[]),
        Err(EngineError::InvalidRequest(_))
    ));
}

#[test]
fn queue_preset_changes_fill_timing() {
    // Acceptance centerpiece (`docs/16` Block 2.3): the same order under the
    // same market events fills at different times purely because the queue
    // preset differs. Hand-verified against the upstream estimators
    // (`models/queue.rs`): after a 10-lot trade and two cancel-driven depth
    // drops (20 → 15 → 12, no intervening trades), the risk-averse front
    // estimate stays 10.0 (advances on trades only) while the power-law
    // probabilistic estimate advances to 7.6 (front 10, back 5,
    // p = 25/(25+100) = 0.2, est = 10 − 0.8·3 = 7.6). A further 9-lot trade
    // then fills the probabilistic order (1.0) while the risk-averse order
    // rests (0.0).
    let mut depth = HashMapMarketDepth::new(1.0, 1.0);
    depth.update_bid_depth(100.0, 20.0, 0);

    let risk = build_risk_adverse_queue::<HashMapMarketDepth>();
    let power = build_power_queue::<HashMapMarketDepth>(2.0);
    let mut risk_order = Order::new(
        1,
        100,
        1.0,
        1.0,
        Side::Buy,
        OrdType::Limit,
        TimeInForce::GTC,
    );
    let mut power_order = Order::new(
        2,
        100,
        1.0,
        1.0,
        Side::Buy,
        OrdType::Limit,
        TimeInForce::GTC,
    );
    risk.new_order(&mut risk_order, &depth);
    power.new_order(&mut power_order, &depth);

    risk.trade(&mut risk_order, 10.0, &depth);
    power.trade(&mut power_order, 10.0, &depth);

    depth.update_bid_depth(100.0, 15.0, 0);
    risk.depth(&mut risk_order, 20.0, 15.0, &depth);
    power.depth(&mut power_order, 20.0, 15.0, &depth);

    depth.update_bid_depth(100.0, 12.0, 0);
    risk.depth(&mut risk_order, 15.0, 12.0, &depth);
    power.depth(&mut power_order, 15.0, 12.0, &depth);

    risk.trade(&mut risk_order, 9.0, &depth);
    power.trade(&mut power_order, 9.0, &depth);

    assert_eq!(risk.is_filled(&mut risk_order, &depth), 0.0);
    assert_eq!(power.is_filled(&mut power_order, &depth), 1.0);
}

#[test]
fn risk_averse_preset_is_conservative_vs_power() {
    // Property guard over a deterministic pseudo-random L2 event stream
    // (xorshift, fixed seed): the risk-averse estimator must never report a
    // larger fill than the power-law probabilistic estimator at any step —
    // it advances on trades only, while the probabilistic one additionally
    // advances on cancel-driven depth drops. Checked on clones so the
    // fill-query mutation (`is_filled` resets a filled estimate) cannot
    // disturb the lockstep pair.
    let mut depth = HashMapMarketDepth::new(1.0, 1.0);
    depth.update_bid_depth(100.0, 10.0, 0);

    let risk = build_risk_adverse_queue::<HashMapMarketDepth>();
    let power = build_power_queue::<HashMapMarketDepth>(2.0);
    let mut risk_order = Order::new(
        1,
        100,
        1.0,
        1.0,
        Side::Buy,
        OrdType::Limit,
        TimeInForce::GTC,
    );
    let mut power_order = Order::new(
        2,
        100,
        1.0,
        1.0,
        Side::Buy,
        OrdType::Limit,
        TimeInForce::GTC,
    );
    risk.new_order(&mut risk_order, &depth);
    power.new_order(&mut power_order, &depth);

    let mut state: u64 = 0x1234_5678_9abc_def1;
    let mut next = move || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state
    };
    let mut level = 10.0f64;
    for _ in 0..200 {
        if next() % 2 == 0 {
            let qty = (next() % 5 + 1) as f64;
            risk.trade(&mut risk_order, qty, &depth);
            power.trade(&mut power_order, qty, &depth);
        } else {
            let delta = (next() % 7) as f64 - 3.0;
            let new_level = (level + delta).clamp(1.0, 20.0);
            depth.update_bid_depth(100.0, new_level, 0);
            risk.depth(&mut risk_order, level, new_level, &depth);
            power.depth(&mut power_order, level, new_level, &depth);
            level = new_level;
        }
        let risk_fill = risk.is_filled(&mut risk_order.clone(), &depth);
        let power_fill = power.is_filled(&mut power_order.clone(), &depth);
        assert!(
            power_fill >= risk_fill,
            "risk-averse filled {risk_fill} but power filled {power_fill}"
        );
    }
    let _ = depth.lot_size();
}

#[test]
fn order_types_allowed_is_enforced() {
    let resolved = resolve_execution_model(&execution_model(), &[]).unwrap();
    // Enabled types pass and map to their vendor counterparts.
    assert_eq!(
        check_order_allowed(&resolved, OrderType::Limit).unwrap(),
        VendorOrderKind::Limit
    );
    assert_eq!(
        check_order_allowed(&resolved, OrderType::Market).unwrap(),
        VendorOrderKind::Market
    );
    // A mappable but disabled type is rejected (the §8.7 gate).
    assert!(matches!(
        check_order_allowed(&resolved, OrderType::Gtc),
        Err(EngineError::InvalidRequest(_))
    ));
    // Reduce-only has no upstream counterpart — rejected even when enabled.
    let mut exec = execution_model();
    exec.order_types_allowed = vec![OrderType::ReduceOnly];
    let resolved = resolve_execution_model(&exec, &[]).unwrap();
    assert!(matches!(
        check_order_allowed(&resolved, OrderType::ReduceOnly),
        Err(EngineError::Unsupported(_))
    ));
    assert!(matches!(
        map_order_type(OrderType::ReduceOnly),
        Err(EngineError::Unsupported(_))
    ));
    // The remaining mappings cover TimeInForce.
    assert_eq!(
        map_order_type(OrderType::Gtc).unwrap(),
        VendorOrderKind::Gtc
    );
    assert_eq!(
        map_order_type(OrderType::PostOnly).unwrap(),
        VendorOrderKind::PostOnly
    );
    assert_eq!(
        map_order_type(OrderType::Ioc).unwrap(),
        VendorOrderKind::Ioc
    );
    assert_eq!(
        map_order_type(OrderType::Fok).unwrap(),
        VendorOrderKind::Fok
    );
}

#[test]
fn resolve_rejects_malformed_execution_models() {
    let mut exec = execution_model();
    exec.maker_fee_pct = f64::NAN;
    assert!(matches!(
        resolve_execution_model(&exec, &[]),
        Err(EngineError::InvalidRequest(_))
    ));
    let mut exec = execution_model();
    exec.taker_fee_pct = 101.0;
    assert!(matches!(
        resolve_execution_model(&exec, &[]),
        Err(EngineError::InvalidRequest(_))
    ));
    let mut exec = execution_model();
    exec.tick_size = 0.0;
    assert!(matches!(
        resolve_execution_model(&exec, &[]),
        Err(EngineError::InvalidRequest(_))
    ));
    let mut exec = execution_model();
    exec.lot_size = -1.0;
    assert!(matches!(
        resolve_execution_model(&exec, &[]),
        Err(EngineError::InvalidRequest(_))
    ));
    let mut exec = execution_model();
    exec.queue_model_preset = "ultra-fill".to_string();
    assert!(matches!(
        resolve_execution_model(&exec, &[]),
        Err(EngineError::InvalidRequest(_))
    ));
    let mut exec = execution_model();
    exec.queue_model_preset = "power".to_string();
    assert!(matches!(
        resolve_execution_model(&exec, &[num(PARAM_QUEUE_POWER_N, 0.0)]),
        Err(EngineError::InvalidRequest(_))
    ));
    // Wrong parameter value type is rejected, not coerced (power preset
    // actually reads `queue_power_n`, unlike the default probabilistic one).
    let mut exec = execution_model();
    exec.queue_model_preset = "power".to_string();
    assert!(matches!(
        resolve_execution_model(
            &exec,
            &[NamedParameter {
                name: PARAM_QUEUE_POWER_N.to_string(),
                value: ParameterValue::Flag(true),
            }]
        ),
        Err(EngineError::InvalidRequest(_))
    ));
}

#[test]
fn from_request_carries_resolved_execution() {
    // The §8.7 fields flow from API request into simulator config.
    let config = HftbacktestConfig::from_request(&fixture_request()).unwrap();
    assert!((config.execution_model().maker_rate - 0.0002).abs() < 1e-12);
    assert!((config.execution_model().taker_rate - 0.0005).abs() < 1e-12);
    assert_eq!(config.execution_model().queue, ResolvedQueue::Probabilistic);
    assert!(config.execution_model().allow_partial_fills);

    // And an unknown queue preset fails the whole request at the API boundary.
    let engine = HftbacktestEngine::new(HftbacktestConfig::default());
    let mut bad = fixture_request();
    bad.execution_model.queue_model_preset = "ultra-fill".to_string();
    assert!(matches!(
        engine.start_backtest(bad),
        Err(EngineError::InvalidRequest(_))
    ));

    // The valid fixture still starts (no regression on the 2.2 path).
    let handle = engine
        .start_backtest(fixture_request())
        .expect("valid fixture starts");
    let _ = Arc::clone(&handle);
}

#[test]
fn resolved_models_drive_a_real_vendor_backtest() {
    // End-to-end: models built from a resolved §8.7 config compose into a real
    // vendor `L2AssetBuilder` + `Backtest` run over in-memory feed data.
    use hftbacktest::backtest::{Backtest, L2AssetBuilder};

    let params = vec![
        num(PARAM_LATENCY_ENTRY_NS, 0.0),
        num(PARAM_LATENCY_RESPONSE_NS, 0.0),
    ];
    let resolved = resolve_execution_model(&execution_model(), &params).unwrap();
    let fee_model = build_fee_model(&resolved);
    let asset_type = VendorAssetType::build(&resolved);
    let latency = build_fixed_latency(&resolved).expect("fixed latency");
    let exchange = build_exchange_kind(&resolved);

    let data = Data::from_data(&[
        Event {
            ev: EXCH_EVENT | LOCAL_EVENT,
            exch_ts: 0,
            local_ts: 0,
            px: 0.0,
            qty: 0.0,
            order_id: 0,
            ival: 0,
            fval: 0.0,
        },
        Event {
            ev: LOCAL_EVENT | EXCH_EVENT,
            exch_ts: 1,
            local_ts: 1,
            px: 0.0,
            qty: 0.0,
            order_id: 0,
            ival: 0,
            fval: 0.0,
        },
    ]);

    let mut backtester = Backtest::builder()
        .add_asset(
            L2AssetBuilder::default()
                .data(vec![DataSource::Data(data)])
                .latency_model(latency)
                .asset_type(asset_type)
                .fee_model(fee_model)
                .queue_model(build_risk_adverse_queue::<HashMapMarketDepth>())
                .exchange(exchange)
                .depth(|| HashMapMarketDepth::new(0.01, 1.0))
                .build()
                .expect("asset builds from resolved execution model"),
        )
        .build()
        .expect("backtest builds");

    backtester.elapse(1).expect("clock initializes");
    backtester
        .submit_buy_order(0, 1, 100.0, 1.0, TimeInForce::GTC, OrdType::Limit, false)
        .expect("order submits through the wired asset");
    backtester.goto_end().expect("run completes");
    assert_eq!(backtester.position(0), 0.0);
    assert!(backtester.orders(0).contains_key(&1));
    assert_eq!(
        ResolvedExecutionModel::default().queue,
        ResolvedQueue::RiskAverse
    );
}
