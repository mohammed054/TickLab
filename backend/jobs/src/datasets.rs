//! OHLCV dataset store: upload → validate → persist on disk (STATE.md [V.1]).
//!
//! Real vertical-slice storage for owner-uploaded OHLCV CSVs. Layout under
//! the data root (`TICKLAB_DATA_DIR`, default `./data`, gitignored):
//!
//! ```text
//! data/
//!   datasets/<dataset_id>/bars.csv     ← the uploaded file, verbatim
//!   datasets/<dataset_id>/meta.json    ← validation summary
//!   results/<job_id>.json              ← full real backtest result
//! ```
//!
//! Parsing/validation is delegated to `ticklab-engine-ohlcv`
//! (`parse_ohlcv_csv`) — no validation logic is duplicated here, and no
//! dataset metadata is ever synthesized.

use std::fs;
use std::path::PathBuf;

use ticklab_engine_ohlcv::{parse_ohlcv_csv, DatasetSummary, OhlcvBar, OhlcvError};

pub struct DatasetStore {
    root: PathBuf,
}

impl DatasetStore {
    /// Data root from `TICKLAB_DATA_DIR` (default `./data`).
    pub fn new() -> Self {
        let root = PathBuf::from(
            std::env::var("TICKLAB_DATA_DIR").unwrap_or_else(|_| "data".to_string()),
        );
        Self { root }
    }

    /// Explicit-root constructor (tests; production reads the env).
    pub fn with_root(root: PathBuf) -> Self {
        Self { root }
    }

    fn dataset_dir(&self, dataset_id: &str) -> PathBuf {
        // Ids are engine-generated (`ohlcv-<hex>`); refuse anything that
        // could traverse paths.
        let safe = dataset_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        debug_assert!(safe);
        self.root.join("datasets").join(dataset_id)
    }

    /// Validate and persist an uploaded CSV; returns the real summary.
    pub fn save(&self, text: &str, source_name: &str) -> Result<DatasetSummary, OhlcvError> {
        let (summary, _) = parse_ohlcv_csv(text, source_name)?;
        let dir = self.dataset_dir(&summary.dataset_id);
        fs::create_dir_all(&dir)
            .map_err(|e| OhlcvError::InvalidCsv(format!("cannot create dataset dir: {e}")))?;
        fs::write(dir.join("bars.csv"), text)
            .map_err(|e| OhlcvError::InvalidCsv(format!("cannot write bars.csv: {e}")))?;
        let meta = serde_json::json!({
            "datasetId": summary.dataset_id,
            "barCount": summary.bar_count,
            "startNs": summary.start_ns,
            "endNs": summary.end_ns,
            "intervalNs": summary.interval_ns,
            "sourceName": summary.source_name,
        });
        fs::write(dir.join("meta.json"), serde_json::to_vec_pretty(&meta).unwrap_or_default())
            .map_err(|e| OhlcvError::InvalidCsv(format!("cannot write meta.json: {e}")))?;
        Ok(summary)
    }

    /// Load a persisted dataset: re-parse the stored CSV (the authoritative
    /// copy) and cross-check the stored metadata against it.
    pub fn load(&self, dataset_id: &str) -> Option<(DatasetSummary, Vec<OhlcvBar>)> {
        let dir = self.dataset_dir(dataset_id);
        let text = fs::read_to_string(dir.join("bars.csv")).ok()?;
        let (summary, bars) = parse_ohlcv_csv(&text, dataset_id).ok()?;
        if summary.dataset_id != dataset_id {
            return None; // stored bytes do not hash to this id: refuse
        }
        Some((summary, bars))
    }

    /// All persisted dataset summaries (empty entries skipped).
    pub fn list(&self) -> Vec<DatasetSummary> {
        let mut out = Vec::new();
        let Ok(entries) = fs::read_dir(self.root.join("datasets")) else {
            return out;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some((summary, _)) = self.load(&name) {
                out.push(summary);
            }
        }
        out.sort_by(|a, b| a.start_ns.cmp(&b.start_ns));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_store(tag: &str) -> DatasetStore {
        let dir = std::env::temp_dir().join(format!("ticklab-jobs-ds-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        DatasetStore::with_root(dir)
    }

    const CSV: &str = "timestamp,open,high,low,close,volume\n\
                       1704153600,10,11,9,10,1\n\
                       1704157200,10,12,9.5,11,1\n\
                       1704160800,11,12,10,10.5,1\n";

    #[test]
    fn save_list_load_round_trip() {
        let store = tmp_store("rt");
        let summary = store.save(CSV, "btc.csv").expect("save");
        assert!(summary.dataset_id.starts_with("ohlcv-"));
        assert_eq!(summary.bar_count, 3);

        let listed = store.list();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].dataset_id, summary.dataset_id);

        let (loaded, bars) = store.load(&summary.dataset_id).expect("load");
        assert_eq!(loaded.bar_count, 3);
        assert_eq!(bars.len(), 3);
        assert!((bars[2].close - 10.5).abs() < 1e-12);
    }

    #[test]
    fn load_rejects_id_content_mismatch() {
        let store = tmp_store("mm");
        let summary = store.save(CSV, "btc.csv").expect("save");
        assert!(store.load("ohlcv-deadbeefdeadbeef").is_none());
        assert!(store.load(&summary.dataset_id).is_some());
    }

    #[test]
    fn save_rejects_invalid_csv() {
        let store = tmp_store("bad");
        assert!(store.save("not,a,valid,header\n1,2,3,4\n", "x.csv").is_err());
    }
}
