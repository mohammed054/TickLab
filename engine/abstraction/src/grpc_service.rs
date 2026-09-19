//! gRPC service over the [`SimulatorContract`] (`docs/15` §15.4).
//!
//! This module hosts the `EngineService` defined in `proto/engine.proto` on
//! top of [`crate::hftbacktest_impl::HftbacktestEngine`]. Translation here is
//! strictly normalized-types ↔ protobuf; translation to `hftbacktest` native
//! types stays in `hftbacktest_impl.rs` (`docs/05` §5.1). `backend/jobs`
//! (Rust) is the primary client of this service.

use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};

use crate::contract::SimulatorContract;
use crate::error::EngineError;
use crate::hftbacktest_impl::HftbacktestEngine;
use crate::types::{
    BacktestHandle, BacktestProgress, BacktestRequest, BacktestResult, BacktestStatus, DataQualityReport,
    DatasetRef, EventType, ExecutionModelConfig, HeadlineMetrics, LatencyModelKind,
    MarketEvent, NamedParameter, OrderType, ParameterValue, PipelineProgress,
    PreparedDataset, QualityCount, QualityStatus, RiskLimitsConfig, Side, StrategyRef, TimestampRange,
};

/// Compiled protobuf definitions (`proto/engine.proto`, via `build.rs`).
pub mod proto {
    tonic::include_proto!("ticklab.engine");
}

/// gRPC service implementation over a shared engine instance.
pub struct EngineService {
    engine: Arc<HftbacktestEngine>,
}

impl EngineService {
    pub fn new(engine: Arc<HftbacktestEngine>) -> Self {
        Self { engine }
    }

    /// Serve the `EngineService` on `addr` until shutdown.
    pub async fn serve(engine: Arc<HftbacktestEngine>, addr: std::net::SocketAddr) -> Result<(), tonic::transport::Error> {
        tonic::transport::Server::builder()
            .add_service(proto::engine_service_server::EngineServiceServer::new(Self::new(engine)))
            .serve(addr)
            .await
    }
}

type ProgressStream = ReceiverStream<Result<proto::BacktestProgress, Status>>;
type EventStreamOut = ReceiverStream<Result<proto::MarketEvent, Status>>;
type PipelineStream = ReceiverStream<Result<proto::PipelineProgress, Status>>;

#[tonic::async_trait]
impl proto::engine_service_server::EngineService for EngineService {
    async fn validate_dataset(
        &self,
        request: Request<proto::DatasetRef>,
    ) -> Result<Response<proto::DataQualityReport>, Status> {
        let dataset = from_proto_dataset_ref(request.into_inner());
        let report = self
            .engine
            .validate_dataset(&dataset)
            .map_err(engine_error_to_status)?;
        Ok(Response::new(to_proto_report(&report)))
    }

    type PrepareDatasetStream = PipelineStream;

    async fn prepare_dataset(
        &self,
        request: Request<proto::DatasetRef>,
    ) -> Result<Response<Self::PrepareDatasetStream>, Status> {
        let dataset = from_proto_dataset_ref(request.into_inner());
        let prepared = self
            .engine
            .prepare_dataset(&dataset)
            .map_err(engine_error_to_status)?;
        let (tx, rx) = mpsc::channel(4);
        let item = proto::PipelineProgress {
            dataset_id: prepared.dataset_id.clone(),
            stage: "ready".to_string(),
            stage_index: 6,
            stage_count: 7,
            complete: true,
        };
        let _ = tx.send(Ok(item)).await;
        Ok(Response::new(ReceiverStream::new(rx)))
    }

    async fn start_backtest(
        &self,
        request: Request<proto::BacktestRequest>,
    ) -> Result<Response<proto::BacktestHandle>, Status> {
        let req = from_proto_request(request.into_inner())?;
        let handle = self.engine.start_backtest(req).map_err(engine_error_to_status)?;
        let id = handle_id_of(&handle);
        Ok(Response::new(proto::BacktestHandle { handle_id: id }))
    }

    type StreamBacktestProgressStream = ProgressStream;

