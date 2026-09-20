//! Execution-model wiring — Block 2.3.
//!
//! Translates the normalized [`ExecutionModelConfig`](crate::types::ExecutionModelConfig)
//! (the `docs/08-secondary-monitor-components.md` §8.7 panel fields) into the
//! vendored engine's concrete model types, exactly per the mapping table in
//! `docs/04-hftbacktest-engine-analysis.md` §4.4. Per `docs/05` §5.1 this module
//! (alongside `hftbacktest_impl.rs`) is the only place allowed to name
//! `hftbacktest` native types.
//!
//! Task 2.3.B finding (finalized against
//! `engine/vendor/hftbacktest/hftbacktest/src/backtest/models/` — Planner sign-off
//! still required since an Executor may not edit `docs/`): the doc's preset names
//! ("risk-averse," "probabilistic," "power," "custom") are UI names, not upstream
//! type names. The finalized mapping is:
//!
//! | Preset (`queue_model_preset`) | Upstream construction |
//! |---|---|
//! | `"risk-averse"` | `RiskAdverseQueueModel` (note upstream spelling: **Adverse**, not Averse) |
//! | `"probabilistic"` | `ProbQueueModel<LogProbQueueFunc>` (log-probability estimator) |
//! | `"power"` | `ProbQueueModel<PowerProbQueueFunc>` with exponent `queue_power_n` (default 2.0) |
//! | `"custom"` | `ProbQueueModel` over the `Probability` func named by `queue_prob_func` (`log` \| `log2` \| `power` \| `power2` \| `power3`); a hand-written `Probability`/`LatencyModel` trait impl remains possible at the Rust API level |
//!
//! Related divergences logged for the Planner (see `STATE.md` entry): upstream
//! `OrdType` is Limit/Market only — IOC/FOK/GTC/Post-only are `TimeInForce`
//! variants and **Reduce-only has no upstream counterpart** (rejected as
//! `Unsupported`); the non-value fee models (`TradingQtyFeeModel`,
//! `FlatPerTradeFeeModel`, `DirectionalFees`) have no §8.7 control and are not
//! constructed.

use hftbacktest::backtest::assettype::{
    AssetType as VendorAssetTypeTrait, InverseAsset, LinearAsset,
};
use hftbacktest::backtest::models::{
    CommonFees, ConstantLatency, LogProbQueueFunc, LogProbQueueFunc2, PowerProbQueueFunc,
    PowerProbQueueFunc2, PowerProbQueueFunc3, ProbQueueModel, RiskAdverseQueueModel,
    TradingValueFeeModel,
};
use hftbacktest::backtest::ExchangeKind as VendorExchangeKind;
use hftbacktest::depth::MarketDepth;

use crate::error::EngineError;
use crate::types::{
    ExecutionModelConfig, LatencyModelKind, NamedParameter, OrderType, ParameterValue,
};

// -- Parameter channel keys -------------------------------------------------
//
// `docs/08` §8.7 exposes maker/taker fees, latency kind, queue preset, partial
// fills, and order types directly. The remaining vendor selections (asset type,
// fixed-latency delays, probability-function tuning) have no §8.7 control, so
// they travel in `BacktestRequest::parameters` under these keys. The §8.12
// "random seed" field stays separate (`BacktestRequest::random_seed`).

