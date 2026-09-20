//! Block 2.8 acceptance (`docs/16` Block 2.8):
//! 1. Two concurrent WS test clients see each other's `workspace.sync` patches.
//! 2. A submitted backtest job streams real progress and completes.
//!
//! Boots the real jobs service and the real gateway (HTTP proxy, not mocks)
//! on ephemeral ports and drives them with real WebSocket clients.

use std::time::Duration;

use futures::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::protocol::Message;

fn backtest_body(iterations: u32) -> serde_json::Value {
    serde_json::json!({
        "strategyRef": {"id": "s", "version": "1", "codeHash": "abc"},
        "parameters": {},
        "datasetId": "d",
        "dateRange": {"start": 1, "end": 100},
        "initialCapital": 1000.0,
        "executionModel": {
            "makerFeePct": 0.02, "takerFeePct": 0.05,
            "tickSize": 0.1, "lotSize": 0.001,
            "latencyModel": "fixed",
            "queueModelPreset": "probabilistic",
            "allowPartialFills": true
        },
        "riskLimits": {
            "maxPosition": 1.0, "maxOrderSize": 0.5, "maxDailyLoss": 100.0,
            "maxDrawdownPct": 5.0, "maxOpenOrders": 10,
            "maxOrderRatePerSec": 5.0, "maxNotionalExposure": 5000.0,
            "emergencyStopEnabled": true
        },
        "randomSeed": null,
        "iterations": iterations
    })
}

struct Servers {
    gateway_base: String,
    gateway_ws: String,
}

async fn boot() -> Servers {
    let jobs_state = ticklab_jobs::api::AppState::new(ticklab_jobs::queue::JobStore::new());
    let jobs_router = ticklab_jobs::api::router(jobs_state);
    let jobs_listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind jobs");
    let jobs_addr = jobs_listener.local_addr().expect("jobs addr");
    tokio::spawn(async move {
        axum::serve(jobs_listener, jobs_router)
            .await
            .expect("jobs serve");
    });

    let config = ticklab_gateway::GatewayConfig {
        jobs_base_url: format!("http://{jobs_addr}"),
    };
    let router = ticklab_gateway::build_router(&config).expect("gateway router");
    let gw_listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind gateway");
    let gw_addr = gw_listener.local_addr().expect("gateway addr");
    tokio::spawn(async move {
        axum::serve(gw_listener, router)
            .await
            .expect("gateway serve");
    });

    Servers {
        gateway_base: format!("http://{gw_addr}"),
        gateway_ws: format!("ws://{gw_addr}"),
    }
}

type WsStream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

struct Client {
    stream: WsStream,
}

impl Client {
    async fn connect(servers: &Servers, session: &str) -> Self {
        let url = format!("{}/api/v1/ws?session={session}", servers.gateway_ws);
        let (stream, _) = tokio_tungstenite::connect_async(&url)
            .await
            .expect("ws connect");
        Self { stream }
    }

    async fn send_json(&mut self, v: serde_json::Value) {
        self.stream
            .send(Message::Text(
                serde_json::to_string(&v).expect("json").into(),
            ))
            .await
            .expect("ws send");
    }

    /// Next text frame as JSON (fails on timeout/close/binary).
    async fn next_json(&mut self, timeout: Duration) -> serde_json::Value {
        let msg = tokio::time::timeout(timeout, self.stream.next())
            .await
            .expect("frame in time")
            .expect("stream open");
        match msg.expect("ws message") {
            Message::Text(t) => serde_json::from_str(&t).expect("json frame"),
            other => panic!("expected text frame, got {other:?}"),
        }
    }

    /// Expect silence within `timeout` (for self-exclusion checks).
    async fn expect_silence(&mut self, timeout: Duration) {
        match tokio::time::timeout(timeout, self.stream.next()).await {
            Err(_) => {}
            Ok(_) => panic!("expected silence, got a frame"),
        }
    }

    async fn subscribe(&mut self, topic: &str) {
        self.send_json(serde_json::json!({"action": "subscribe", "topic": topic}))
            .await;
        let ack = self.next_json(Duration::from_secs(5)).await;
        assert_eq!(ack["type"], "subscribed", "subscribe ack: {ack}");
        assert_eq!(ack["topic"], topic);
    }
}

#[test]
fn topic_names_match_jobs_service() {
    // Single source of truth is docs/15 §15.3; both crates mirror it and this
    // test pins them together.
    assert_eq!(
        ticklab_gateway::protocol::WORKSPACE_SYNC_TOPIC,
        ticklab_jobs::bus::WORKSPACE_SYNC_TOPIC
    );
    assert_eq!(
        ticklab_gateway::protocol::job_progress_topic("job-9"),
        ticklab_jobs::bus::job_progress_topic("job-9")
    );
}

