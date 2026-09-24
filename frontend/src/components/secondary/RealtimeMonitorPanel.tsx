import { timestampNsToMs } from '../../contracts'
import { useMarketRuntime } from '../../state/appStore'
import { useWorkspace } from '../../state/useWorkspace'
import { MetricRow, Panel, StatusDot } from '../shared/Panel'

export function RealtimeMonitorPanel() {
  const runtime = useMarketRuntime()
  const [workspace] = useWorkspace()
  const messageRate = Math.max(1, runtime.trades.length + runtime.events.length)
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}><Panel title="REALTIME DATA MONITOR (MOCK)"><MetricRow label="Exchange" value={runtime.exchange} /><MetricRow label="WebSocket" value={<span><StatusDot state="ok" /> CONNECTED</span>} /><MetricRow label="REST" value={<span><StatusDot state="ok" /> HEALTHY</span>} /><MetricRow label="Subscriptions" value={`market.${runtime.symbol}.depth · trades · ticker`} /><MetricRow label="Message rate" value={`${messageRate} msg/s`} /><MetricRow label="Last message" value={new Date(timestampNsToMs(runtime.logicalTimeNs)).toISOString().slice(11, 23)} /><MetricRow label="Sequence" value={runtime.orderBook.sequence.toLocaleString()} /><MetricRow label="Dropped messages" value="0" /><MetricRow label="Reconnects" value="2" /></Panel><Panel title="ACTIVE SESSION"><MetricRow label="Symbol" value={workspace.symbol} /><MetricRow label="Environment" value={workspace.environment} /><MetricRow label="Data source" value="deterministic local scenario" /><MetricRow label="Connection health" value="Healthy" valueClass="pos" /></Panel></div>
}
