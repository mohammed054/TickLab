//! Session hub: Sync Bus fan-out + topic subscriptions (`docs/15` §15.3.4).
//!
//! - One [`Session`] per `?session=` token; sessions never exchange messages.
//! - `workspace.sync` publishes go to every OTHER connection in the same
//!   session (the sender filters its own `sender_conn`; the `origin` field
//!   additionally lets a window ignore its own patch, `docs/15` §15.3.4).
//! - The hub interprets nothing: patches are opaque JSON (`docs/15` §15.3.4).
//! - Job-progress delivery is pull-registered: subscribers join
//!   `job.{id}.progress`; a forwarder task (see `progress.rs`) pushes
//!   snapshots to exactly those subscribers.
//!
//! All methods take the lock briefly and never `.await` under it.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use tokio::sync::{broadcast, mpsc};
use tokio::task::AbortHandle;

use crate::protocol::{ServerMsg, Topic};

/// Fanned-out Sync Bus envelope with the sender for self-exclusion.
#[derive(Clone, Debug)]
pub struct SyncBroadcast {
    pub sender_conn: u64,
    pub origin: String,
    pub patch: serde_json::Value,
}

/// Connection id, unique per hub lifetime.
pub type ConnId = u64;

struct Session {
    sync_tx: broadcast::Sender<SyncBroadcast>,
    conns: HashMap<ConnId, mpsc::UnboundedSender<ServerMsg>>,
    topics: HashMap<String, HashSet<ConnId>>,
    forwarders: HashMap<String, AbortHandle>,
}

struct HubInner {
    sessions: HashMap<String, Session>,
    next_conn: ConnId,
}

/// Session registry shared by all gateway connections.
pub struct Hub {
    inner: Mutex<HubInner>,
}