/// `BacktestRequest` parameter: `"linear"` (default) or `"inverse"`.
/// Selects the vendor `AssetType` per `docs/04` §4.4 (USDT-margined vs.
/// coin-margined markets).
pub const PARAM_ASSET_TYPE: &str = "asset_type";
/// `BacktestRequest` parameter: contract size multiplier (default 1.0).
pub const PARAM_CONTRACT_SIZE: &str = "contract_size";
/// `BacktestRequest` parameter: fixed order-entry latency, nanoseconds (default 0).
pub const PARAM_LATENCY_ENTRY_NS: &str = "latency_entry_ns";
/// `BacktestRequest` parameter: fixed order-response latency, nanoseconds (default 0).
pub const PARAM_LATENCY_RESPONSE_NS: &str = "latency_response_ns";
/// `BacktestRequest` parameter: exponent for the `power` / custom power-law
/// queue presets (default [`DEFAULT_QUEUE_POWER_N`]).
pub const PARAM_QUEUE_POWER_N: &str = "queue_power_n";
/// `BacktestRequest` parameter: probability function for the `custom` queue
/// preset — `log` | `log2` | `power` | `power2` | `power3`.
pub const PARAM_QUEUE_PROB_FUNC: &str = "queue_prob_func";

/// Default power-law exponent for the `power` queue preset.
pub const DEFAULT_QUEUE_POWER_N: f64 = 2.0;

// -- Resolved model ----------------------------------------------------------

/// Finalized queue preset (Task 2.3.B).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QueuePreset {
    RiskAverse,
    Probabilistic,
    Power,
    Custom,
}

impl QueuePreset {
    /// Canonical preset string (the `docs/08` §8.7 spelling).
    pub fn as_str(self) -> &'static str {
        match self {
            QueuePreset::RiskAverse => "risk-averse",
            QueuePreset::Probabilistic => "probabilistic",
            QueuePreset::Power => "power",
            QueuePreset::Custom => "custom",
        }
    }
}

/// Parse a `queue_model_preset` string into its finalized preset.
///
/// Accepts the canonical `docs/08` §8.7 spellings (case-insensitive, `-`/`_`
/// tolerant). Anything else is a typed error, not a silent fallback.
pub fn parse_queue_preset(preset: &str) -> Result<QueuePreset, EngineError> {
    let normalized: String = preset
        .trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|c| *c != '-' && *c != '_' && *c != ' ')
        .collect();
    match normalized.as_str() {
        "riskaverse" => Ok(QueuePreset::RiskAverse),
        "probabilistic" => Ok(QueuePreset::Probabilistic),
        "power" => Ok(QueuePreset::Power),
        "custom" => Ok(QueuePreset::Custom),
        _ => Err(EngineError::InvalidRequest(format!(
            "unknown queue_model_preset {preset:?}; expected one of \
             \"risk-averse\", \"probabilistic\", \"power\", \"custom\" \
             (docs/04 §4.4, finalized in Task 2.3.B)"
        ))),
    }
}

/// Vendor asset-type selection (`docs/04` §4.4).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AssetKind {
    Linear,
    Inverse,
}

/// Probability function for the `custom` queue preset, naming the upstream
/// `Probability` implementations in `models/queue.rs`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProbFuncKind {
    Log,
    Log2,
    Power,
    Power2,
    Power3,
}

/// Fully resolved queue selection, with tuning parameters attached.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ResolvedQueue {
    RiskAverse,
    Probabilistic,
    Power { n: f64 },
    Custom { func: ProbFuncKind, n: f64 },
}

/// Fully resolved latency selection.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ResolvedLatency {
    Fixed { entry_ns: i64, response_ns: i64 },
    Empirical { data_file: String },
    Custom,
}

/// A normalized execution model with every vendor selection resolved and
/// range-checked. Stored on [`crate::hftbacktest_impl::HftbacktestConfig`].
#[derive(Clone, Debug, PartialEq)]
pub struct ResolvedExecutionModel {
    /// Maker fee as a fraction (0.0002 = 0.02%).
    pub maker_rate: f64,
    /// Taker fee as a fraction.
    pub taker_rate: f64,
    pub tick_size: f64,
    pub lot_size: f64,
    pub asset: AssetKind,
    pub contract_size: f64,
    /// `true` → vendor `PartialFillExchange`, `false` → `NoPartialFillExchange`.
    pub allow_partial_fills: bool,
    pub queue: ResolvedQueue,
    pub latency: ResolvedLatency,
    pub order_types_allowed: Vec<OrderType>,
}

