import { useEffect, useRef, useState } from 'react'
import { Panel, MetricRow } from '../shared/Panel'
import { genMockBacktestResult, MockBacktestResult } from '../../mock/mockData'

export function BacktestPanel({ onComplete }: { onComplete: (r: MockBacktestResult) => void }) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const timer = useRef<number | null>(null)

  function run() {
    if (running) return
    setRunning(true)
    setProgress(0)
    timer.current = window.setInterval(() => {
      const delta = 4 + Math.random() * 6
      setProgress((p) => Math.min(100, p + delta))
    }, 180)
  }

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current) }, [])

  useEffect(() => {
    if (running && progress >= 100) {
      if (timer.current) window.clearInterval(timer.current)
      setRunning(false)
      onComplete(genMockBacktestResult('MM_V18'))
    }
  }, [running, progress, onComplete])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', overflow: 'auto' }}>
      <Panel title="BACKTEST CONFIGURATION (MOCK)">
        <MetricRow label="Dataset" value="BTCUSDT 2024-08-08 → 09" />
        <MetricRow label="Initial capital" value="$10,000" />
        <MetricRow label="Maker / Taker fee" value="-0.005% / 0.020%" />
        <MetricRow label="Latency model" value="20ms empirical" />
        <MetricRow label="Queue model" value="Power(2.0)" />
        <MetricRow label="Events" value="48,291,204" />
      </Panel>

      <button
        onClick={run}
        disabled={running}
        style={{
          padding: '12px 0',
          fontSize: 14,
          fontWeight: 700,
          borderRadius: 5,
          border: '1px solid var(--accent)',
          background: running ? 'var(--bg-2)' : 'var(--accent)',
          color: running ? 'var(--text-1)' : '#0d0f12',
        }}
      >
        {running ? 'RUNNING…' : '▶ RUN BACKTEST (SIMULATED)'}
      </button>

      {(running || progress > 0) && (
        <Panel title="BACKTEST PROGRESS (MOCK)">
          <div style={{ background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden', height: 10, marginBottom: 6 }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.15s' }} />
          </div>
          <MetricRow label="Progress" value={`${progress.toFixed(0)}%`} />
          <MetricRow label="Events/sec" value={running ? '18,291' : '—'} />
          <MetricRow label="Orders" value={running ? Math.floor(progress * 1800) : '—'} />
          <MetricRow label="Fills" value={running ? Math.floor(progress * 610) : '—'} />
        </Panel>
      )}
    </div>
  )
}
