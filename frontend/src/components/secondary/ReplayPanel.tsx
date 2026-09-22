import { Panel, MetricRow } from '../shared/Panel'
import { useWorkspace } from '../../state/useWorkspace'

const SPEEDS = ['0.1x', '0.5x', '1x', '5x', '10x', '100x']

export function ReplayPanel() {
  const [ws] = useWorkspace()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="REPLAY CONTROLS (MOCK)">
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, fontSize: 18, padding: '6px 0' }}>
          <span>⏮</span>
          <span>◀</span>
          <span>▶</span>
          <span>⏸</span>
          <span>⏭</span>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              style={{ fontSize: 10, padding: '2px 6px', border: '1px solid var(--border-1)', borderRadius: 3, background: 'transparent', color: 'var(--text-2)' }}
            >
              {s}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="EVENT INSPECTOR (MOCK)">
        {ws.timestampMs ? (
          <>
            <MetricRow label="Timestamp" value={new Date(ws.timestampMs).toISOString().slice(11, 23)} />
            <MetricRow label="Event type" value="TRADE" />
            <MetricRow label="Side" value="BUY" valueClass="pos" />
            <MetricRow label="Price" value="112,438.2" />
            <MetricRow label="Size" value="0.42 BTC" />
            <MetricRow label="Order ID" value={ws.selectedTradeId ?? '—'} />
            <MetricRow label="Sequence" value="91,827,361" />
            <MetricRow label="Latency" value="18.4ms" />
            <MetricRow label="Queue estimate" value="4.82 BTC ahead" />
          </>
        ) : (
          <div className="dim">Click a candle or a trade on the main monitor to inspect it here.</div>
        )}
      </Panel>

      <Panel title="TRADE INVESTIGATION — MARKOUT (MOCK)">
        {ws.selectedTradeId ? (
          <>
            <MetricRow label="Fill price" value="112,401.2" />
            {[
              ['+1ms', '112,401.5'],
              ['+5ms', '112,398.0'],
              ['+10ms', '112,395.2'],
              ['+50ms', '112,389.0'],
              ['+100ms', '112,381.4'],
            ].map(([t, p]) => (
              <MetricRow key={t} label={t} value={p} valueClass="neg" />
            ))}
          </>
        ) : (
          <div className="dim">Select a trade to see simulated markout / adverse-selection analysis.</div>
        )}
      </Panel>
    </div>
  )
}