#[tokio::test]
async fn two_clients_see_each_others_sync_patches() {
    let servers = boot().await;
    let mut a = Client::connect(&servers, "sess-ac").await;
    let mut b = Client::connect(&servers, "sess-ac").await;
    let mut c = Client::connect(&servers, "sess-other").await;

    a.subscribe("workspace.sync").await;
    b.subscribe("workspace.sync").await;
    c.subscribe("workspace.sync").await;

    // A publishes as main → B receives, A does not (docs/15 §15.3.4).
    a.send_json(serde_json::json!({
        "action": "publish", "topic": "workspace.sync",
        "origin": "main", "patch": {"timestamp": 1737400000123456789i64}
    }))
    .await;
    let got = b.next_json(Duration::from_secs(5)).await;
    assert_eq!(got["topic"], "workspace.sync");
    assert_eq!(got["origin"], "main");
    assert_eq!(got["patch"]["timestamp"], 1737400000123456789i64);
    a.expect_silence(Duration::from_millis(300)).await;
    c.expect_silence(Duration::from_millis(300)).await;

    // B publishes as secondary → A receives.
    b.send_json(serde_json::json!({
        "action": "publish", "topic": "workspace.sync",
        "origin": "secondary", "patch": {"selectedTradeId": "t_abc123"}
    }))
    .await;
    let got = a.next_json(Duration::from_secs(5)).await;
    assert_eq!(got["origin"], "secondary");
    assert_eq!(got["patch"]["selectedTradeId"], "t_abc123");
}

#[tokio::test]
async fn backtest_streams_progress_and_completes() {
    let servers = boot().await;
    let http = reqwest::Client::new();

    // Submit through the gateway (docs/01 §1.5: returns a job ID immediately).
    let res = http
        .post(format!("{}/api/v1/jobs/backtest", servers.gateway_base))
        .json(&backtest_body(6))
        .send()
        .await
        .expect("submit");
    assert_eq!(res.status(), 201);
    let body: serde_json::Value = res.json().await.expect("submit body");
    let job_id = body["jobId"].as_str().expect("jobId").to_string();

    // Stream progress over WS until terminal (docs/08 §8.14).
    let mut client = Client::connect(&servers, "sess-jobs").await;
    let topic = format!("job.{job_id}.progress");
    client.subscribe(&topic).await;

    let mut snapshots = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(25);
    let terminal = loop {
        if tokio::time::Instant::now() > deadline {
            panic!("job did not finish; snapshots={snapshots:?}");
        }
        let msg = client.next_json(Duration::from_secs(10)).await;
        if msg.get("error").is_some() {
            panic!("unexpected error frame: {msg}");
        }
        assert_eq!(msg["topic"], topic);
        let p = &msg["progress"];
        assert_eq!(p["jobId"], job_id);
        snapshots.push((
            p["status"].as_str().unwrap_or("?").to_string(),
            p["eventsProcessed"].as_u64().unwrap_or(0),
            p["totalEvents"].as_u64().unwrap_or(0),
        ));
        let status = p["status"].as_str().unwrap_or("?").to_string();
        if ["complete", "failed", "cancelled"].contains(&status.as_str()) {
            break status;
        }
    };
    assert_eq!(terminal, "complete");

    // Real stream: more than the instant snapshot alone, monotonic, exact total.
    assert!(
        snapshots.len() >= 3,
        "expected a real stream, got {snapshots:?}"
    );
    assert!(snapshots.iter().any(|(s, _, _)| s == "running"));
    let mut last = 0u64;
    for (_, processed, total) in &snapshots {
        assert!(*processed >= last, "progress monotonic: {snapshots:?}");
        assert!(*processed <= *total);
        last = *processed;
    }
    let (_, final_processed, final_total) = snapshots.last().expect("snapshots");
    assert_eq!(final_processed, final_total);

    // REST poll fallback agrees (docs/15 §15.2).
    let res = http
        .get(format!("{}/api/v1/jobs/{job_id}", servers.gateway_base))
        .send()
        .await
        .expect("poll");
    assert_eq!(res.status(), 200);
    let poll: serde_json::Value = res.json().await.expect("poll body");
    assert_eq!(poll["status"], "complete");

    // Result is complete-at-lifecycle-level with explicitly pending metrics
    // (no fabricated finance, AGENTS.md §5.3).
    let res = http
        .get(format!(
            "{}/api/v1/jobs/{job_id}/result",
            servers.gateway_base
        ))
        .send()
        .await
        .expect("result");
    assert_eq!(res.status(), 200);
    let result: serde_json::Value = res.json().await.expect("result body");
    assert_eq!(result["jobId"], job_id);
    assert!(result["headline"].is_null());
    assert!(result["metricsPending"]["blockedBy"].is_array());
}