    async fn stream_backtest_progress(
        &self,
        request: Request<proto::BacktestHandle>,
    ) -> Result<Response<Self::StreamBacktestProgressStream>, Status> {
        let handle = self.resolve(&request.into_inner().handle_id)?;
        let progress = self.engine.poll_progress(&handle);
        let (tx, rx) = mpsc::channel(4);
        let _ = tx.send(Ok(to_proto_progress(&progress))).await;
        Ok(Response::new(ReceiverStream::new(rx)))
    }

    type StreamEventsStream = EventStreamOut;

    async fn stream_events(
        &self,
        request: Request<proto::BacktestHandle>,
    ) -> Result<Response<Self::StreamEventsStream>, Status> {
        let handle = self.resolve(&request.into_inner().handle_id)?;
        let events = self.engine.stream_events(&handle);
        let (tx, rx) = mpsc::channel(128);
        for event in &events {
            if tx.send(Ok(to_proto_event(event))).await.is_err() {
                break;
            }
        }
        Ok(Response::new(ReceiverStream::new(rx)))
    }

    async fn collect_results(
        &self,
        request: Request<proto::BacktestHandle>,
    ) -> Result<Response<proto::BacktestResult>, Status> {
        let handle = self.resolve(&request.into_inner().handle_id)?;
        let result = self.engine.collect_results(&handle).map_err(engine_error_to_status)?;
        Ok(Response::new(to_proto_result(&result)))
    }

    async fn cancel(
        &self,
        request: Request<proto::BacktestHandle>,
    ) -> Result<Response<proto::Empty>, Status> {
        let handle = self.resolve(&request.into_inner().handle_id)?;
        self.engine.cancel(&handle).map_err(engine_error_to_status)?;
        Ok(Response::new(proto::Empty {}))
    }
}

impl EngineService {
    fn resolve(
        &self,
        handle_id: &str,
    ) -> Result<Arc<crate::hftbacktest_impl::HftbacktestHandle>, Status> {
        if handle_id.trim().is_empty() {
            return Err(Status::invalid_argument("handle_id must not be empty"));
        }
        self.engine.lookup(handle_id).map_err(engine_error_to_status)
    }
}

fn handle_id_of(handle: &Arc<crate::hftbacktest_impl::HftbacktestHandle>) -> String {
    handle.id().to_string()
}

fn engine_error_to_status(err: EngineError) -> Status {
    match err {
        EngineError::InvalidDataset(msg) => Status::invalid_argument(format!("invalid dataset: {msg}")),
        EngineError::InvalidRequest(msg) => Status::invalid_argument(format!("invalid request: {msg}")),
        EngineError::UnknownHandle(msg) => Status::not_found(format!("unknown handle: {msg}")),
        EngineError::Unsupported(msg) => Status::failed_precondition(msg),
        EngineError::Engine(msg) => Status::internal(msg),
    }
}

// -- Normalized types -> proto --

fn to_proto_report(r: &DataQualityReport) -> proto::DataQualityReport {
    proto::DataQualityReport {
        dataset_id: r.dataset_id.clone(),
        total_events: r.total_events,
        trades: r.trades,
        order_book_updates: r.order_book_updates,
        snapshots: r.snapshots,
        missing_intervals: Some(proto::MissingIntervals {
            count: r.missing_intervals.count,
            status: to_proto_quality(r.missing_intervals.status) as i32,
            ranges: r
                .missing_intervals
                .ranges
                .iter()
                .map(|x| proto::TimestampRange {
                    start_ns: x.start_ns,
                    end_ns: x.end_ns,
                })
                .collect(),
        }),
        duplicate_events: Some(to_proto_count(&r.duplicate_events)),
        sequence_gaps: Some(to_proto_count(&r.sequence_gaps)),
        timestamp_range: Some(proto::TimestampRange {
            start_ns: r.timestamp_range.start_ns,
            end_ns: r.timestamp_range.end_ns,
        }),
        file_size_bytes: r.file_size_bytes,
        source: r.source.clone(),
        normalization_version: r.normalization_version.clone(),
        tick_size: r.tick_size,
        lot_size: r.lot_size,
    }
}

fn to_proto_count(c: &QualityCount) -> proto::QualityCount {
    proto::QualityCount {
        count: c.count,
        status: to_proto_quality(c.status) as i32,
    }
}