impl Hub {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(HubInner {
                sessions: HashMap::new(),
                next_conn: 0,
            }),
        })
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HubInner> {
        self.inner.lock().expect("hub lock never poisons")
    }

    /// Register a connection in a session (creating it on first join).
    /// Returns the connection id, its direct outbound channel, and a Sync Bus
    /// receiver for envelopes published after this call.
    pub fn connect(
        &self,
        session: &str,
    ) -> (
        ConnId,
        mpsc::UnboundedReceiver<ServerMsg>,
        broadcast::Receiver<SyncBroadcast>,
    ) {
        let mut inner = self.lock();
        inner.next_conn += 1;
        let conn = inner.next_conn;
        let entry = inner
            .sessions
            .entry(session.to_string())
            .or_insert_with(|| {
                let (sync_tx, _) = broadcast::channel(64);
                Session {
                    sync_tx,
                    conns: HashMap::new(),
                    topics: HashMap::new(),
                    forwarders: HashMap::new(),
                }
            });
        let sync_rx = entry.sync_tx.subscribe();
        let (tx, rx) = mpsc::unbounded_channel();
        entry.conns.insert(conn, tx);
        (conn, rx, sync_rx)
    }

    /// Remove a connection from its session; aborts job forwarders left with
    /// no subscribers. Empty sessions are dropped.
    pub fn disconnect(&self, session: &str, conn: ConnId) {
        let mut inner = self.lock();
        let Some(entry) = inner.sessions.get_mut(session) else {
            return;
        };
        entry.conns.remove(&conn);
        let mut emptied = Vec::new();
        for (topic, members) in entry.topics.iter_mut() {
            members.remove(&conn);
            if members.is_empty() {
                emptied.push(topic.clone());
            }
        }
        for topic in emptied {
            entry.topics.remove(&topic);
            if let Some(handle) = entry.forwarders.remove(&topic) {
                handle.abort();
            }
        }
        if entry.conns.is_empty() {
            inner.sessions.remove(session);
        }
    }

    /// Join a topic. Returns the canonical topic string.
    pub fn subscribe(&self, session: &str, conn: ConnId, topic: &Topic) -> String {
        let name = topic.as_str();
        let mut inner = self.lock();
        if let Some(entry) = inner.sessions.get_mut(session) {
            entry.topics.entry(name.clone()).or_default().insert(conn);
        }
        name
    }

    pub fn unsubscribe(&self, session: &str, conn: ConnId, topic: &str) {
        let mut inner = self.lock();
        let Some(entry) = inner.sessions.get_mut(session) else {
            return;
        };
        if let Some(members) = entry.topics.get_mut(topic) {
            members.remove(&conn);
            if members.is_empty() {
                entry.topics.remove(topic);
                if let Some(handle) = entry.forwarders.remove(topic) {
                    handle.abort();
                }
            }
        }
    }

    /// True when a job topic has subscribers but no forwarder is registered.
    pub fn needs_forwarder(&self, session: &str, topic: &str) -> bool {
        let inner = self.lock();
        match inner.sessions.get(session) {
            Some(entry) => {
                entry
                    .topics
                    .get(topic)
                    .map(|m| !m.is_empty())
                    .unwrap_or(false)
                    && !entry.forwarders.contains_key(topic)
            }
            None => false,
        }
    }

    /// Register a forwarder handle; returns false if one is already present
    /// (the caller must stop its duplicate).
    pub fn set_forwarder(&self, session: &str, topic: &str, handle: AbortHandle) -> bool {
        let mut inner = self.lock();
        match inner.sessions.get_mut(session) {
            Some(entry) => {
                if entry.forwarders.contains_key(topic) {
                    false
                } else {
                    entry.forwarders.insert(topic.to_string(), handle);
                    true
                }
            }
            None => false,
        }
    }

    /// Drop a forwarder registration (called by the forwarder itself on a
    /// terminal snapshot). Does not abort: the task is already exiting.
    pub fn clear_forwarder(&self, session: &str, topic: &str) {
        let mut inner = self.lock();
        if let Some(entry) = inner.sessions.get_mut(session) {
            entry.forwarders.remove(topic);
        }
    }

    /// Fan out a Sync Bus patch to the session (`docs/15` §15.3.4). Receivers
    /// skip envelopes whose `sender_conn` is their own connection.
    pub fn publish_sync(
        &self,
        session: &str,
        sender: ConnId,
        origin: String,
        patch: serde_json::Value,
    ) {
        let inner = self.lock();
        if let Some(entry) = inner.sessions.get(session) {
            let _ = entry.sync_tx.send(SyncBroadcast {
                sender_conn: sender,
                origin,
                patch,
            });
        }
    }

    /// Push a progress snapshot to the topic's subscribers. Returns the
    /// recipient count (0 when everyone left — the forwarder then exits).
    pub fn deliver_progress(
        &self,
        session: &str,
        job_id: &str,
        progress: serde_json::Value,
    ) -> usize {
        let topic = crate::protocol::job_progress_topic(job_id);
        let senders = {
            let inner = self.lock();
            match inner.sessions.get(session) {
                Some(entry) => match entry.topics.get(&topic) {
                    Some(members) => members
                        .iter()
                        .filter_map(|conn| entry.conns.get(conn))
                        .cloned()
                        .collect::<Vec<_>>(),
                    None => Vec::new(),
                },
                None => Vec::new(),
            }
        };
        let mut delivered = 0;
        for tx in senders {
            if tx
                .send(ServerMsg::Progress {
                    topic: topic.clone(),
                    progress: progress.clone(),
                })
                .is_ok()
            {
                delivered += 1;
            }
        }
        delivered
    }

    /// Send one message directly to a connection (acks, errors, instant state).
    pub fn send_to(&self, session: &str, conn: ConnId, msg: ServerMsg) -> bool {
        let tx = {
            let inner = self.lock();
            inner
                .sessions
                .get(session)
                .and_then(|entry| entry.conns.get(&conn))
                .cloned()
        };
        tx.map(|tx| tx.send(msg).is_ok()).unwrap_or(false)
    }

    /// Current subscriber count for a canonical topic string.
    pub fn subscriber_count(&self, session: &str, topic: &str) -> usize {
        let inner = self.lock();
        inner
            .sessions
            .get(session)
            .and_then(|entry| entry.topics.get(topic))
            .map(|members| members.len())
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::WORKSPACE_SYNC_TOPIC;

    #[test]
    fn sync_fan_out_excludes_sender_and_session() {
        let hub = Hub::new();
        let (a, _a_out, mut a_sync) = hub.connect("s1");
        let (b, _b_out, mut b_sync) = hub.connect("s1");
        let (_c, _c_out, mut c_sync) = hub.connect("s2");

        hub.publish_sync(
            "s1",
            a,
            "main".to_string(),
            serde_json::json!({"timestamp": 7}),
        );
        // Both s1 receivers observe it (each filters its own sender itself).
        let env_b = b_sync.try_recv().expect("b receives");
        assert_eq!(env_b.sender_conn, a);
        assert_eq!(env_b.origin, "main");
        let env_a = a_sync
            .try_recv()
            .expect("sender also receives at transport level");
        assert_eq!(env_a.sender_conn, a);
        // Other session sees nothing.
        assert!(c_sync.try_recv().is_err());
        let _ = (b, _c);
    }

    #[test]
    fn progress_reaches_only_subscribers() {
        let hub = Hub::new();
        let (a, mut a_out, _) = hub.connect("s1");
        let (b, mut b_out, _) = hub.connect("s1");
        hub.subscribe("s1", a, &Topic::JobProgress("job-1".to_string()));

        let n = hub.deliver_progress("s1", "job-1", serde_json::json!({"status": "running"}));
        assert_eq!(n, 1);
        let msg = a_out.try_recv().expect("subscriber receives");
        assert!(matches!(msg, ServerMsg::Progress { .. }));
        assert!(b_out.try_recv().is_err(), "non-subscriber receives nothing");
        let _ = b;
    }

    #[test]
    fn disconnect_cleans_up() {
        let hub = Hub::new();
        let (a, _, _) = hub.connect("s1");
        hub.subscribe("s1", a, &Topic::WorkspaceSync);
        assert_eq!(hub.subscriber_count("s1", WORKSPACE_SYNC_TOPIC), 1);
        hub.disconnect("s1", a);
        assert_eq!(hub.subscriber_count("s1", WORKSPACE_SYNC_TOPIC), 0);
    }
}
