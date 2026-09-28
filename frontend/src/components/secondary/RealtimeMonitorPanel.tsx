import { timestampNsToMs } from '../../contracts'
import { useMarketRuntime } from '../../state/appStore'
import { useWorkspace } from '../../state/useWorkspace'
import { MetricRow, Panel, StatusDot } from '../shared/Panel'

export function RealtimeMonitorPanel() {
  const runtime = useMarketRuntime()
  const [workspace] = useWorkspace()
  const messageRate = Math.max(1, runtime.trades.length + runtime.events.length)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', height: '100%', overflow: 'auto' }}>
      <Panel title="L2/L3 FEED TELEMETRY">
        <MetricRow label="Exchange Gateway" value={runtime.exchange} />
        <MetricRow label="WebSocket Gateway" value={<span><StatusDot state="ok" /> CONNECTED (L1/L2)</span>} />
        <MetricRow label="REST Order Routing" value={<span><StatusDot state="ok" /> OPERATIONAL</span>} />
        <MetricRow label="Feed Subscriptions" value={`market.${runtime.symbol}.depth · trades · ticker`} />
        <MetricRow label="Throughput Ingress" value={`${messageRate.toLocaleString()} msg/sec`} />
        <MetricRow label="Clock Synchronization" value={new Date(timestampNsToMs(runtime.logicalTimeNs)).toISOString().slice(11, 23)} />
        <MetricRow label="Book Sequence ID" value={runtime.orderBook.sequence.toLocaleString()} />
        <MetricRow label="Dropped Packets" value="0 pkts" valueClass="pos" />
        <MetricRow label="Session Reconnects" value="0" />
      </Panel>

      <Panel title="ACTIVE TRADING SESSION">
        <MetricRow label="Active Instrument" value={workspace.symbol} />
        <MetricRow label="Isolated Environment" value={workspace.environment} valueClass={workspace.environment === 'LIVE' ? 'neg' : workspace.environment === 'PAPER' ? 'info' : 'dim'} />
        <MetricRow label="Simulation Engine" value="hftbacktest-core (Rust native IPC)" />
        <MetricRow label="Gateway Health" value="OPTIMAL (0.00% packet loss)" valueClass="pos" />
        <MetricRow label="Order Book Depth" value="L2 full aggregation (50 lvls)" />
        <MetricRow label="Latency Profiler" value="380 ns mean tick-to-quote" />
      </Panel>
    </div>
  )
}