impl Default for ResolvedExecutionModel {
    fn default() -> Self {
        Self {
            maker_rate: 0.0,
            taker_rate: 0.0,
            tick_size: 0.01,
            lot_size: 0.001,
            asset: AssetKind::Linear,
            contract_size: 1.0,
            allow_partial_fills: false,
            queue: ResolvedQueue::RiskAverse,
            latency: ResolvedLatency::Fixed {
                entry_ns: 0,
                response_ns: 0,
            },
            order_types_allowed: vec![OrderType::Limit],
        }
    }
}

// -- Resolution ---------------------------------------------------------------

fn find_param<'a>(params: &'a [NamedParameter], key: &str) -> Option<&'a ParameterValue> {
    params.iter().find(|p| p.name == key).map(|p| &p.value)
}

fn number_param(params: &[NamedParameter], key: &str) -> Result<Option<f64>, EngineError> {
    match find_param(params, key) {
        None => Ok(None),
        Some(ParameterValue::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(EngineError::InvalidRequest(format!(
            "parameter {key:?} must be a number"
        ))),
    }
}

fn text_param<'a>(params: &'a [NamedParameter], key: &str) -> Result<Option<&'a str>, EngineError> {
    match find_param(params, key) {
        None => Ok(None),
        Some(ParameterValue::Text(t)) => Ok(Some(t.as_str())),
        Some(_) => Err(EngineError::InvalidRequest(format!(
            "parameter {key:?} must be text"
        ))),
    }
}

fn parse_prob_func(name: &str) -> Result<ProbFuncKind, EngineError> {
    match name.trim().to_ascii_lowercase().as_str() {
        "log" => Ok(ProbFuncKind::Log),
        "log2" | "log2prob" | "logprob2" => Ok(ProbFuncKind::Log2),
        "power" => Ok(ProbFuncKind::Power),
        "power2" => Ok(ProbFuncKind::Power2),
        "power3" => Ok(ProbFuncKind::Power3),
        _ => Err(EngineError::InvalidRequest(format!(
            "unknown {param} {name:?}; expected one of \
             \"log\", \"log2\", \"power\", \"power2\", \"power3\"",
            param = PARAM_QUEUE_PROB_FUNC,
        ))),
    }
}

