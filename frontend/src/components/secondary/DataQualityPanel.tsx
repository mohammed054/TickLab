import { Panel, MetricRow, StatusDot } from '../shared/Panel'

// Distinct Data Quality view per docs/08 §8.10 (docs/17 §17.2.3: previously
// only folded into DatasetPanel). Values are static mocks, consistent with the
// folded summary in DatasetPanel.
export function DataQualityPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel
        title="DATA QUALITY (MOCK)"
        right={
          <span className="mono" style={{ fontSize: 10 }}>
            <StatusDot state="ok" /> VALID (simulated check)
          </span>
        }
      >
        <MetricRow label="Total events" value="48,291,204" />
        <MetricRow label="Trades" value="6,182,003" />
        <MetricRow label="Order-book updates" value="41,882,110" />
        <MetricRow label="Snapshots" value="227,091" />
        <MetricRow
          label="Missing intervals"
          value={
            <>
              0 <StatusDot state="ok" />
            </>
          }
        />
        <MetricRow
          label="Duplicate events"
          value={
            <>
              0 <StatusDot state="ok" />
            </>
          }
        />
        <MetricRow
          label="Sequence gaps"
          value={
            <>
              0 <StatusDot state="ok" />
            </>
          }
        />
        <MetricRow label="Timestamp range" value="2024-08-08 → 2024-08-09" />
        <MetricRow label="File size" value="8.4 GB" />
        <MetricRow label="Source" value="Binance USDT Futures" />
        <MetricRow label="Normalization" value="pipeline v3" />
        <MetricRow label="Tick size / Lot size" value="0.1 USDT / 0.001 BTC" />
      </Panel>

      <Panel title="QUALITY GATE (MOCK — DOCS/05 §5.2 RULE)">
        <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          Any 🔴 status blocks BACKTEST and PAPER/LIVE promotion until resolved or explicitly, individually overridden with a
          required justification note (audit-logged). Current report is 🟢 throughout, so the gate is open.
        </div>
      </Panel>
    </div>
  )
}
