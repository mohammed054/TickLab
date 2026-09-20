//! Job-progress forwarding: jobs service → WS subscribers.
//!
//! Phase 2 local transport (`docs/03` §3.7): while a `job.{id}.progress` topic
//! has subscribers, a forwarder task polls the jobs service REST
//! (`GET /api/v1/jobs/{id}`) every [`POLL_INTERVAL`] and pushes snapshots to
//! exactly those subscribers. The subject strings are the future NATS
//! subjects (`docs/03` §3.1), so the NATS cutover changes transport, not
//! topics. Polling at 200ms keeps the `docs/08` §8.14 "≥ every 500ms" budget
//! with headroom.

use std::sync::Arc;
use std::time::Duration;

use crate::hub::Hub;
use crate::protocol::WireError;

/// Poll cadence for job progress.
pub const POLL_INTERVAL: Duration = Duration::from_millis(200);

/// Consecutive transport failures before subscribers are told the jobs
/// service is unreachable (`docs/14` §14.9: actionable, not silent).
const MAX_CONSECUTIVE_FAILURES: u32 = 15;

/// Minimal HTTP client for the jobs service REST surface (`docs/15` §15.2).
#[derive(Clone)]
pub struct JobsClient {
    base_url: String,
    client: reqwest::Client,
}

impl JobsClient {
    pub fn new(base_url: String) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("building jobs HTTP client for '{base_url}': {e}"))?;
        Ok(Self { base_url, client })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url_trimmed(), path)
    }

    pub fn base_url_trimmed(&self) -> &str {
        self.base_url.trim_end_matches('/')
    }

    /// Forward one request to the jobs service, preserving the method.
    pub async fn request(
        &self,
        method: axum::http::Method,
        url: &str,
        body: axum::body::Bytes,
    ) -> Result<reqwest::Response, reqwest::Error> {
        let method =
            reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET);
        self.client
            .request(method, url)
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await
    }

    /// Fetch one progress snapshot. `Ok(None)` = jobs service says 404
    /// (unknown job — e.g. jobs restarted and lost in-memory state).
    pub async fn fetch_progress(&self, job_id: &str) -> Result<Option<serde_json::Value>, String> {
        let res = self
            .client
            .get(self.url(&format!("/api/v1/jobs/{job_id}")))
            .send()
            .await
            .map_err(|e| format!("jobs service unreachable at {}: {e}", self.base_url))?;
        if res.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let status = res.status();
        if !status.is_success() {
            return Err(format!("jobs service returned {status} for job '{job_id}'"));
        }
        res.json::<serde_json::Value>()
            .await
            .map(Some)
            .map_err(|e| format!("decoding jobs progress for '{job_id}': {e}"))
    }

    /// Liveness probe for `/healthz` (transport errors only; status-agnostic).
    pub async fn probe_jobs(&self) -> bool {
        self.client
            .get(self.url("/healthz"))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}

fn is_terminal(progress: &serde_json::Value) -> bool {
    matches!(
        progress.get("status").and_then(|s| s.as_str()),
        Some("complete") | Some("failed") | Some("cancelled")
    )
}

/// Stream one job's progress to its subscribers until they leave, the job
/// reaches a terminal status, or the jobs service is lost. Registration
/// (`Hub::set_forwarder`) is done by the spawner, which aborts its duplicate
/// when registration loses the race.
pub async fn run_job_forwarder(hub: Arc<Hub>, jobs: JobsClient, session: String, job_id: String) {
    let topic = crate::protocol::job_progress_topic(&job_id);
    let mut failures = 0u32;
    loop {
        if hub.subscriber_count(&session, &topic) == 0 {
            hub.clear_forwarder(&session, &topic);
            return;
        }
        match jobs.fetch_progress(&job_id).await {
            Ok(Some(progress)) => {
                failures = 0;
                let delivered = hub.deliver_progress(&session, &job_id, progress.clone());
                if delivered == 0 {
                    hub.clear_forwarder(&session, &topic);
                    return;
                }
                if is_terminal(&progress) {
                    hub.clear_forwarder(&session, &topic);
                    return;
                }
            }
            Ok(None) => {
                hub.deliver_progress(
                    &session,
                    &job_id,
                    serde_json::json!({"error": WireError::new(
                        "JOB_GONE",
                        format!("job '{job_id}' is unknown to the jobs service"),
                        Some("The jobs service may have restarted (Phase 2 keeps jobs in memory); resubmit the job."),
                    )}),
                );
                hub.clear_forwarder(&session, &topic);
                return;
            }
            Err(e) => {
                failures += 1;
                tracing::warn!("job progress poll failed ({failures}): {e}");
                if failures >= MAX_CONSECUTIVE_FAILURES {
                    hub.deliver_progress(
                        &session,
                        &job_id,
                        serde_json::json!({"error": WireError::new(
                            "JOBS_UNREACHABLE",
                            "jobs service is unreachable".to_string(),
                            Some("Check that the jobs service is running; retry, then inspect the gateway logs."),
                        )}),
                    );
                    hub.clear_forwarder(&session, &topic);
                    return;
                }
            }
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}
