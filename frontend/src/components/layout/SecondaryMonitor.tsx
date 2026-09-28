import { mockRuntime } from '../../mock/runtime/runtime'
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

const TABS: readonly { id: SecondaryTabId; label: string; group?: string }[] = [
  { id: 'strategy', label: 'STRATEGY' },
  { id: 'parameters', label: 'PARAMS' },
  { id: 'data', label: 'DATASETS' },
  { id: 'data-center', label: 'DATA CENTER' },
  { id: 'data-quality', label: 'QUALITY' },
  { id: 'backtest', label: 'BACKTEST' },
  { id: 'results', label: 'RESULTS' },
  { id: 'analytics', label: 'ANALYTICS' },
  { id: 'compare', label: 'COMPARE' },
  { id: 'sweeps', label: 'SWEEPS' },
  { id: 'walk-forward', label: 'WALK-FORWARD' },
  { id: 'experiments', label: 'RUNS' },
  { id: 'replay', label: 'REPLAY' },
  { id: 'event-inspector', label: 'L3 TICKS' },
  { id: 'why-investigation', label: 'ROOT CAUSE' },
  { id: 'ai-research', label: 'AI COPILOT' },
  { id: 'research-notes', label: 'JOURNAL' },
  { id: 'realtime-monitor', label: 'TELEMETRY' },
  { id: 'market-overview', label: 'UNIVERSE' },
  { id: 'risk', label: 'RISK' },
  { id: 'report', label: 'REPORT' },
  { id: 'logs', label: 'LOGS' },
]

export function SecondaryMonitor() {
  const [workspace, updateWorkspace] = useWorkspace()
  const runtime = useMarketRuntime()
  const { experiments } = useWorkbench()
  const tab = workspace.activeTab.secondaryMonitor
  const result = workspace.experiment ? experiments.find((experiment) => experiment.id === workspace.experiment?.id)?.results ?? null : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-0)' }}>
      {/* Institutional Lab Header */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-1)', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-brand-primary)' }}>
            RESEARCH & QUANT STUDIO
          </span>
          <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-1)' }}>
            <span style={{ color: 'var(--text-0)', fontWeight: 600 }}>{runtime.symbol} · {runtime.exchange}</span>
            <span><StatusDot state="ok" /> {runtime.strategy.name}</span>
            <span><StatusDot state="ok" /> SIMULATION ENGINE</span>
            <span><StatusDot state="ok" /> DATA GATEWAY</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <span className="dim mono">ENV</span>
            <select
              aria-label="Environment"
              value={workspace.environment}
              onChange={(event) => {
                const environment = event.target.value as 'RESEARCH' | 'PAPER' | 'LIVE'
                updateWorkspace({ environment })
                mockRuntime.setEnvironment(environment)
              }}
              style={{
                background: 'var(--bg-2)',
                color: environmentColor(workspace.environment),
                border: '1px solid var(--border-1)',
                borderRadius: 3,
                padding: '2px 6px',
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <option value="RESEARCH">RESEARCH</option>
              <option value="PAPER">PAPER</option>
              <option value="LIVE">LIVE</option>
            </select>
          </label>
          <PresetSwitcher />
          <div style={{ minWidth: 200 }}><GlobalSearch /></div>
        </div>
      </div>

      {/* Modern Studio Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-1)',
          background: 'var(--bg-0)',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {TABS.map(({ id, label }) => {
          const isActive = id === tab
          return (
            <button
              key={id}
              onClick={() => updateWorkspace({ activeTab: { secondaryMonitor: id } })}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                padding: '4px 9px',
                borderRadius: 3,
                border: isActive ? '1px solid var(--border-focus)' : '1px solid transparent',
                background: isActive ? 'var(--bg-2)' : 'transparent',
                color: isActive ? 'var(--color-brand-primary)' : 'var(--text-2)',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.1s ease',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Active Panel Viewport */}
      <div style={{ flex: '1 1 auto', minHeight: 0, padding: 8, overflow: 'hidden' }}>
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
  return environment === 'LIVE' ? 'var(--color-negative)' : environment === 'PAPER' ? 'var(--color-brand-primary)' : 'var(--text-1)'
}