fn to_proto_quality(s: QualityStatus) -> proto::QualityStatus {
    match s {
        QualityStatus::Green => proto::QualityStatus::Green,
        QualityStatus::Yellow => proto::QualityStatus::Yellow,
        QualityStatus::Red => proto::QualityStatus::Red,
    }
}

fn to_proto_progress(p: &BacktestProgress) -> proto::BacktestProgress {
    proto::BacktestProgress {
        job_id: p.job_id.clone(),
        events_processed: p.events_processed,
        total_events: p.total_events,
        events_per_sec: p.events_per_sec,
        orders_submitted: p.orders_submitted,
        fills: p.fills,
        simulated_time_ns: p.simulated_time_ns,
        wall_clock_elapsed_ms: p.wall_clock_elapsed_ms,
        status: to_proto_status(p.status) as i32,
    }
}

fn to_proto_status(s: BacktestStatus) -> proto::BacktestStatus {
    match s {
        BacktestStatus::Queued => proto::BacktestStatus::Queued,
        BacktestStatus::Running => proto::BacktestStatus::Running,
        BacktestStatus::Complete => proto::BacktestStatus::Complete,
        BacktestStatus::Failed => proto::BacktestStatus::Failed,
        BacktestStatus::Cancelled => proto::BacktestStatus::Cancelled,
    }
}

fn to_proto_event(e: &MarketEvent) -> proto::MarketEvent {
    proto::MarketEvent {
        timestamp_ns: e.timestamp_ns,
        symbol: e.symbol.clone(),
        exchange: e.exchange.clone(),
        event_type: match e.event_type {
            EventType::BookUpdate => proto::EventType::BookUpdate,
            EventType::Trade => proto::EventType::Trade,
            EventType::Snapshot => proto::EventType::Snapshot,
            EventType::Ticker => proto::EventType::Ticker,
            EventType::Funding => proto::EventType::Funding,
            EventType::Liquidation => proto::EventType::Liquidation,
        } as i32,
        side: e.side.map(|s| match s {
            Side::Bid => proto::Side::Bid as i32,
            Side::Ask => proto::Side::Ask as i32,
        }),
        price: e.price,
        size: e.size,
        sequence: e.sequence,
        funding_rate: e.funding_rate,
        next_funding_time: e.next_funding_time,
        open_interest: e.open_interest,
        mark_price: e.mark_price,
        index_price: e.index_price,
        basis: e.basis,
    }
}

fn to_proto_result(r: &BacktestResult) -> proto::BacktestResult {
    proto::BacktestResult {
        job_id: r.job_id.clone(),
        experiment_id: r.experiment_id.clone(),
        engine_version: r.engine_version.clone(),
        headline: Some(to_proto_headline(&r.headline)),
        recorder_series_ref: r.recorder_series_ref.clone(),
        fine_grained_events_ref: r.fine_grained_events_ref.clone(),
    }
}

fn to_proto_headline(h: &HeadlineMetrics) -> proto::HeadlineMetrics {
    proto::HeadlineMetrics {
        initial_capital: h.initial_capital,
        final_capital: h.final_capital,
        net_pnl: h.net_pnl,
        return_pct: h.return_pct,
        max_drawdown_pct: h.max_drawdown_pct,
        sharpe: h.sharpe,
        sortino: h.sortino,
        trades: h.trades,
        fill_rate_pct: h.fill_rate_pct,
        fees: h.fees,
        slippage: h.slippage,
    }
}

#[allow(dead_code)]
fn to_proto_prepared(p: &PreparedDataset) -> proto::PreparedDataset {
    proto::PreparedDataset {
        dataset_id: p.dataset_id.clone(),
        pipeline_version: p.pipeline_version.clone(),
        event_count: p.event_count,
    }
}

#[allow(dead_code)]
fn to_proto_pipeline(p: &PipelineProgress) -> proto::PipelineProgress {
    proto::PipelineProgress {
        dataset_id: p.dataset_id.clone(),
        stage: p.stage.clone(),
        stage_index: p.stage_index,
        stage_count: p.stage_count,
        complete: p.complete,
    }
}

// -- Proto -> normalized types --

fn from_proto_dataset_ref(m: proto::DatasetRef) -> DatasetRef {
    DatasetRef {
        dataset_id: m.dataset_id,
    }
}

