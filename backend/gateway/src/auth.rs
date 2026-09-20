//! Session token validation.
//!
//! Both monitor windows join the same Gateway WebSocket session via a shared
//! token (`docs/15` §15.3 `?session={token}`, `docs/02` §2.3). Token issuance
//! (login/launch) is outside Block 2.8; here a token is an opaque bearer
//! string, validated for shape only. Sessions are fully isolated: a message
//! published in one session is never visible in another.

/// Token length cap (transport guard).
pub const MAX_TOKEN_LEN: usize = 128;

/// Validate the raw `?session=` query value.
pub fn validate_session_token(
    raw: Option<&str>,
) -> Result<String, (axum::http::StatusCode, serde_json::Value)> {
    use axum::http::StatusCode;
    let token = raw.unwrap_or("").trim();
    if token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            serde_json::json!({"code": "SESSION_REQUIRED", "message": "missing ?session= token (docs/15 §15.3)", "action": "Reconnect with ?session={token} shared by both monitor windows."}),
        ));
    }
    if token.len() > MAX_TOKEN_LEN
        || !token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err((
            StatusCode::UNAUTHORIZED,
            serde_json::json!({"code": "SESSION_INVALID", "message": "malformed session token", "action": "Reconnect with the ?session= token issued at launch."}),
        ));
    }
    Ok(token.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_validated() {
        assert!(validate_session_token(Some("sess_abc-123")).is_ok());
        assert!(validate_session_token(None).is_err());
        assert!(validate_session_token(Some("")).is_err());
        assert!(validate_session_token(Some("has space")).is_err());
    }
}
