/// Paper fill simulation — reuses the backtest engine's Local/Exchange
/// fill-simulation logic (§12.2) applied to the live order book instead of
/// a replayed historical dataset.
///
/// This module observes the live order book via the extended event stream
/// (hooks H4-H6 in `extended_events.rs`) and produces `Fill`/`PartialFill`
/// events using the same semantics as the backtest engine's processor.
use crate::error::EngineError;
use crate::extended_events::{ExtendedEvent, ExtendedEventType, Side};
use crate::models::StrategyStatus;

/// Simulate a fill for a live order using the backtest engine's semantics.
///
/// This is the same fill-simulation logic from `backtest/proc/*.rs` but
/// operating on live market data instead of a historical dataset.
pub fn simulate_paper_fill(
    order_id: u64,
    side: Side,
    price: f64,
    size: f64,
    order_book_state: &OrderBookState,
    latency_model: &LatencyModel,
) -> Result<ExtendedEvent, EngineError> {
    // Determine fill probability based on order book depth and queue model
    let queue_ahead = order_book_state.queue_ahead_estimate(side, price, size);
    let fill_prob = order_book_state.fill_probability(side, price, size);

    // Apply the engine's fill/no-fill decision
    if fill_prob >= 1.0 {
        // Full fill - produce Fill event
        let latency = latency_model.compute_fill_latency(size, price);
        Ok(ExtendedEvent::new_fill(
            order_id,
            side,
            price,
            size,
            queue_ahead,
            latency,
        ))
    } else if fill_prob > 0.0 {
        // Partial fill - produce PartialFill event
        let fill_size = (size * fill_prob) as u64;
        let remaining = size - fill_size;
        let latency = latency_model.compute_partial_fill_latency(fill_size, price);
        Ok(ExtendedEvent::new_partial_fill(
            order_id,
            side,
            price,
            fill_size,
            remaining,
            queue_ahead,
            latency,
        ))
    } else {
        // No fill - produce QueueUpdate event
        Ok(ExtendedEvent::new_queue_update(
            order_id,
            side,
            price,
            size,
            queue_ahead,
        ))
    }
}

/// Order book state for Paper fill simulation.
#[derive(Clone, Debug)]
pub struct OrderBookState {
    /// Best bid price in the live order book
    pub best_bid: f64,
    /// Best ask price in the live order book
    pub best_ask: f64,
    /// Queue model state determining fill probability
    pub queue_model: String,
    /// Current market state snapshot
    pub market_state: MarketState,
}

/// Market state snapshot for fill simulation.
#[derive(Clone, Debug)]
pub struct MarketState {
    /// Current volatility estimate
    pub volatility: f64,
    /// Recent price trend direction
    pub trend: f64,
    /// Timestamp of last update
    pub timestamp_ns: i64,
}

/// Latency model for Paper fill simulation, mirroring the engine's LatencyModel.
#[derive(Clone, Debug)]
pub struct LatencyModel {
    /// Entry latency component (order creation time)
    pub order_creation_ns: i64,
    /// Exchange arrival latency component
    pub exchange_arrival_ns: i64,
    /// Fill response latency component
    pub fill_ns: i64,
}

impl LatencyModel {
    /// Compute total fill latency as sum of components
    pub fn total_latency_ns(&self) -> i64 {
        self.order_creation_ns + self.exchange_arrival_ns + self.fill_ns
    }

    /// Compute fill latency for a full fill
    pub fn compute_fill_latency(&self, size: f64, price: f64) -> i64 {
        // Simplified: base latency + size/proice factor
        let base = 1_000_000_i64; // 1ms base
        let size_factor = (size * 10.0) as i64;
        let price_factor = (price * 100.0) as i64;
        base + size_factor + price_factor
    }

    /// Compute partial fill latency
    pub fn compute_partial_fill_latency(&self, filled_size: f64, price: f64) -> i64 {
        // Partial fills have reduced latency proportionally
        (self.total_latency_ns() as f64 * (filled_size / price.max(1.0))) as i64
    }
}

