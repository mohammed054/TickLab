import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BacktestPanel } from '../secondary/BacktestPanel'
import { DatasetPanel } from '../secondary/DatasetPanel'
import { getDataServiceHealth, type DataServiceHealth } from '../secondary/binanceDataApi'
import '../../styles/research-workflow.css'

type WorkflowTab = 'data' | 'backtest'

export function SecondaryMonitor() {
  const [activeTab, setActiveTab] = useState<WorkflowTab>('data')
  const [health, setHealth] = useState<DataServiceHealth>('connecting')
  const [compactLayout, setCompactLayout] = useState(false)
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(() => {
    try {
      return localStorage.getItem('ticklab.real-dataset.selected') ?? ''
    } catch {
      return ''
    }
  })
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    let mounted = true
    const refreshHealth = async () => {
      const next = await getDataServiceHealth()
      if (mounted) setHealth(next)
    }
    void refreshHealth()
    const timer = window.setInterval(() => void refreshHealth(), 5000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)')
    const updateLayout = () => setCompactLayout(media.matches)
    updateLayout()
    media.addEventListener('change', updateLayout)
    return () => media.removeEventListener('change', updateLayout)
  }, [])

  const selectDataset = (datasetId: string) => {
    setSelectedDatasetId(datasetId)
    try {
      if (datasetId) localStorage.setItem('ticklab.real-dataset.selected', datasetId)
      else localStorage.removeItem('ticklab.real-dataset.selected')
    } catch {
      // Storage is a convenience; a restricted browser session must still work.
    }
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const previousKey = compactLayout ? 'ArrowLeft' : 'ArrowUp'
    const nextKey = compactLayout ? 'ArrowRight' : 'ArrowDown'
    if (![previousKey, nextKey, 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' || event.key === previousKey && activeTab === 'backtest'
      ? 0
      : event.key === 'End' || event.key === nextKey && activeTab === 'data'
        ? 1
        : activeTab === 'data' ? 0 : 1
    const targetTab = next === 0 ? 'data' : 'backtest'
    setActiveTab(targetTab)
    tabRefs.current[next]?.focus()
  }

  return (
    <main className="research-shell">
      <header className="research-header">
        <div className="research-brand-lockup">
          <span className="research-mark" aria-hidden="true">T</span>
          <span className="research-brand">TickLab</span>
          <span className="research-divider" aria-hidden="true" />
          <span className="research-environment">RESEARCH</span>
        </div>
        <div className={`service-status service-status--${health}`} role="status" aria-live="polite">
          <span className="service-status__dot" aria-hidden="true" />
          <span>{health === 'connected' ? 'DATA SERVICE CONNECTED' : health === 'disconnected' ? 'DATA SERVICE OFFLINE' : 'CONNECTING TO DATA SERVICE'}</span>
        </div>
      </header>

      <div className="research-frame">
        <aside className="workflow-rail" aria-label="Research workflow">
          <div className="workflow-rail__eyebrow">RESEARCH WORKSPACE</div>
          <h1>Market data</h1>
          <p>Build a reproducible dataset before running research.</p>
          <nav className="workflow-steps" aria-label="Workflow steps" role="tablist" aria-orientation={compactLayout ? 'horizontal' : 'vertical'}>
            <button
              ref={(element) => { tabRefs.current[0] = element }}
              type="button"
              role="tab"
              id="workflow-tab-data"
              aria-controls="workflow-panel-data"
              aria-selected={activeTab === 'data'}
              tabIndex={activeTab === 'data' ? 0 : -1}
              className={`workflow-step ${activeTab === 'data' ? 'is-active' : selectedDatasetId ? 'is-complete' : ''}`}
              aria-current={activeTab === 'data' ? 'step' : undefined}
              onClick={() => setActiveTab('data')}
              onKeyDown={handleTabKeyDown}
            >
              <span className="workflow-step__index">01</span>
              <span className="workflow-step__copy"><strong>Import data</strong><small>Trades · provenance · coverage</small></span>
              <span className="workflow-step__chevron" aria-hidden="true">›</span>
            </button>
            <button
              ref={(element) => { tabRefs.current[1] = element }}
              type="button"
              role="tab"
              id="workflow-tab-backtest"
              aria-controls="workflow-panel-backtest"
              aria-selected={activeTab === 'backtest'}
              tabIndex={activeTab === 'backtest' ? 0 : -1}
              className={`workflow-step ${activeTab === 'backtest' ? 'is-active' : ''}`}
              aria-current={activeTab === 'backtest' ? 'step' : undefined}
              onClick={() => setActiveTab('backtest')}
              onKeyDown={handleTabKeyDown}
            >
              <span className="workflow-step__index">02</span>
              <span className="workflow-step__copy"><strong>Backtest</strong><small>Engine readiness and data gate</small></span>
              <span className="workflow-step__chevron" aria-hidden="true">›</span>
            </button>
          </nav>
          <div className="workflow-future">
            <span className="workflow-step__index" aria-hidden="true">03</span>
            <span className="workflow-step__copy"><strong>Strategy research</strong><small>Not implemented in this real-data release</small></span>
            <span className="workflow-lock">NOT READY</span>
          </div>

          <div className="workflow-rail__foot">
            <span className="workflow-rail__foot-label">ACTIVE MARKET</span>
            <strong>BTCUSDT <span>PERPETUAL</span></strong>
            <small>Binance USDⓈ-M Futures</small>
          </div>
        </aside>

        <section className="research-content" aria-label="Research workspace">
          <div className="research-content__topline">
            <div className="breadcrumbs"><span>RESEARCH</span><i>/</i><strong>{activeTab === 'data' ? 'DATA' : 'BACKTEST'}</strong></div>
            <span className="truth-label"><span aria-hidden="true">●</span> REAL MARKET DATA ONLY</span>
          </div>
          <div className="workflow-tabpanel" role="tabpanel" id="workflow-panel-data" aria-labelledby="workflow-tab-data" tabIndex={0} hidden={activeTab !== 'data'}>
            <DatasetPanel
              apiAvailable={health === 'connected'}
              selectedDatasetId={selectedDatasetId}
              onDatasetSelect={selectDataset}
              onOpenBacktest={() => setActiveTab('backtest')}
            />
          </div>
          <div className="workflow-tabpanel" role="tabpanel" id="workflow-panel-backtest" aria-labelledby="workflow-tab-backtest" tabIndex={0} hidden={activeTab !== 'backtest'}>
            <BacktestPanel apiAvailable={health === 'connected'} selectedDatasetId={selectedDatasetId} onOpenData={() => setActiveTab('data')} />
          </div>
          <footer className="research-footer">
            <span>RESEARCH ENVIRONMENT</span>
            <span>NO ORDER ROUTING</span>
            <span>DATA SOURCE: BINANCE DATA VISION</span>
          </footer>
        </section>
      </div>
    </main>
  )
}
