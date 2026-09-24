import { mockRuntime } from '../../mock/runtime/runtime'
import { MockBanner } from '../shared/MockBanner'
import { StatusDot } from '../shared/Panel'
import { StrategyPanel } from '../secondary/StrategyPanel'
import { ParametersPanel } from '../secondary/ParametersPanel'
import { DatasetPanel } from '../secondary/DatasetPanel'
import { DataCenterPanel } from '../secondary/DataCenterPanel'
import { RealtimeMonitorPanel } from '../secondary/RealtimeMonitorPanel'
import { MarketOverviewPanel } from '../secondary/MarketOverviewPanel'
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
import { AiResearchTab } from '../ai-research/AiResearchTab'
import { GlobalSearch } from '../shared/GlobalSearch'
import { PresetSwitcher } from '../shared/PresetSwitcher'
import { SecondaryTabId } from '../../state/syncBus'
import { useMarketRuntime } from '../../state/appStore'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'

const TABS: readonly { id: SecondaryTabId; label: string }[] = [
  { id: 'strategy', label: 'Strategy' },
  { id: 'parameters', label: 'Parameters' },
  { id: 'data', label: 'Data' },
  { id: 'data-center', label: 'Data Center' },
  { id: 'realtime-monitor', label: 'Realtime Monitor' },
  { id: 'market-overview', label: 'Market Overview' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'results', label: 'Results' },
  { id: 'compare', label: 'Compare' },
  { id: 'sweeps', label: 'Sweeps' },
  { id: 'walk-forward', label: 'Walk-Forward' },
  { id: 'experiments', label: 'Experiments' },
  { id: 'replay', label: 'Replay' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'risk', label: 'Risk' },
  { id: 'report', label: 'Report' },
  { id: 'logs', label: 'Logs' },
  { id: 'data-quality', label: 'Data Quality' },
  { id: 'event-inspector', label: 'Event Inspector' },
  { id: 'why-investigation', label: 'Why Investigation' },
  { id: 'research-notes', label: 'Research Notes' },
  { id: 'ai-research', label: 'AI Research' },
]

export function SecondaryMonitor() {
  const [workspace, updateWorkspace] = useWorkspace()
  const runtime = useMarketRuntime()
  const { experiments } = useWorkbench()
  const tab = workspace.activeTab.secondaryMonitor
  const result = workspace.experiment ? experiments.find((experiment) => experiment.id === workspace.experiment?.id)?.results ?? null : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <MockBanner />
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-1)' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-2)', marginBottom: 4 }}>RESEARCH LAB</div>
        <div className="mono" style={{ display: 'flex', gap: 14, fontSize: 11 }}>
          <span>{runtime.symbol} · {runtime.exchange}</span>
          <span>
            <StatusDot state="ok" /> {runtime.strategy.name}
          </span>
          <span>
            <StatusDot state="warn" /> DATA (mock)
          </span>
          <span>
            <StatusDot state="ok" /> ENGINE (mock)
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', fontSize: 10 }}><span className="dim">ENV</span><select aria-label="Environment" value={workspace.environment} onChange={(event) => { const environment = event.target.value as 'RESEARCH' | 'PAPER' | 'LIVE'; updateWorkspace({ environment }); mockRuntime.setEnvironment(environment) }} style={{ background: 'var(--color-bg-base)', color: environmentColor(workspace.environment), border: '1px solid var(--color-border-subtle)', borderRadius: 3, padding: '3px 5px', fontSize: 10 }}><option value="RESEARCH">RESEARCH</option><option value="PAPER">PAPER</option><option value="LIVE">LIVE (SIMULATED)</option></select></label>
          <PresetSwitcher />
          <div style={{ minWidth: 190 }}><GlobalSearch /></div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border-1)' }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => updateWorkspace({ activeTab: { secondaryMonitor: id } })}
            style={{
              fontSize: 10.5,
              padding: '4px 8px',
              borderRadius: 3,
              border: '1px solid var(--border-1)',
              background: id === tab ? 'var(--bg-3)' : 'transparent',
              color: id === tab ? 'var(--text-0)' : 'var(--text-2)',
              fontWeight: id === tab ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, padding: 8 }}>
        {tab === 'strategy' && <StrategyPanel />}
        {tab === 'parameters' && <ParametersPanel />}
        {tab === 'data' && <DatasetPanel />}
        {tab === 'data-center' && <DataCenterPanel />}
        {tab === 'realtime-monitor' && <RealtimeMonitorPanel />}
        {tab === 'market-overview' && <MarketOverviewPanel />}
        {tab === 'backtest' && <BacktestPanel />}
        {tab === 'results' && <ResultsPanel result={result} />}
        {tab === 'compare' && <ComparePanel />}
        {tab === 'sweeps' && <SweepsPanel />}
        {tab === 'walk-forward' && <WalkForwardPanel />}
        {tab === 'experiments' && <ExperimentsPanel />}
        {tab === 'replay' && <ReplayPanel />}
        {tab === 'analytics' && <AnalyticsPanel />}
        {tab === 'risk' && <RiskPanel />}
        {tab === 'report' && <ReportPanel result={result} />}
        {tab === 'logs' && <LogsPanel />}
        {tab === 'data-quality' && <DataQualityPanel />}
        {tab === 'event-inspector' && <EventInspector />}
        {tab === 'why-investigation' && <WhyPanel />}
        {tab === 'research-notes' && <NotesPanel />}
        {tab === 'ai-research' && <AiResearchTab />}
      </div>
    </div>
  )
}

function environmentColor(environment: 'RESEARCH' | 'PAPER' | 'LIVE'): string {
  return environment === 'LIVE' ? 'var(--color-warning)' : environment === 'PAPER' ? 'var(--color-info)' : 'var(--color-text-primary)'
}
