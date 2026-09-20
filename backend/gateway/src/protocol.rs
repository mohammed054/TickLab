//! WebSocket wire protocol (`docs/15` §15.3, §15.3.4).
//!
//! Client → server frames (JSON text):
//! - `{"action":"subscribe","topic":"..."}` — join a topic in this session.
//! - `{"action":"unsubscribe","topic":"..."}` — leave a topic.
//! - `{"action":"publish","topic":"workspace.sync","origin":"main"|"secondary","patch":{...}}`
//!   — Sync Bus patch fan-out. The gateway forwards the patch opaquely; it
//!   never interprets business meaning (`docs/15` §15.3.4).
//!
//! Server → client frames:
//! - `{"topic":"workspace.sync","origin":"...","patch":{...}}` — fanned-out patch.
//! - `{"topic":"job.{id}.progress","progress":{...}}` — progress snapshot
//!   (`docs/15` §15.5 `BacktestProgress` shape, rendered by `docs/08` §8.14).
//! - `{"type":"subscribed","topic":"..."}` / `{"type":"unsubscribed","topic":"..."}`
//!   — subscription acks (smallest addition: lets clients order
//!   subscribe-before-publish deterministically; logged in STATE.md).
//! - `{"error":{"code":...,"message":...,"action":...}}` — typed,
//!   actionable errors that never close the connection (`docs/14` §14.9).

use serde::{Deserialize, Serialize};

/// Sync Bus replication topic (`docs/15` §15.3.4). Must equal
/// `ticklab_jobs::bus::WORKSPACE_SYNC_TOPIC` — enforced by the gateway
/// acceptance test (single source of truth is `docs/15` §15.3).
pub const WORKSPACE_SYNC_TOPIC: &str = "workspace.sync";

/// Progress topic for one job (`docs/15` §15.3 `job.{jobId}.progress`).
/// Must equal `ticklab_jobs::bus::job_progress_topic` (same test).
pub fn job_progress_topic(job_id: &str) -> String {
    format!("job.{job_id}.progress")
}

/// Maximum topic length (transport guard, not a spec value).
pub const MAX_TOPIC_LEN: usize = 256;

/// Maximum `workspace.sync` patch size in serialized bytes (transport guard).
pub const MAX_PATCH_BYTES: usize = 64 * 1024;

/// Client → server message.
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "action", rename_all = "lowercase")]
pub enum ClientMsg {
    Subscribe {
        topic: String,
    },
    Unsubscribe {
        topic: String,
    },
    Publish {
        topic: String,
        origin: String,
        patch: serde_json::Value,
    },
}

/// Server → client message.
#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum ServerMsg {
    /// Fanned-out Sync Bus patch (`docs/15` §15.3.4).
    Sync {
        topic: String,
        origin: String,
        patch: serde_json::Value,
    },
    /// Job progress snapshot (`docs/15` §15.5).
    Progress {
        topic: String,
        progress: serde_json::Value,
    },
    /// Subscription acknowledgement.
    Ack { r#type: String, topic: String },
    /// Typed error; the connection stays open.
    Error { error: WireError },
}

/// Typed wire error (`docs/14` §14.9: actionable, never bare).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
}

impl WireError {
    pub fn new(code: &str, message: String, action: Option<&str>) -> Self {
        Self {
            code: code.to_string(),
            message,
            action: action.map(str::to_string),
        }
    }

    pub fn unknown_topic(topic: &str) -> Self {
        Self::new(
            "UNKNOWN_TOPIC",
            format!("no such topic '{topic}' in this phase"),
            Some("Subscribe to workspace.sync or job.{jobId}.progress; market.* topics arrive with later phases."),
        )
    }

    pub fn invalid_message(message: String) -> Self {
        Self::new(
            "INVALID_MESSAGE",
            message,
            Some("Send {action: subscribe|unsubscribe|publish, topic, ...} as JSON text."),
        )
    }
}

/// A validated subscription target.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Topic {
    /// `workspace.sync` — both monitors' shared context (`docs/02` §2.3).
    WorkspaceSync,
    /// `job.{id}.progress` — one job's progress (`docs/08` §8.14).
    JobProgress(String),
}