fn from_proto_request(m: proto::BacktestRequest) -> Result<BacktestRequest, Status> {
    let strategy_ref = m.strategy_ref.map(|s| StrategyRef {
        id: s.id,
        version: s.version,
        code_hash: s.code_hash,
    });
    let date_range = m.date_range.map(|r| TimestampRange {
        start_ns: r.start_ns,
        end_ns: r.end_ns,
    });
    let execution_model = m.execution_model.map(from_proto_execution);
    let risk_limits = m.risk_limits.map(from_proto_risk);
    Ok(BacktestRequest {
        strategy_ref: strategy_ref
            .ok_or_else(|| Status::invalid_argument("strategy_ref is required"))?,
        parameters: m
            .parameters
            .into_iter()
            .map(|(name, v)| NamedParameter {
                name,
                value: from_proto_param(v),
            })
            .collect(),
        dataset_id: m.dataset_id,
        date_range: date_range.ok_or_else(|| Status::invalid_argument("date_range is required"))?,
        initial_capital: m.initial_capital,
        execution_model: execution_model
            .ok_or_else(|| Status::invalid_argument("execution_model is required"))?,
        risk_limits: risk_limits.ok_or_else(|| Status::invalid_argument("risk_limits is required"))?,
        random_seed: m.random_seed,
        iterations: m.iterations,
    })
}

fn from_proto_param(v: proto::ParameterValue) -> ParameterValue {
    use proto::parameter_value::Value;
    match v.value {
        Some(Value::Number(n)) => ParameterValue::Number(n),
        Some(Value::Text(t)) => ParameterValue::Text(t),
        Some(Value::Flag(f)) => ParameterValue::Flag(f),
        None => ParameterValue::Text(String::new()),
    }
}

fn from_proto_execution(m: proto::ExecutionModelConfig) -> ExecutionModelConfig {
    ExecutionModelConfig {
        maker_fee_pct: m.maker_fee_pct,
        taker_fee_pct: m.taker_fee_pct,
        tick_size: m.tick_size,
        lot_size: m.lot_size,
        latency_model: match proto::LatencyModelKind::try_from(m.latency_model).unwrap_or(
            proto::LatencyModelKind::Unspecified,
        ) {
            proto::LatencyModelKind::Fixed => LatencyModelKind::Fixed,
            proto::LatencyModelKind::Empirical => LatencyModelKind::Empirical {
                data_file: m.latency_data_file.clone(),
            },
            proto::LatencyModelKind::Custom => LatencyModelKind::Custom,
            proto::LatencyModelKind::Unspecified => LatencyModelKind::Fixed,
        },
        queue_model_preset: m.queue_model_preset,
        allow_partial_fills: m.allow_partial_fills,
        order_types_allowed: m
            .order_types_allowed
            .into_iter()
            .filter_map(|o| match proto::OrderType::try_from(o).ok()? {
                proto::OrderType::Limit => Some(OrderType::Limit),
                proto::OrderType::Market => Some(OrderType::Market),
                proto::OrderType::Ioc => Some(OrderType::Ioc),
                proto::OrderType::Fok => Some(OrderType::Fok),
                proto::OrderType::Gtc => Some(OrderType::Gtc),
                proto::OrderType::PostOnly => Some(OrderType::PostOnly),
                proto::OrderType::ReduceOnly => Some(OrderType::ReduceOnly),
                proto::OrderType::Unspecified => None,
            })
            .collect(),
    }
}

fn from_proto_risk(m: proto::RiskLimitsConfig) -> RiskLimitsConfig {
    RiskLimitsConfig {
        max_position: m.max_position,
        max_order_size: m.max_order_size,
        max_daily_loss: m.max_daily_loss,
        max_drawdown_pct: m.max_drawdown_pct,
        max_open_orders: m.max_open_orders,
        max_order_rate_per_sec: m.max_order_rate_per_sec,
        max_notional_exposure: m.max_notional_exposure,
        emergency_stop_enabled: m.emergency_stop_enabled,
    }
}

#[allow(dead_code)]
fn from_proto_handle(m: proto::BacktestHandle) -> BacktestHandle {
    BacktestHandle {
        handle_id: m.handle_id,
    }
}
