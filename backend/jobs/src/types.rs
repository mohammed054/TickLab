//! Wire shapes for the Job Runner REST API.
//!
//! Field names mirror `docs/15-api-and-data-model-spec.md` §15.5 exactly
//! (camelCase on the wire). These are the same shapes as the Protobuf messages
//! in `engine/abstraction/proto/engine.proto` (`docs/15` §15.4, the canonical
//! wire definition); when the vendor checkout lands, the runner's engine calls
//! move to a tonic client of that proto with no REST-surface change.
//!
//! No financial math lives here (`AGENTS.md` §5.3): progress fields are runner-
//! stage pipeline telemetry, and result headlines are explicitly pending until
//! Block 2.4's metrics integration.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Strategy reference (`docs/15` §15.5 `BacktestRequest.strategyRef`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyRef {
    pub id: String,
    pub version: String,
    pub code_hash: String,
}

/// One strategy parameter value (`docs/15` §15.5 `parameters` record of
/// `number | string | boolean`), made explicit instead of string-encoded.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ParameterValue {
    Number(f64),
    Text(String),
    Flag(bool),
}

/// Latency model selector (`docs/15` §15.5 via `ExecutionModelConfig`,
/// `docs/04` §4.4, `docs/08` §8.7). Full application inside the engine is
/// Block 2.3; here the config is validated for shape and carried through.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LatencyModelKind {
    Fixed,
    Empirical,
    Custom,
}

/// Execution model configuration (`docs/15` §15.5, `docs/08` §8.7).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionModelConfig {
    pub maker_fee_pct: f64,
    pub taker_fee_pct: f64,
    pub tick_size: f64,
    pub lot_size: f64,
    pub latency_model: LatencyModelKind,
    #[serde(default)]
    pub latency_data_file: Option<String>,
    pub queue_model_preset: String,
    pub allow_partial_fills: bool,
    #[serde(default)]
    pub order_types_allowed: Vec<String>,
}

/// Risk limits configuration (`docs/15` §15.5 `RiskLimitsConfig`,
/// `docs/12` §12.5). Carried opaquely; enforcement inside the engine arrives
/// with later blocks. No live-trading path exists in this service (`docs/12`
/// §12.2 isolation: only historical backtest/sweep/walkforward/robustness).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskLimitsConfig {
    pub max_position: f64,
    pub max_order_size: f64,
    pub max_daily_loss: f64,
    pub max_drawdown_pct: f64,
    pub max_open_orders: u32,
    pub max_order_rate_per_sec: f64,
    pub max_notional_exposure: f64,
    pub emergency_stop_enabled: bool,
}

/// Backtest request (`docs/15` §15.5 `BacktestRequest`).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestRequest {
    pub strategy_ref: StrategyRef,
    pub parameters: BTreeMap<String, ParameterValue>,
    pub dataset_id: String,
    pub date_range: DateRange,
    pub initial_capital: f64,
    pub execution_model: ExecutionModelConfig,
    pub risk_limits: RiskLimitsConfig,
    pub random_seed: Option<i64>,
    pub iterations: u32,
}

/// Nanosecond-precision epoch range (`docs/15` §15.1: ns ints on the wire).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DateRange {
    pub start: i64,
    pub end: i64,
}

/// Job lifecycle status (`docs/15` §15.5 `BacktestProgress.status`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Complete,
    Failed,
    Cancelled,
}

impl JobStatus {
    /// True once the job will emit no further progress.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            JobStatus::Complete | JobStatus::Failed | JobStatus::Cancelled
        )
    }
}

/// Backtest progress (`docs/15` §15.5 `BacktestProgress`, exact field set).
/// Rendered by `docs/08` §8.14 (processed/total, rate, orders, fills,
/// simulated clock, elapsed).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestProgress {
    pub job_id: String,
    pub events_processed: u64,
    pub total_events: u64,
    pub events_per_sec: f64,
    pub orders_submitted: u64,
    pub fills: u64,
    pub simulated_time_ns: i64,
    pub wall_clock_elapsed_ms: u64,
    pub status: JobStatus,
}

