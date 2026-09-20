//! Local top-N order-book state (`docs/06` §6.2: the connector "maintains
//! local order-book state"; §6.3: the Market Data Service maintains the
//! snapshot for reconnect catch-up).
//!
//! Levels are keyed by raw `f64` bits so no decimal/`ordered-float` dependency
//! is needed; sorting happens at snapshot time. Applying a delta with
//! `qty <= 0.0` removes the level.

use std::collections::HashMap;

/// One price level.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Level {
    pub price: f64,
    pub qty: f64,
}

/// Top-N book for one symbol, maintained from exchange deltas.
#[derive(Clone, Debug, Default)]
pub struct TopBook {
    bids: HashMap<u64, f64>,
    asks: HashMap<u64, f64>,
    /// Last exchange sequence number applied (`MarketEvent.sequence`).
    pub sequence: Option<i64>,
}

impl TopBook {
    pub fn new() -> Self {
        Self::default()
    }

    /// Apply one delta level. `is_bid` selects the side; `qty <= 0.0` removes.
    pub fn apply_delta(&mut self, is_bid: bool, price: f64, qty: f64) {
        if !price.is_finite() || price <= 0.0 || !qty.is_finite() {
            return;
        }
        let side = if is_bid {
            &mut self.bids
        } else {
            &mut self.asks
        };
        if qty <= 0.0 {
            side.remove(&price.to_bits());
        } else {
            side.insert(price.to_bits(), qty);
        }
    }

    /// Record the exchange sequence number of the applied batch.
    pub fn set_sequence(&mut self, seq: i64) {
        self.sequence = Some(seq);
    }

    fn top(side: &HashMap<u64, f64>, depth: usize, desc: bool) -> Vec<Level> {
        let mut levels: Vec<Level> = side
            .iter()
            .map(|(bits, qty)| Level {
                price: f64::from_bits(*bits),
                qty: *qty,
            })
            .collect();
        if desc {
            levels.sort_by(|a, b| {
                b.price
                    .partial_cmp(&a.price)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        } else {
            levels.sort_by(|a, b| {
                a.price
                    .partial_cmp(&b.price)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        }
        levels.truncate(depth);
        levels
    }

    /// Best bid/ask, if any.
    pub fn best_bid_ask(&self) -> (Option<Level>, Option<Level>) {
        let bids = Self::top(&self.bids, 1, true);
        let asks = Self::top(&self.asks, 1, false);
        (bids.into_iter().next(), asks.into_iter().next())
    }

    /// Snapshot the top `depth` levels per side.
    pub fn snapshot(&self, depth: usize) -> (Vec<Level>, Vec<Level>) {
        (
            Self::top(&self.bids, depth, true),
            Self::top(&self.asks, depth, false),
        )
    }

    /// Drop everything beyond the best `keep_per_side` levels per side.
    /// Bounds memory on long-lived connections (deep levels that fall out of
    /// the served top-N can never affect a future snapshot).
    pub fn prune(&mut self, keep_per_side: usize) {
        for (side, desc) in [(&mut self.bids, true), (&mut self.asks, false)] {
            if side.len() <= keep_per_side {
                continue;
            }
            let mut levels: Vec<(u64, f64)> = side.iter().map(|(b, q)| (*b, *q)).collect();
            levels.sort_by(|(a, _), (b, _)| {
                let (pa, pb) = (f64::from_bits(*a), f64::from_bits(*b));
                if desc {
                    pb.partial_cmp(&pa).unwrap_or(std::cmp::Ordering::Equal)
                } else {
                    pa.partial_cmp(&pb).unwrap_or(std::cmp::Ordering::Equal)
                }
            });
            levels.truncate(keep_per_side);
            *side = levels.into_iter().collect();
        }
    }

    /// Number of stored levels (both sides).
    pub fn len(&self) -> usize {
        self.bids.len() + self.asks.len()
    }

    pub fn is_empty(&self) -> bool {
        self.bids.is_empty() && self.asks.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deltas_maintain_sorted_top_n() {
        let mut book = TopBook::new();
        book.apply_delta(true, 100.0, 1.0);
        book.apply_delta(true, 101.0, 2.0);
        book.apply_delta(true, 99.0, 3.0);
        book.apply_delta(false, 102.0, 1.5);
        book.apply_delta(false, 103.0, 0.5);
        let (bids, asks) = book.snapshot(2);
        assert_eq!(bids.len(), 2);
        assert_eq!(bids[0].price, 101.0);
        assert_eq!(bids[1].price, 100.0);
        assert_eq!(asks[0].price, 102.0);
        assert_eq!(asks[1].price, 103.0);
    }

    #[test]
    fn zero_qty_removes_level_and_garbage_ignored() {
        let mut book = TopBook::new();
        book.apply_delta(true, 100.0, 1.0);
        book.apply_delta(true, 100.0, 0.0);
        assert!(book.is_empty());
        book.apply_delta(false, f64::NAN, 1.0);
        book.apply_delta(false, -5.0, 1.0);
        assert!(book.is_empty());
    }

    #[test]
    fn prune_keeps_best_levels_per_side() {
        let mut book = TopBook::new();
        for px in [100.0, 101.0, 102.0, 103.0] {
            book.apply_delta(true, px, 1.0);
            book.apply_delta(false, px + 10.0, 1.0);
        }
        book.prune(2);
        let (bids, asks) = book.snapshot(10);
        assert_eq!(
            bids.iter().map(|l| l.price).collect::<Vec<_>>(),
            vec![103.0, 102.0]
        );
        assert_eq!(
            asks.iter().map(|l| l.price).collect::<Vec<_>>(),
            vec![110.0, 111.0]
        );
    }

    #[test]
    fn best_bid_ask_reported() {
        let mut book = TopBook::new();
        assert_eq!(book.best_bid_ask(), (None, None));
        book.apply_delta(true, 100.0, 1.0);
        book.apply_delta(false, 101.0, 1.0);
        let (bid, ask) = book.best_bid_ask();
        assert_eq!(bid.map(|l| l.price), Some(100.0));
        assert_eq!(ask.map(|l| l.price), Some(101.0));
    }
}
