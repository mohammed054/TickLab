//! Backend-internal topic names (`docs/15` §15.3).
//!
//! These strings are the contract shared by the Gateway (WS fan-out) and the
//! Job Runner (progress publishing), and they are also the NATS JetStream
//! subject names once the progress bus moves to NATS (`docs/03` §3.1: NATS for
//! job progress/market-data fan-out; `docker-compose.yml` already runs a `nats`
//! service). Phase 2 runs them over an in-process channel so the acceptance
//! tests are hermetic; the subject strings do not change at the NATS cutover.

/// Sync Bus replication topic (`docs/15` §15.3.4).
pub const WORKSPACE_SYNC_TOPIC: &str = "workspace.sync";

/// Progress subject for one job (`docs/15` §15.3 `job.{jobId}.progress`).
pub fn job_progress_topic(job_id: &str) -> String {
    format!("job.{job_id}.progress")
}

/// True for topics this service publishes progress on.
pub fn is_job_progress_topic(topic: &str) -> bool {
    topic.starts_with("job.") && topic.ends_with(".progress")
}

/// Extract the job id from a `job.{jobId}.progress` topic.
pub fn job_id_from_progress_topic(topic: &str) -> Option<&str> {
    if !is_job_progress_topic(topic) {
        return None;
    }
    topic
        .strip_prefix("job.")
        .and_then(|s| s.strip_suffix(".progress"))
        .filter(|id| !id.is_empty() && id.len() <= 128)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_topic_round_trip() {
        let t = job_progress_topic("job-7");
        assert_eq!(t, "job.job-7.progress");
        assert_eq!(job_id_from_progress_topic(&t), Some("job-7"));
        assert_eq!(job_id_from_progress_topic("workspace.sync"), None);
        assert_eq!(job_id_from_progress_topic("job..progress"), None);
    }
}
