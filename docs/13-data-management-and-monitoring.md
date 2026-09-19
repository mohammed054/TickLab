# 13 — Data Management and Monitoring

## 13.1 Raw Data Collection

`backend/data/app/collectors/` wraps the upstream `hftbacktest` `collector/` crate
binaries (`docs/04-hftbacktest-engine-analysis.md` §4.9:
`collector/src/{binance,binancefuturescm,binancefuturesum,bybit,hyperliquid}`) to
continuously record live exchange feeds (order book + trades) to disk as new raw
datasets, independent of and in addition to downloading historical archives from
third-party vendors. `scripts/collectors/` provides the operational CLI wrapper to
run a given exchange/symbol collector as a long-lived process (systemd unit / Docker
service in deployment), writing into
`datasets/raw/{exchange}/{market}/{symbol}/{date}/...` — the same layout the Data
Pipeline (`docs/05-engine-abstraction-and-data-pipeline.md` §5.2) expects as its
input, so a self-recorded dataset and a vendor-downloaded one are handled
identically from the Validation stage onward.

This is the mechanism by which the product can build its own historical archive
over time for symbols/exchanges not otherwise available from a vendor, and is a
prerequisite for eventually collecting the very empirical latency-distribution data
that feeds the "empirical" `LatencyModel` option
(`docs/04-hftbacktest-engine-analysis.md` §4.4).

## 13.2 Data Center

Component: `features/data-center/DataCenterPage.tsx` (reachable from the command
palette, `docs/14-cross-cutting-systems.md` §14.2, and from the Dataset Selector's
"manage datasets" action, `docs/08-secondary-monitor-components.md` §8.8). A
dedicated table/grid view, one row per dataset, virtualized per
`docs/03-tech-stack-and-repo-structure.md` §3.6:

```
Dataset | Exchange | Symbol | Market | Date range | Size | Format |
Status | Quality | Download status | Processing status
```

- `Status ∈ {RAW, VALIDATING, NORMALIZING, RECONSTRUCTING, ALIGNING, READY, FAILED}`
  — mirrors the pipeline stages exactly (`docs/05-engine-abstraction-and-data-pipeline.md`
  §5.2), never a separate ad hoc status vocabulary.
- `Quality` shows the same 🟢/🟡/🔴 rollup as the Data Quality Panel
  (`docs/08-secondary-monitor-components.md` §8.10); clicking it opens that panel
  for the selected dataset.
- `Download status`/`Processing status` show progress for datasets currently being
  fetched from a vendor or run through the pipeline (job-backed, per
  `docs/01-architecture-overview.md` §1.5).
- Row actions: open in Dataset Selector, re-run pipeline, delete (with a
  confirmation that explicitly warns if any experiments reference this dataset's
  `datasetId`, since deleting it would break reproducibility for those experiments
  per `docs/10-experiment-management-and-ai-research.md` §10.3 — deletion of a
  referenced dataset requires an extra explicit acknowledgment, not a silent
  cascade).

## 13.3 Real-Time Data Monitor

Component: `features/realtime-monitor/RealtimeMonitorPanel.tsx`. Shows, per active
live/paper connection:

```
Exchange
WebSocket        {connected|reconnecting|disconnected}
REST             {healthy|degraded|down}
Subscriptions    {list of active channels/symbols}
Message rate     {messages/sec}
Last message     {timestamp}
Sequence number  {latest}
Dropped messages {count}
Reconnects       {count, with timestamps of each}
```

Sourced directly from the Live Exchange Connector / Market Data Service
(`docs/06-realtime-live-data-architecture.md` §6.2–§6.3) — this panel is the
detailed drill-down behind the Global Header's compact `MARKET DATA {dot}` and
`LATENCY` indicators (`docs/07-main-monitor-components.md` §7.1) and the Execution/
System Monitor's dropped-events/sequence-gap/reconnect counts (§7.15); all three
must read from the same underlying counters, never separately-tracked duplicates.

## 13.4 Raw Event Viewer

Component: `features/event-inspector/RawEventViewer.tsx`. Opened from the Event
Inspector (`docs/08-secondary-monitor-components.md` §8.21) via `[ view raw event ]`,
or directly from the Data Center for spot-checking a dataset. Shows the single
underlying event exactly as stored post-normalization, e.g.:

```
{HH:MM:SS.mmmmmm}

EVENT
BOOK_UPDATE

SIDE
BID

PRICE
{price}

SIZE
{size} BTC

SEQUENCE
{sequence_number}
```

This is intentionally the most "raw" view in the product — no derived metrics, no
formatting beyond basic alignment — specifically so a user can always verify what
the system actually received/stored, independent of any downstream computation,
when investigating whether an odd result is a real market phenomenon or a data/
pipeline artifact.
