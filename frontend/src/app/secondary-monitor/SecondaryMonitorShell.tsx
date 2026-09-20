import { useWorkspaceContext } from "../../shared/sync-bus"
import { StrategyPanel } from "../../features/strategy-editor/StrategyPanel"
import { ParametersPanel } from "../../features/parameters/ParametersPanel"

export function SecondaryMonitorShell() {
  const { symbol, exchange, environment, strategy, dataset, experiment, activeTab } = useWorkspaceContext()

  const tabs = [
    { id: 'strategy', label: 'Strategy' },
    { id: 'parameters', label: 'Parameters' },
    { id: 'dataset', label: 'Dataset' },
    { id: 'backtest', label: 'Backtest' },
    { id: 'results', label: 'Results' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'experiments', label: 'Experiments' },
    { id: 'replay', label: 'Replay' },
    { id: 'events', label: 'Events' },
    { id: 'why', label: 'Why' },
    { id: 'notes', label: 'Notes' },
    { id: 'ai', label: 'AI Research' },
    { id: 'logs', label: 'Logs' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'export', label: 'Export' },
  ]

  return (
    <div className="secondary-monitor-shell" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d0d' }}>
      <header style={{ padding: '8px 16px', borderBottom: '1px solid #333', background: '#1a1a1a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <strong>TickLab — Secondary Monitor</strong>
          <span style={{ color: '#888' }}>{symbol} @ {exchange}</span>
          <span style={{ 
            color: environment === 'LIVE' ? '#ff4444' : environment === 'PAPER' ? '#ffaa00' : '#44aa44',
            textTransform: 'uppercase',
            fontSize: '12px',
            padding: '2px 8px',
            border: '1px solid currentColor',
            borderRadius: '4px'
          }}>
            {environment}
          </span>
        </div>
        <nav style={{ marginTop: '8px', display: 'flex', gap: '4px', overflowX: 'auto', flexWrap: 'wrap' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              style={{
                padding: '4px 12px',
                background: activeTab?.secondaryMonitor === tab.id ? '#333' : 'transparent',
                border: '1px solid #333',
                borderRadius: '4px',
                color: activeTab?.secondaryMonitor === tab.id ? '#fff' : '#888',
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <main style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
        <div style={{ background: '#1a1a1a', borderRadius: '4px', border: '1px solid #333', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
          {(() => {
            switch (activeTab?.secondaryMonitor) {
              case 'strategy': return <StrategyPanel strategyName={strategy?.name || 'Unnamed'} version={strategy?.version || '0.0.1'} status={strategy?.status || 'DRAFT'} environment={environment} />
              case 'parameters': return <ParametersPanel parameters={strategy?.parameters || []} onParameterChange={() => {}} />
              case 'dataset': return 'Dataset Selector — with Quality Report'
              case 'backtest': return 'Backtest Configuration & Progress'
              case 'results': return 'Backtest Results — Headline Metrics'
              case 'analytics': return 'Analytics Suite — Equity, Drawdown, Attribution...'
              case 'experiments': return 'Experiment Tree — Reproduce, Compare, Notes'
              case 'replay': return 'Replay Controls — Speed, Range, Crosshair Sync'
              case 'events': return 'Event Inspector — Fine-grained Event Stream'
              case 'why': return 'Why Investigation — Counterfactual Analysis'
              case 'notes': return 'Research Notes — Markdown + Links'
              case 'ai': return 'AI Research Assistant — Evidence-based Q&A'
              case 'logs': return 'System Logs — Structured & Searchable'
              case 'alerts': return 'Alert History — Rules & Notifications'
              case 'export': return 'Report Builder — PDF/HTML/CSV Export'
              default: return 'Select a tab to begin'
            }
          })()}
        </div>
        {(strategy || dataset || experiment) && (
          <div style={{ marginTop: '16px', padding: '12px', background: '#1a1a1a', borderRadius: '4px', border: '1px solid #333', fontSize: '12px', color: '#888' }}>
            <strong>Active Context:</strong>
            {strategy && <span> Strategy: {strategy.name} ({strategy.id})</span>}
            {dataset && <span> Dataset: {dataset.symbol} @ {dataset.exchange} [{dataset.dateRangeStart}–{dataset.dateRangeEnd}]</span>}
            {experiment && <span> Experiment: {experiment.name} ({experiment.id})</span>}
          </div>
        )}
      </main>
    </div>
  )
}