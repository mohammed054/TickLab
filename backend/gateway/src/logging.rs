// Structured logging utility for TickLab services.
// Emits JSON log lines with: timestamp, category, level, service, message, context.
// Categories: Market, Strategy, Orders, Execution, Risk, Data, System, Errors.
// Levels: Debug, Info, Warning, Error, Critical.
// Redaction: credential/secret fields are redacted to ***REDACTED***
// (per docs/14-cross-cutting-systems.md §14.4).

use serde::Serialize;
use std::fmt;
use tracing::field::{Field, Visit};
use tracing::Span;
use tracing_subscriber::fmt::MakeVisitor;
use uuid::Uuid;
use chrono::Utc;

// ----- Log categories (per docs/14-cross-cutting-systems.md §14.4) -----

/// Categories of structured logs (per docs/14-cross-cutting-systems.md §14.4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LogCategory {
    Market,
    Strategy,
    Orders,
    Execution,
    Risk,
    Data,
    System,
    Errors,
}

/// Levels of structured logs (per docs/14-cross-cutting-systems.md §14.4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
    Critical,
}

// ----- Log context -----

/// Context information for a log line (order ID, experiment ID, dataset ID, etc.).
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogContext {
    /// Identifier of the object this log concerns (order ID, experiment ID, etc.)
    pub object_id: Option<String>,
    /// Timestamp of the event (overrides default if provided)
    pub event_timestamp: Option<String>,
    /// Additional key-value pairs
    pub extra: Vec<(String, String)>,
}

/// A structured log line emitted by the logging system.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredLog {
    /// ISO-8601 timestamp
    pub timestamp: String,
    /// Log category
    pub category: String,
    /// Log level
    pub level: String,
    /// Service name (module/crate emitting the log)
    pub service: String,
    /// Log message
    pub message: String,
    /// Context object ID and additional metadata
    pub context: Option<LogContext>,
}

impl fmt::Display for LogCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LogCategory::Market => write!(f, "Market"),
            LogCategory::Strategy => write!(f, "Strategy"),
            LogCategory::Orders => write!(f, "Orders"),
            LogCategory::Execution => write!(f, "Execution"),
            LogCategory::Risk => write!(f, "Risk"),
            LogCategory::Data => write!(f, "Data"),
            LogCategory::System => write!(f, "System"),
            LogCategory::Errors => write!(f, "Errors"),
        }
    }
}

impl fmt::Display for LogLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LogLevel::Debug => write!(f, "debug"),
            LogLevel::Info => write!(f, "info"),
            LogLevel::Warning => write!(f, "warning"),
            LogLevel::Error => write!(f, "error"),
            LogLevel::Critical => write!(f, "critical"),
        }
    }
}

impl StructuredLog {
    /// Create a new structured log line.
    pub fn new(
        category: LogCategory,
        level: LogLevel,
        service: &str,
        message: &str,
        context: Option<LogContext>,
    ) -> Self {
        let mut ctx = context;
        // Redact sensitive fields
        if let Some(ref mut c) = ctx {
            if let Some(extra) = c.extra.as_mut() {
                for (key, value) in extra.iter_mut() {
                    if key.to_lowercase().contains("key")
                        || key.to_lowercase().contains("secret")
                        || key.to_lowercase().contains("token")
                        || key.to_lowercase().contains("credential")
                    {
                        *value = "**REDACTED***".to_string();
                    }
                }
            }
        }

        Self {
            timestamp: Utc::now().to_rfc3339(),
            category: category.to_string(),
            level: level.to_string(),
            service: service.to_string(),
            message: message.to_string(),
            context,
        }
    }
}

/// Emit a structured log line via tracing.
/// This can be called from any service module to emit JSON-structured logs.
pub fn emit(
    category: LogCategory,
    level: LogLevel,
    service: &str,
    message: &str,
    context: Option<LogContext>,
) -> StructuredLog {
    let log_entry = StructuredLog::new(category, level, service, message, context);

    // Convert to JSON for tracing
    let json = serde_json::to_string(&log_entry).unwrap_or_else(|e| {
        // Fallback to plain text if JSON serialization fails
        tracing::warn!("failed to serialize structured log: {e}");
        return log_entry;
    });

    // Emit via tracing - the json formatter will output the JSON
    tracing::info!(category = %log_entry.category, level = %log_entry.level, service = %log_entry.service, message = %log_entry.message, log_json = %json, "structured_log_entry");

    log_entry
}

/// Convenience function for creating a LogContext.
pub fn context(object_id: Option<&str>, event_timestamp: Option<&str>, extra: Vec<(String, String)>) -> LogContext {
    LogContext {
        object_id: object_id.map(|s| s.to_string()),
        event_timestamp: event_timestamp.map(|s| s.to_string()),
        extra,
    }
}

// Redaction utility - called before persisting or transmitting logs
pub fn redact_log_entry(entry: &mut StructuredLog) {
    if let Some(ref mut ctx) = entry.context {
        if let Some(extra) = ctx.extra.as_mut() {
            for (key, value) in extra.iter_mut() {
                if key.to_lowercase().contains("key")
                    || key.to_lowercase().contains("secret")
                    || key.to_lowercase().contains("token")
                    || key.to_lowercase().contains("credential")
                {
                    *value = "**REDACTED***".to_string();
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_structured_log_creation() {
        let ctx = LogContext {
            object_id: Some("ORD123".to_string()),
            extra: vec![("order_id".to_string(), "ORD123".to_string()), ("secret_key".to_string(), "sk-abc123".to_string())],
            ..Default::default()
        };
        let mut log = StructuredLog::new(
            LogCategory::Orders,
            LogLevel::Info,
            "gateway",
            "Order fill simulation completed",
            Some(ctx),
        );

        // Test redaction
        redact_log_entry(&mut log);

        let json = serde_json::to_string(&log).unwrap();
        let parsed: StructuredLog = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.category, "Orders");
        assert_eq!(parsed.level, "info");
        assert_eq!(parsed.service, "gateway");
        assert_eq!(parsed.message, "Order fill simulation completed");
        // After redaction, the secret_key value should be redacted
        if let Some(ref ctx) = parsed.context {
            let has_redacted = ctx.extra.iter().any(|(k, v)| k == "secret_key" && v == "**REDACTED***");
            assert!(has_redacted, "Secret key should be redacted");
        }
    }

    #[test]
    fn test_log_category_display() {
        assert_eq!(format!("{}", LogCategory::Market), "Market");
        assert_eq!(format!("{}", LogCategory::Strategy), "Strategy");
    }

    #[test]
    fn test_log_level_display() {
        assert_eq!(format!("{}", LogLevel::Info), "info");
        assert_eq!(format!("{}", LogLevel::Error), "error");
    }

    #[test]
    fn test_context_creation() {
        let ctx = context(Some("ORD123"), Some("2024-01-01T00:00:00Z"), vec![("key1".to_string(), "val1".to_string())]);
        assert_eq!(ctx.object_id, Some("ORD123".to_string()));
        assert_eq!(ctx.event_timestamp, Some("2024-01-01T00:00:00Z".to_string()));
        assert_eq!(ctx.extra.len(), 1);
    }
}