impl Topic {
    /// Validate a raw topic string. Market/data/alert topics from `docs/15`
    /// §15.3 that belong to later phases are rejected with a typed error,
    /// not silently dropped.
    pub fn parse(raw: &str) -> Result<Self, WireError> {
        if raw.is_empty() || raw.len() > MAX_TOPIC_LEN {
            return Err(WireError::invalid_message(format!(
                "topic must be 1–{MAX_TOPIC_LEN} chars"
            )));
        }
        if raw == WORKSPACE_SYNC_TOPIC {
            return Ok(Topic::WorkspaceSync);
        }
        if let Some(id) = raw
            .strip_prefix("job.")
            .and_then(|s| s.strip_suffix(".progress"))
        {
            if !id.is_empty()
                && id.len() <= 128
                && id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                return Ok(Topic::JobProgress(id.to_string()));
            }
            return Err(WireError::invalid_message(format!(
                "malformed job progress topic '{raw}'"
            )));
        }
        Err(WireError::unknown_topic(raw))
    }

    pub fn as_str(&self) -> String {
        match self {
            Topic::WorkspaceSync => WORKSPACE_SYNC_TOPIC.to_string(),
            Topic::JobProgress(id) => job_progress_topic(id),
        }
    }
}

/// Validate a publish origin (`docs/15` §15.3.4: `"main" | "secondary"`).
pub fn parse_origin(raw: &str) -> Result<&str, WireError> {
    match raw {
        "main" | "secondary" => Ok(raw),
        _ => Err(WireError::invalid_message(format!(
            "origin must be \"main\" or \"secondary\" (docs/15 §15.3.4), got '{raw}'"
        ))),
    }
}

/// Validate a publish request: only `workspace.sync` is client-publishable,
/// the patch must be a JSON object within the size cap. Business meaning is
/// never interpreted (`docs/15` §15.3.4).
pub fn validate_publish(
    topic: &str,
    origin: &str,
    patch: &serde_json::Value,
) -> Result<(), WireError> {
    if topic != WORKSPACE_SYNC_TOPIC {
        return Err(WireError::new(
            "PUBLISH_NOT_ALLOWED",
            format!("clients may only publish to {WORKSPACE_SYNC_TOPIC}; {topic} is server-published"),
            Some("Subscribe to job.{jobId}.progress to receive progress; publish patches to workspace.sync."),
        ));
    }
    parse_origin(origin)?;
    if !patch.is_object() {
        return Err(WireError::invalid_message(
            "patch must be a JSON object (partial WorkspaceContext, docs/02 §2.3.1)".to_string(),
        ));
    }
    let bytes = serde_json::to_vec(patch)
        .map(|v| v.len())
        .unwrap_or(MAX_PATCH_BYTES + 1);
    if bytes > MAX_PATCH_BYTES {
        return Err(WireError::invalid_message(format!(
            "patch exceeds the {MAX_PATCH_BYTES}-byte cap; send smaller partial patches"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn topics_parse() {
        assert_eq!(Topic::parse("workspace.sync"), Ok(Topic::WorkspaceSync));
        assert_eq!(
            Topic::parse("job.job-1.progress"),
            Ok(Topic::JobProgress("job-1".to_string()))
        );
        assert!(Topic::parse("market.BTCUSDT.depth").is_err());
        assert!(Topic::parse("job..progress").is_err());
        assert!(Topic::parse("").is_err());
    }

    #[test]
    fn origins_restricted_to_windows() {
        assert!(parse_origin("main").is_ok());
        assert!(parse_origin("secondary").is_ok());
        assert!(parse_origin("laptop").is_err());
    }

    #[test]
    fn only_sync_is_publishable() {
        let patch = serde_json::json!({"timestamp": 1});
        assert!(validate_publish("workspace.sync", "main", &patch).is_ok());
        assert!(validate_publish("job.job-1.progress", "main", &patch).is_err());
        assert!(validate_publish("workspace.sync", "main", &serde_json::json!([1])).is_err());
        assert!(validate_publish("workspace.sync", "tertiary", &patch).is_err());
    }
}