/// Market data snapshot used by the Paper fill simulation.
#[derive(Clone, Debug)]
pub struct MarketData {
    /// Symbol being traded
    pub symbol: String,
    /// Exchange identifier
    pub exchange: String,
    /// Current best bid
    pub best_bid: f64,
    /// Current best ask
    pub best_ask: f64,
    /// Current mid price
    pub mid_price: f64,
    /// Current volatility
    pub volatility: f64,
    /// Timestamp in nanoseconds
    pub timestamp_ns: i64,
}

impl MarketData {
    /// Create MarketData from live order book snapshot
    pub fn from_live_snapshot(snapshot: &OrderBookSnapshot) -> Self {
        let mid = (snapshot.best_bid + snapshot.best_ask) / 2.0;
        Self {
            symbol: snapshot.symbol.clone(),
            exchange: snapshot.exchange.clone(),
            best_bid: snapshot.best_bid,
            best_ask: snapshot.best_ask,
            mid_price: mid,
            volatility: snapshot.volatility,
            timestamp_ns: snapshot.timestamp_ns,
        }
    }
}

/// Order book snapshot from live market data.
#[derive(Clone, Debug)]
pub struct OrderBookSnapshot {
    /// Symbol being traded
    pub symbol: String,
    /// Exchange identifier
    pub exchange: String,
    /// Best bid price
    pub best_bid: f64,
    /// Best ask price
    pub best_ask: f64,
    /// Timestamp in nanoseconds
    pub timestamp_ns: i64,
    /// Current volatility
    pub volatility: f64,
}

/// Extended event factory functions for Paper fill simulation
impl ExtendedEvent {
    /// Create a Fill event for Paper mode simulation
    pub fn new_fill(
        order_id: u64,
        side: Side,
        price: f64,
        size: f64,
        queue_ahead_estimate: f64,
        latency_breakdown: LatencyBreakdown,
    ) -> Self {
        ExtendedEvent {
            timestamp_ns: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos() as i64,
            event_type: ExtendedEventType::Fill,
            order_id: order_id as i64,
            side: Some(side),
            price: Some(price),
            size: Some(size),
            queue_ahead_estimate: Some(queue_ahead_estimate),
            fill_probability_estimate: Some(1.0),
            market_state_snapshot_ref: None,
            latency_breakdown: Some(latency_breakdown),
        }
    }

    /// Create a PartialFill event for Paper mode simulation
    pub fn new_partial_fill(
        order_id: u64,
        side: Side,
        price: f64,
        fill_size: f64,
        remaining: f64,
        queue_ahead_estimate: f64,
        latency_breakdown: LatencyBreakdown,
    ) -> Self {
        ExtendedEvent {
            timestamp_ns: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos() as i64,
            event_type: ExtendedEventType::PartialFill,
            order_id: order_id as i64,
            side: Some(side),
            price: Some(price),
            size: Some(fill_size),
            queue_ahead_estimate: Some(queue_ahead_estimate),
            fill_probability_estimate: Some(fill_size / size.max(1.0)),
            market_state_snapshot_ref: None,
            latency_breakdown: Some(latency_breakdown),
        }
    }

    /// Create a QueueUpdate event for Paper mode simulation
    pub fn new_queue_update(
        order_id: u64,
        side: Side,
        price: f64,
        size: f64,
        queue_ahead_estimate: f64,
    ) -> Self {
        ExtendedEvent {
            timestamp_ns: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos() as i64,
            event_type: ExtendedEventType::QueueUpdate,
            order_id: order_id as i64,
            side: Some(side),
            price: Some(price),
            size: Some(size),
            queue_ahead_estimate: Some(queue_ahead_estimate),
            fill_probability_estimate: Some(0.0),
            market_state_snapshot_ref: None,
            latency_breakdown: None,
        }
    }
}

/// Latency breakdown carried per event (docs/05 §5.5).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LatencyBreakdown {
    /// Strategy compute time before the order call
    pub decision_ns: i64,
    /// Entry latency (LatencyModel::entry)
    pub order_creation_ns: i64,
    /// Exchange processing up to fill/cancel decision
    pub exchange_arrival_ns: i64,
    /// Response latency back to local (LatencyModel::response)
    pub fill_ns: i64,
}