/// Resolve + range-check an [`ExecutionModelConfig`] into vendor selections.
///
/// Every `docs/08` §8.7 field is validated here: fee percents must be finite
/// within 0–100, tick/lot sizes positive and finite, the queue preset must
/// parse, `empirical` latency requires a data file, and tuning parameters must
/// have the right type and range. Failures are typed errors, never silent
/// fallbacks (`AGENTS.md` §5.1).
pub fn resolve_execution_model(
    exec: &ExecutionModelConfig,
    params: &[NamedParameter],
) -> Result<ResolvedExecutionModel, EngineError> {
    if !exec.maker_fee_pct.is_finite() || !(0.0..=100.0).contains(&exec.maker_fee_pct) {
        return Err(EngineError::InvalidRequest(format!(
            "maker_fee_pct must be within 0–100 (%), got {}",
            exec.maker_fee_pct
        )));
    }
    if !exec.taker_fee_pct.is_finite() || !(0.0..=100.0).contains(&exec.taker_fee_pct) {
        return Err(EngineError::InvalidRequest(format!(
            "taker_fee_pct must be within 0–100 (%), got {}",
            exec.taker_fee_pct
        )));
    }
    if !exec.tick_size.is_finite() || exec.tick_size <= 0.0 {
        return Err(EngineError::InvalidRequest(format!(
            "tick_size must be positive and finite, got {}",
            exec.tick_size
        )));
    }
    if !exec.lot_size.is_finite() || exec.lot_size <= 0.0 {
        return Err(EngineError::InvalidRequest(format!(
            "lot_size must be positive and finite, got {}",
            exec.lot_size
        )));
    }

    let asset = match text_param(params, PARAM_ASSET_TYPE)?.unwrap_or("linear") {
        s if s.trim().eq_ignore_ascii_case("linear") => AssetKind::Linear,
        s if s.trim().eq_ignore_ascii_case("inverse") => AssetKind::Inverse,
        s => {
            return Err(EngineError::InvalidRequest(format!(
                "parameter {:?} must be \"linear\" or \"inverse\", got {s:?}",
                PARAM_ASSET_TYPE
            )))
        }
    };
    let contract_size = number_param(params, PARAM_CONTRACT_SIZE)?.unwrap_or(1.0);
    if !contract_size.is_finite() || contract_size <= 0.0 {
        return Err(EngineError::InvalidRequest(format!(
            "parameter {:?} must be positive and finite, got {contract_size}",
            PARAM_CONTRACT_SIZE
        )));
    }

    let latency = match &exec.latency_model {
        LatencyModelKind::Fixed => {
            let entry = number_param(params, PARAM_LATENCY_ENTRY_NS)?.unwrap_or(0.0);
            let response = number_param(params, PARAM_LATENCY_RESPONSE_NS)?.unwrap_or(0.0);
            for (key, v) in [
                (PARAM_LATENCY_ENTRY_NS, entry),
                (PARAM_LATENCY_RESPONSE_NS, response),
            ] {
                if !v.is_finite() || v < 0.0 {
                    return Err(EngineError::InvalidRequest(format!(
                        "parameter {key:?} must be finite and non-negative nanoseconds, got {v}"
                    )));
                }
            }
            ResolvedLatency::Fixed {
                entry_ns: entry.round() as i64,
                response_ns: response.round() as i64,
            }
        }
        LatencyModelKind::Empirical { data_file } => {
            if data_file.trim().is_empty() {
                return Err(EngineError::InvalidRequest(
                    "empirical latency model requires a non-empty latency data file \
                     (ExecutionModelConfig.latency_data_file)"
                        .to_string(),
                ));
            }
            ResolvedLatency::Empirical {
                data_file: data_file.clone(),
            }
        }
        LatencyModelKind::Custom => ResolvedLatency::Custom,
    };

    let queue = match parse_queue_preset(&exec.queue_model_preset)? {
        QueuePreset::RiskAverse => ResolvedQueue::RiskAverse,
        QueuePreset::Probabilistic => ResolvedQueue::Probabilistic,
        QueuePreset::Power => {
            let n = number_param(params, PARAM_QUEUE_POWER_N)?.unwrap_or(DEFAULT_QUEUE_POWER_N);
            if !n.is_finite() || n <= 0.0 {
                return Err(EngineError::InvalidRequest(format!(
                    "parameter {:?} must be positive and finite, got {n}",
                    PARAM_QUEUE_POWER_N
                )));
            }
            ResolvedQueue::Power { n }
        }
        QueuePreset::Custom => {
            let func_name = text_param(params, PARAM_QUEUE_PROB_FUNC)?.ok_or_else(|| {
                EngineError::InvalidRequest(format!(
                    "queue preset \"custom\" requires parameter {:?} \
                     (one of \"log\", \"log2\", \"power\", \"power2\", \"power3\")",
                    PARAM_QUEUE_PROB_FUNC
                ))
            })?;
            let func = parse_prob_func(func_name)?;
            let n = number_param(params, PARAM_QUEUE_POWER_N)?.unwrap_or(DEFAULT_QUEUE_POWER_N);
            if matches!(
                func,
                ProbFuncKind::Power | ProbFuncKind::Power2 | ProbFuncKind::Power3
            ) && (!n.is_finite() || n <= 0.0)
            {
                return Err(EngineError::InvalidRequest(format!(
                    "parameter {:?} must be positive and finite for a power-law \
                     custom queue func, got {n}",
                    PARAM_QUEUE_POWER_N
                )));
            }
            ResolvedQueue::Custom { func, n }
        }
    };

    Ok(ResolvedExecutionModel {
        maker_rate: exec.maker_fee_pct / 100.0,
        taker_rate: exec.taker_fee_pct / 100.0,
        tick_size: exec.tick_size,
        lot_size: exec.lot_size,
        asset,
        contract_size,
        allow_partial_fills: exec.allow_partial_fills,
        queue,
        latency,
        order_types_allowed: exec.order_types_allowed.clone(),
    })
}