/// Job kind owned by the runner (extends the §15.2 job table).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobKind {
    Backtest,
    Sweep,
    Walkforward,
    Robustness,
}

/// `POST /api/v1/jobs/backtest` response (`docs/15` §15.2 → `{jobId}`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitResponse {
    pub job_id: String,
}

/// `POST /api/v1/jobs/sweep` response (`docs/15` §15.2 → `{jobId, cellJobIds[]}`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SweepSubmitResponse {
    pub job_id: String,
    pub cell_job_ids: Vec<String>,
}

/// One sweep grid axis: parameter name × discrete values.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SweepAxis {
    pub parameter: String,
    pub values: Vec<ParameterValue>,
}

/// `POST /api/v1/jobs/sweep` body: base request × axis cross-product.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SweepRequest {
    pub request: BacktestRequest,
    pub axes: Vec<SweepAxis>,
}

/// `POST /api/v1/jobs/walkforward` body: contiguous date-range windows.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WalkforwardRequest {
    pub request: BacktestRequest,
    pub windows: u32,
}

/// One robustness case: named parameter overrides over the base request.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RobustnessCase {
    pub name: String,
    pub parameter_overrides: BTreeMap<String, ParameterValue>,
}

/// `POST /api/v1/jobs/robustness` body.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RobustnessRequest {
    pub request: BacktestRequest,
    pub cases: Vec<RobustnessCase>,
}

/// Compact job summary for `GET /api/v1/jobs` (backs `docs/08` §8.15's
/// RUNNING/QUEUED/COMPLETE list from real worker-pool state, `docs/05` §5.6).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSummary {
    pub job_id: String,
    pub kind: JobKind,
    pub status: JobStatus,
    pub events_processed: u64,
    pub total_events: u64,
    pub strategy_id: String,
    pub dataset_id: String,
}

/// Job result (`docs/15` §15.5 `BacktestResult`). Headline metrics are computed
/// in Block 2.4 (`docs/04` §4.7, `docs/09` §9.1); until the vendor execution
/// wiring (Block 2.2 `TODO`) and metrics integration land, `headline` is null
/// and `metrics_pending` explains why in a machine-readable way — no financial
/// figures are fabricated (`AGENTS.md` §5.3, §5.7).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobResult {
    pub job_id: String,
    pub experiment_id: String,
    pub engine_version: Option<String>,
    pub headline: Option<serde_json::Value>,
    pub recorder_series_ref: Option<String>,
    pub fine_grained_events_ref: Option<String>,
    pub metrics_pending: MetricsPending,
}

/// Machine-readable marker for results whose metrics are not yet available.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsPending {
    pub reason: String,
    pub blocked_by: Vec<String>,
}

impl MetricsPending {
    pub fn engine_and_metrics() -> Self {
        Self {
            reason: "job lifecycle complete; headline metrics unavailable until \
                     vendor execution wiring and metrics integration land"
                .to_string(),
            blocked_by: vec![
                "Block 2.2 vendor execution wiring (engine/vendor/hftbacktest)".to_string(),
                "Block 2.4 metrics integration (docs/04 §4.7, docs/09 §9.1)".to_string(),
            ],
        }
    }
}

/// Typed API error (`docs/14` §14.9: actionable messages, never a bare
/// "Error: undefined"). `action` tells the caller what to do next.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
}

impl ApiError {
    pub fn new(code: &str, message: String, action: Option<&str>) -> Self {
        Self {
            code: code.to_string(),
            message,
            action: action.map(str::to_string),
        }
    }

    pub fn invalid_request(message: String) -> Self {
        Self::new(
            "INVALID_REQUEST",
            message,
            Some("Fix the request fields and resubmit."),
        )
    }

    pub fn job_not_found(job_id: &str) -> Self {
        Self::new(
            "JOB_NOT_FOUND",
            format!("no job with id '{job_id}'"),
            Some("Check the jobId, or list recent jobs via GET /api/v1/jobs."),
        )
    }

    pub fn result_pending(job_id: &str) -> Self {
        Self::new(
            "RESULT_PENDING",
            format!("job '{job_id}' has not completed yet"),
            Some("Subscribe to job.{jobId}.progress or poll GET /api/v1/jobs/{jobId} until status is complete."),
        )
    }
}

