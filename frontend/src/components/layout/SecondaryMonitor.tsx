import { useState } from 'react'
import { MockBanner } from '../shared/MockBanner'
import { StatusDot } from '../shared/Panel'
import { StrategyPanel } from '../secondary/StrategyPanel'
import { ParametersPanel } from '../secondary/ParametersPanel'
import { DatasetPanel } from '../secondary/DatasetPanel'
import { BacktestPanel } from '../secondary/BacktestPanel'
import { ResultsPanel } from '../secondary/ResultsPanel'
import { ExperimentsPanel } from '../secondary/ExperimentsPanel'
import { ReplayPanel } from '../secondary/ReplayPanel'
import { AnalyticsPanel } from '../secondary/AnalyticsPanel'
import { LogsPanel } from '../secondary/LogsPanel'
import { RiskPanel } from '../secondary/RiskPanel'
import { ComparePanel } from '../secondary/ComparePanel'
import { SweepsPanel } from '../secondary/SweepsPanel'
import { WalkForwardPanel } from '../secondary/WalkForwardPanel'
import { ReportPanel } from '../secondary/ReportPanel'
import { DataQualityPanel } from '../secondary/DataQualityPanel'
import { EventInspector } from '../secondary/EventInspector'
import { WhyPanel } from '../secondary/WhyPanel'
import { NotesPanel } from '../secondary/NotesPanel'
import { MockBacktestResult } from '../../mock/mockData'
import { useWorkspace } from '../../state/useWorkspace'

const TABS = [
  'Strategy',
  'Parameters',
  'Data',
  'Backtest',
  'Results',
  'Compare',
  'Sweeps',
  'Walk-Forward',
  'Experiments',
  'Replay',
  'Analytics',
  'Risk',
  'Report',
  'Logs',
  'Data Quality',
  'Event Inspector',
  'Why Investigation',
  'Research Notes',
] as const

export function SecondaryMonitor() {
  const [ws, updateWorkspace] = useWorkspace()
  const tab = (TABS as readonly string[]).includes(ws.secondaryTab) ? ws.secondaryTab : 'Strategy'
  const [result, setResult] = useState<MockBacktestResult | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <MockBanner />
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-1)' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-2)', marginBottom: 4 }}>RESEARCH LAB</div>
        <div className="mono" style={{ display: 'flex', gap: 14, fontSize: 11 }}>
          <span>BTCUSDT · Binance Futures</span>
          <span>
            <StatusDot state="ok" /> {ws.activeStrategy}
          </span>
          <span>
            <StatusDot state="warn" /> DATA (mock)
          </span>
          <span>
            <StatusDot state="ok" /> ENGINE (mock)
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border-1)' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => updateWorkspace({ secondaryTab: t })}
            style={{
              fontSize: 10.5,
              padding: '4px 8px',
              borderRadius: 3,
              border: '1px solid var(--border-1)',
              background: t === tab ? 'var(--bg-3)' : 'transparent',
              color: t === tab ? 'var(--text-0)' : 'var(--text-2)',
              fontWeight: t === tab ? 600 : 400,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, padding: 8 }}>
        {tab === 'Strategy' && <StrategyPanel />}
        {tab === 'Parameters' && <ParametersPanel />}
        {tab === 'Data' && <DatasetPanel />}
        {tab === 'Backtest' && <BacktestPanel onComplete={(r) => { setResult(r); updateWorkspace({ secondaryTab: 'Results' }) }} />}
        {tab === 'Results' && <ResultsPanel result={result} />}
        {tab === 'Compare' && <ComparePanel />}
        {tab === 'Sweeps' && <SweepsPanel />}
        {tab === 'Walk-Forward' && <WalkForwardPanel />}
        {tab === 'Experiments' && <ExperimentsPanel />}
        {tab === 'Replay' && <ReplayPanel />}
        {tab === 'Analytics' && <AnalyticsPanel />}
        {tab === 'Risk' && <RiskPanel />}
        {tab === 'Report' && <ReportPanel result={result} />}
        {tab === 'Logs' && <LogsPanel />}
        {tab === 'Data Quality' && <DataQualityPanel />}
        {tab === 'Event Inspector' && <EventInspector />}
        {tab === 'Why Investigation' && <WhyPanel />}
        {tab === 'Research Notes' && <NotesPanel />}
      </div>
    </div>
  )
}