// -- Vendor construction (the wiring itself) ----------------------------------
//
// Each builder below constructs the REAL upstream model named in the mapping
// table — no re-implementation of engine math, no mocks. Fee math therefore
// matches upstream exactly (maker/taker fee per trading value, `docs/04` §4.4).

/// Build the vendor fee model for §8.7's maker/taker fee fields:
/// fee per trading value with direction-independent maker/taker rates
/// (`TradingValueFeeModel<CommonFees>`, `docs/04` §4.4).
pub fn build_fee_model(resolved: &ResolvedExecutionModel) -> TradingValueFeeModel<CommonFees> {
    TradingValueFeeModel::new(CommonFees::new(resolved.maker_rate, resolved.taker_rate))
}

/// Vendor asset-type choice, clonable for the `L2AssetBuilder` bound.
#[derive(Clone)]
pub enum VendorAssetType {
    Linear(LinearAsset),
    Inverse(InverseAsset),
}

impl VendorAssetType {
    pub fn build(resolved: &ResolvedExecutionModel) -> Self {
        match resolved.asset {
            AssetKind::Linear => VendorAssetType::Linear(LinearAsset::new(resolved.contract_size)),
            AssetKind::Inverse => {
                VendorAssetType::Inverse(InverseAsset::new(resolved.contract_size))
            }
        }
    }
}

impl VendorAssetTypeTrait for VendorAssetType {
    fn amount(&self, price: f64, qty: f64) -> f64 {
        match self {
            VendorAssetType::Linear(a) => a.amount(price, qty),
            VendorAssetType::Inverse(a) => a.amount(price, qty),
        }
    }

    fn equity(&self, price: f64, balance: f64, position: f64, fee: f64) -> f64 {
        match self {
            VendorAssetType::Linear(a) => a.equity(price, balance, position, fee),
            VendorAssetType::Inverse(a) => a.equity(price, balance, position, fee),
        }
    }
}

/// Build the vendor exchange kind from the "allow partial fills" toggle
/// (`docs/04` §4.4, `docs/08` §8.7).
pub fn build_exchange_kind(resolved: &ResolvedExecutionModel) -> VendorExchangeKind {
    if resolved.allow_partial_fills {
        VendorExchangeKind::PartialFillExchange
    } else {
        VendorExchangeKind::NoPartialFillExchange
    }
}

/// Build the vendor fixed-latency model (`ConstantLatency`, `docs/04` §4.4).
/// Returns `None` for the empirical/custom selections, whose construction
/// needs a staged latency file / user trait impl at run time.
pub fn build_fixed_latency(resolved: &ResolvedExecutionModel) -> Option<ConstantLatency> {
    match &resolved.latency {
        ResolvedLatency::Fixed {
            entry_ns,
            response_ns,
        } => Some(ConstantLatency::new(*entry_ns, *response_ns)),
        ResolvedLatency::Empirical { .. } | ResolvedLatency::Custom => None,
    }
}

/// Build `RiskAdverseQueueModel` (the `"risk-averse"` preset).
pub fn build_risk_adverse_queue<MD: MarketDepth>() -> RiskAdverseQueueModel<MD> {
    RiskAdverseQueueModel::new()
}