/// Structural request validation (shape only; semantic validation against data
/// coverage belongs to the pipeline / Block 2.7 path).
pub fn validate_backtest_request(req: &BacktestRequest) -> Result<(), ApiError> {
    if req.strategy_ref.id.trim().is_empty() {
        return Err(ApiError::invalid_request(
            "strategyRef.id must not be empty".to_string(),
        ));
    }
    if req.dataset_id.trim().is_empty() {
        return Err(ApiError::invalid_request(
            "datasetId must not be empty".to_string(),
        ));
    }
    if req.date_range.end <= req.date_range.start {
        return Err(ApiError::invalid_request(
            "dateRange.end must be after dateRange.start (nanosecond epoch ints, docs/15 §15.1)"
                .to_string(),
        ));
    }
    if !req.initial_capital.is_finite() || req.initial_capital <= 0.0 {
        return Err(ApiError::invalid_request(
            "initialCapital must be a finite positive number".to_string(),
        ));
    }
    if req.iterations == 0 {
        return Err(ApiError::invalid_request(
            "iterations must be at least 1".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_request() -> BacktestRequest {
        BacktestRequest {
            strategy_ref: StrategyRef {
                id: "strat-fixture".to_string(),
                version: "0.1.0".to_string(),
                code_hash: "deadbeef".to_string(),
            },
            parameters: BTreeMap::new(),
            dataset_id: "binance/usdm/BTCUSDT/2024-01-01".to_string(),
            date_range: DateRange {
                start: 1_704_067_200_000_000_000,
                end: 1_704_153_600_000_000_000,
            },
            initial_capital: 100_000.0,
            execution_model: ExecutionModelConfig {
                maker_fee_pct: 0.02,
                taker_fee_pct: 0.05,
                tick_size: 0.1,
                lot_size: 0.001,
                latency_model: LatencyModelKind::Fixed,
                latency_data_file: None,
                queue_model_preset: "probabilistic".to_string(),
                allow_partial_fills: true,
                order_types_allowed: vec!["limit".to_string(), "market".to_string()],
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
    fn valid_fixture_passes_validation() {
        assert!(validate_backtest_request(&fixture_request()).is_ok());
    }

    #[test]
    fn malformed_requests_rejected() {
        let mut bad = fixture_request();
        bad.dataset_id.clear();
        assert!(validate_backtest_request(&bad).is_err());

        let mut bad = fixture_request();
        bad.date_range = DateRange { start: 2, end: 1 };
        assert!(validate_backtest_request(&bad).is_err());

        let mut bad = fixture_request();
        bad.iterations = 0;
        assert!(validate_backtest_request(&bad).is_err());

        let mut bad = fixture_request();
        bad.initial_capital = 0.0;
        assert!(validate_backtest_request(&bad).is_err());
    }

    #[test]
    fn progress_serializes_with_section_15_5_field_names() {
        let p = BacktestProgress {
            job_id: "job-1".to_string(),
            events_processed: 10,
            total_events: 100,
            events_per_sec: 500.0,
            orders_submitted: 0,
            fills: 0,
            simulated_time_ns: 1_704_067_200_000_000_000,
            wall_clock_elapsed_ms: 20,
            status: JobStatus::Running,
        };
        let v = serde_json::to_value(&p).expect("serialize");
        for key in [
            "jobId",
            "eventsProcessed",
            "totalEvents",
            "eventsPerSec",
            "ordersSubmitted",
            "fills",
            "simulatedTimeNs",
            "wallClockElapsedMs",
            "status",
        ] {
            assert!(v.get(key).is_some(), "missing wire field {key}");
        }
        assert_eq!(v["status"], "running");
    }

    #[test]
    fn terminal_statuses() {
        assert!(JobStatus::Complete.is_terminal());
        assert!(JobStatus::Failed.is_terminal());
        assert!(JobStatus::Cancelled.is_terminal());
        assert!(!JobStatus::Queued.is_terminal());
        assert!(!JobStatus::Running.is_terminal());
    }
}
