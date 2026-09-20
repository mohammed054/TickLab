//! Historical replay source — not yet wired (Block 5.1 is live-only).
//!
//! The Replay path (`docs/01` §1.2, `docs/06` §6.4) replays prepared datasets
//! through the same normalized schema, but dataset preparation belongs to the
//! Data Pipeline (Block 2.7) and replay UX to Phase 4. This module exists so
//! the wiring point is explicit and honest: [`ReplaySource::disabled`]
//! yields no events, and the REST layer reports "no data yet" rather than
//! fabricating history (`docs/06` §6.5, `docs/14` §14.7).

use ticklab_connectors_common::events::MarketEvent;

/// Replay cursor over a prepared dataset. `None` until a later block wires a
/// real dataset reader here. Dead in bin builds until then (constructed in
/// tests to pin the honest-disabled behavior).
#[derive(Debug, Default)]
pub struct ReplaySource {
    enabled: bool,
}

#[allow(dead_code)]
impl ReplaySource {
    pub fn disabled() -> Self {
        Self { enabled: false }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Next replay event, or `None` when disabled/exhausted.
    pub fn next(&mut self) -> Option<MarketEvent> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_replay_yields_nothing() {
        let mut src = ReplaySource::disabled();
        assert!(!src.is_enabled());
        assert!(src.next().is_none());
    }
}