/// Build `ProbQueueModel<LogProbQueueFunc>` (the `"probabilistic"` preset).
pub fn build_probabilistic_queue<MD: MarketDepth>() -> ProbQueueModel<LogProbQueueFunc, MD> {
    ProbQueueModel::new(LogProbQueueFunc::new())
}

/// Build `ProbQueueModel<PowerProbQueueFunc>` (the `"power"` preset).
pub fn build_power_queue<MD: MarketDepth>(n: f64) -> ProbQueueModel<PowerProbQueueFunc, MD> {
    ProbQueueModel::new(PowerProbQueueFunc::new(n))
}

/// Build `ProbQueueModel<LogProbQueueFunc2>` (`custom` + `log2`).
pub fn build_log2_queue<MD: MarketDepth>() -> ProbQueueModel<LogProbQueueFunc2, MD> {
    ProbQueueModel::new(LogProbQueueFunc2::new())
}

/// Build `ProbQueueModel<PowerProbQueueFunc2>` (`custom` + `power2`).
pub fn build_power2_queue<MD: MarketDepth>(n: f64) -> ProbQueueModel<PowerProbQueueFunc2, MD> {
    ProbQueueModel::new(PowerProbQueueFunc2::new(n))
}

/// Build `ProbQueueModel<PowerProbQueueFunc3>` (`custom` + `power3`).
pub fn build_power3_queue<MD: MarketDepth>(n: f64) -> ProbQueueModel<PowerProbQueueFunc3, MD> {
    ProbQueueModel::new(PowerProbQueueFunc3::new(n))
}

// -- Order-type enforcement ----------------------------------------------------
//
// `docs/08` §8.7: "strategy code may only submit order types enabled here —
// enforced by the backtest job, not just hidden in the UI." Upstream splits
// this panel's single checkbox list across two enums: `OrdType`
// (Limit/Market) and `TimeInForce` (GTC/GTX(post-only)/FOK/IOC). Reduce-only
// has no upstream counterpart at all.

/// Where a normalized order type maps in the vendor engine.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VendorOrderKind {
    Limit,
    Market,
    Gtc,
    PostOnly,
    Ioc,
    Fok,
}

/// Map a normalized order type to its vendor counterpart.
///
/// `OrderType::ReduceOnly` has no upstream counterpart (`docs/04` §4.4 lists
/// no reduce-only support; no match in the vendor source) and is rejected as
/// `Unsupported` — flagged `NEEDS_PLANNER_REVIEW` in `STATE.md`.
pub fn map_order_type(order: OrderType) -> Result<VendorOrderKind, EngineError> {
    match order {
        OrderType::Limit => Ok(VendorOrderKind::Limit),
        OrderType::Market => Ok(VendorOrderKind::Market),
        OrderType::Gtc => Ok(VendorOrderKind::Gtc),
        OrderType::PostOnly => Ok(VendorOrderKind::PostOnly),
        OrderType::Ioc => Ok(VendorOrderKind::Ioc),
        OrderType::Fok => Ok(VendorOrderKind::Fok),
        OrderType::ReduceOnly => Err(EngineError::Unsupported(
            "order type Reduce-only has no counterpart in the vendored engine \
             (upstream OrdType is Limit/Market only; TimeInForce covers \
             GTC/GTX/FOK/IOC) — see STATE.md NEEDS_PLANNER_REVIEW"
                .to_string(),
        )),
    }
}

/// Enforce the §8.7 "order types allowed" gate: the order must be enabled in
/// the resolved config AND mappable to the vendor engine.
pub fn check_order_allowed(
    resolved: &ResolvedExecutionModel,
    order: OrderType,
) -> Result<VendorOrderKind, EngineError> {
    let kind = map_order_type(order)?;
    if resolved.order_types_allowed.contains(&order) {
        Ok(kind)
    } else {
        Err(EngineError::InvalidRequest(format!(
            "order type {order:?} is not enabled in this backtest's \
             execution model (docs/08 §8.7)"
        )))
    }
}
