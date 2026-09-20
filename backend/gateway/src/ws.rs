//! Gateway WebSocket endpoint (`docs/15` §15.3).
//!
//! One connection per client session (`/api/v1/ws?session={token}`); both
//! monitor windows share the token so the Sync Bus replicates across windows
//! and devices (`docs/02` §2.3). The task below multiplexes three inbound
//! sources: client frames, direct hub messages (acks/errors/instant state),
//! and Sync Bus broadcasts (self-sent envelopes skipped by `sender_conn`).

use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Response,
    routing::get,
    Json, Router,
};
use futures::{SinkExt, StreamExt};

use crate::auth::validate_session_token;
use crate::hub::Hub;
use crate::progress::{run_job_forwarder, JobsClient};
use crate::protocol::{validate_publish, ClientMsg, ServerMsg, Topic, WireError};

/// Shared gateway state.
#[derive(Clone)]
pub struct AppState {
    pub hub: Arc<Hub>,
    pub jobs: JobsClient,
}

/// `GET /api/v1/ws?session={token}` (`docs/15` §15.3).
async fn ws_handler(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
    ws: WebSocketUpgrade,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let session = validate_session_token(params.get("session").map(String::as_str))
        .map_err(|(status, body)| (status, Json(body)))?;
    Ok(ws.on_upgrade(move |socket| handle_socket(state, session, socket)))
}

pub fn ws_route() -> Router<AppState> {
    Router::new().route("/api/v1/ws", get(ws_handler))
}

async fn send_msg(
    sink: &mut futures::stream::SplitSink<WebSocket, Message>,
    msg: &ServerMsg,
) -> bool {
    match serde_json::to_string(msg) {
        Ok(text) => sink.send(Message::Text(text)).await.is_ok(),
        Err(_) => false,
    }
}

async fn send_error(
    sink: &mut futures::stream::SplitSink<WebSocket, Message>,
    error: WireError,
) -> bool {
    send_msg(sink, &ServerMsg::Error { error }).await
}

async fn handle_socket(state: AppState, session: String, socket: WebSocket) {
    let (conn, mut direct_rx, mut sync_rx) = state.hub.connect(&session);
    let (mut sink, mut stream) = socket.split();

    loop {
        tokio::select! {
            msg = direct_rx.recv() => {
                let Some(msg) = msg else { break };
                if !send_msg(&mut sink, &msg).await {
                    break;
                }
            }
            env = sync_rx.recv() => {
                match env {
                    Ok(env) => {
                        // Never re-apply our own just-sent update (docs/15 §15.3.4).
                        if env.sender_conn == conn {
                            continue;
                        }
                        if !send_msg(&mut sink, &ServerMsg::Sync {
                            topic: crate::protocol::WORKSPACE_SYNC_TOPIC.to_string(),
                            origin: env.origin,
                            patch: env.patch,
                        })
                        .await
                        {
                            break;
                        }
                    }
                    // Lagged: skip missed envelopes rather than stalling (docs/03 §3.6).
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        tracing::warn!("sync subscriber lagged; skipping missed patches");
                        continue;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            frame = stream.next() => {
                match frame {
                    Some(Ok(Message::Text(text))) => {
                        if !handle_client_text(&state, &session, conn, &mut sink, &text).await {
                            break;
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        if sink.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Binary(_))) => {
                        if !send_error(&mut sink, WireError::invalid_message(
                            "binary frames are not supported; send JSON text".to_string(),
                        ))
                        .await
                        {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                }
            }
        }
    }

    state.hub.disconnect(&session, conn);
}

/// Handle one client text frame. Returns false when the connection is dead.
async fn handle_client_text(
    state: &AppState,
    session: &str,
    conn: u64,
    sink: &mut futures::stream::SplitSink<WebSocket, Message>,
    text: &str,
) -> bool {
    let msg: ClientMsg = match serde_json::from_str(text) {
        Ok(msg) => msg,
        Err(e) => {
            return send_error(
                sink,
                WireError::invalid_message(format!("malformed JSON frame: {e}")),
            )
            .await;
        }
    };
    match msg {
        ClientMsg::Subscribe { topic } => {
            let parsed = match Topic::parse(&topic) {
                Ok(t) => t,
                Err(e) => return send_error(sink, e).await,
            };
            let canonical = state.hub.subscribe(session, conn, &parsed);
            if !send_msg(
                sink,
                &ServerMsg::Ack {
                    r#type: "subscribed".to_string(),
                    topic: canonical.clone(),
                },
            )
            .await
            {
                return false;
            }
            if let Topic::JobProgress(job_id) = parsed {
                subscribe_job_progress(state, session, &job_id, sink).await;
            }
            true
        }
        ClientMsg::Unsubscribe { topic } => {
            let canonical = Topic::parse(&topic).map(|t| t.as_str()).unwrap_or(topic);
            state.hub.unsubscribe(session, conn, &canonical);
            send_msg(
                sink,
                &ServerMsg::Ack {
                    r#type: "unsubscribed".to_string(),
                    topic: canonical,
                },
            )
            .await
        }
        ClientMsg::Publish {
            topic,
            origin,
            patch,
        } => {
            if let Err(e) = validate_publish(&topic, &origin, &patch) {
                return send_error(sink, e).await;
            }
            state.hub.publish_sync(session, conn, origin, patch);
            true
        }
    }
}

/// After a progress subscribe: push the current snapshot immediately
/// (`docs/08` §8.14: re-opening re-subscribes to the same topic and must see
/// state at once), then ensure a forwarder streams further updates.
async fn subscribe_job_progress(
    state: &AppState,
    session: &str,
    job_id: &str,
    sink: &mut futures::stream::SplitSink<WebSocket, Message>,
) {
    match state.jobs.fetch_progress(job_id).await {
        Ok(Some(progress)) => {
            let _ = send_msg(
                sink,
                &ServerMsg::Progress {
                    topic: crate::protocol::job_progress_topic(job_id),
                    progress,
                },
            )
            .await;
        }
        Ok(None) => {
            let _ = send_error(
                sink,
                WireError::new(
                    "JOB_GONE",
                    format!("job '{job_id}' is unknown to the jobs service"),
                    Some("Resubmit the job; the jobs service may have restarted."),
                ),
            )
            .await;
            return;
        }
        Err(e) => {
            tracing::warn!("initial progress fetch failed: {e}");
        }
    }
    let topic = crate::protocol::job_progress_topic(job_id);
    if state.hub.needs_forwarder(session, &topic) {
        let hub = Arc::clone(&state.hub);
        let jobs = state.jobs.clone();
        let session_owned = session.to_string();
        let job_owned = job_id.to_string();
        let join = tokio::spawn(async move {
            run_job_forwarder(hub, jobs, session_owned, job_owned).await;
        });
        if !state
            .hub
            .set_forwarder(session, &topic, join.abort_handle())
        {
            // Lost the race: the registered forwarder already serves these
            // subscribers, so stop the duplicate to avoid double delivery.
            join.abort();
        }
    }
}
