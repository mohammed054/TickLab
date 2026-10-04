import type { RuntimeSnapshot } from '../../contracts'
import { fmtInt, fmtMs, fmtPct } from '../../shared/format'
import { MMPanel, Row } from './mm'

/** Order lifecycle. Invariant (enforced by the runtime): sent = filled + cancelled + rejected + open. */
export function ExecutionPanel({ runtime }: { runtime: RuntimeSnapshot }) {
  const s = runtime.strategy
  return (
    <MMPanel title="Execution">
      <Row label="Orders sent" value={fmtInt(s.orders)} />
      <Row label="Filled" value={fmtInt(s.fills)} />
      <Row label="Cancelled" value={fmtInt(s.cancelled)} />
      <Row label="Rejected" value={fmtInt(s.rejected)} tone={s.rejected > 0 ? 'warn' : ''} />
      <Row label="Open" value={fmtInt(s.openOrders)} />
      <div className="mm-sep" />
      <Row label="Fill rate" value={fmtPct(s.fillRate)} title="Filled orders / orders sent" />
      <Row label="Ack latency p50" value={fmtMs(runtime.latencyP50Ms)} title="Simulated order acknowledgement latency, last 300 samples" />
      <Row label="Ack latency p99" value={fmtMs(runtime.latencyP99Ms)} />
    </MMPanel>
  )
}
