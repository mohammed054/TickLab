import { lazy, Suspense, useEffect, useState } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { mockRuntime } from '../../mock/runtime/runtime'
import { createDefaultBacktestRequest, mockWorkbench } from '../../mock/workbench'
import { useWorkspace } from '../../state/useWorkspace'
import { MetricRow, Panel, StatusDot } from '../shared/Panel'

const TEMPLATES = [
  ['market_making', 'Market Making (Avellaneda-Stoikov)'],
  ['mean_reversion', 'Microstructure Mean Reversion'],
  ['momentum', 'Order Flow Momentum (CVD)'],
  ['order_book_imbalance', 'OFI Depth Imbalance'],
  ['statistical_arbitrage', 'Cross-Exchange Latency Arb'],
  ['execution', 'TWAP / VWAP Smart Router'],
  ['custom', 'Custom Alpha Engine'],
] as const

const DEFAULT_CODE = `"""
High-Frequency Market Making Strategy
Avellaneda-Stoikov Inventory Skew Model
"""
from hftbacktest import Strategy, OrderBook, Side

class AvellanedaStoikovMM(Strategy):
    def __init__(self, gamma=0.1, sigma=0.002, tick_size=0.1, order_size=0.01):
        super().__init__()
        self.gamma = gamma          # Risk aversion parameter
        self.sigma = sigma          # Volatility estimate
        self.tick_size = tick_size
        self.order_size = order_size
        self.inventory_limit = 2.0  # Max BTC inventory

    def on_depth_update(self, book: OrderBook):
        mid = book.mid_price()
        q = self.inventory / self.inventory_limit
        
        # Reservation price with inventory penalty
        reservation_price = mid - q * self.gamma * (self.sigma ** 2)
        half_spread = self.spread_ticks * self.tick_size
        
        optimal_bid = reservation_price - half_spread
        optimal_ask = reservation_price + half_spread
        
        self.requote(bid=optimal_bid, ask=optimal_ask, size=self.order_size)

    def on_trade(self, trade):
        self.update_inventory(trade)
`

const MonacoEditor = lazy(() => import('../../shared/monaco').then(({ Editor }) => ({ default: Editor })))

type EditorStatus = 'DRAFT' | 'TESTING' | 'BACKTESTED' | 'VALIDATED' | 'PAPER' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR'

const editorOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 12,
  lineHeight: 18,
  fontFamily: 'var(--font-mono)',
  padding: { top: 10, bottom: 10 },
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line' as const,
  tabSize: 4,
}

export function StrategyPanel() {
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number][0]>('market_making')
  const [code, setCode] = useState(() => (typeof localStorage === 'undefined' ? DEFAULT_CODE : localStorage.getItem('ticklab.strategy.code') ?? DEFAULT_CODE))
  const [status, setStatus] = useState<EditorStatus>('VALIDATED')
  const [environment, setEnvironment] = useState<'RESEARCH' | 'PAPER'>('RESEARCH')
  const [diagnostics, setDiagnostics] = useState<string[]>(['Python AST validated', 'Strategy entry point verified', 'Parameter schema aligned'])
  const [, updateWorkspace] = useWorkspace()

  const handleEditorMount: OnMount = (editor) => {
    editor.focus()
  }

  useEffect(() => {
    if (status !== 'TESTING') return
    const timer = window.setTimeout(() => {
      setStatus('VALIDATED')
      setDiagnostics(['Syntax valid', 'Required entry point present', 'Parameter schema valid', 'Ready for simulation'])
    }, 350)
    return () => window.clearTimeout(timer)
  }, [status])

  useEffect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('ticklab.strategy.code', code)
  }, [code])

  useEffect(() => {
    const onSave = () => {
      setStatus('DRAFT')
      setDiagnostics(['Draft saved to workspace'])
    }
    window.addEventListener('ticklab:save-strategy', onSave)
    return () => window.removeEventListener('ticklab:save-strategy', onSave)
  }, [])

  const validate = () => {
    setDiagnostics([])
    if (status === 'BACKTESTED' || status === 'DRAFT') {
      setStatus('VALIDATED')
      setDiagnostics(['Verification completed', 'Strategy is eligible for simulation & execution'])
      return
    }
    setStatus('TESTING')
  }

  const run = () => {
    setStatus('RUNNING')
    setEnvironment('RESEARCH')
    mockRuntime.setStrategyStatus('RUNNING')
    mockRuntime.setEnvironment('RESEARCH')
    updateWorkspace({ strategy: { id: 'MM_V18', version: 'v18.4', codeHash: `strategy:${template}` }, activeStrategy: 'MM_V18' })
  }

  const backtest = () => {
    const jobId = mockWorkbench.startBacktest(createDefaultBacktestRequest())
    const job = mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === jobId)
    if (job) updateWorkspace({ experiment: { id: job.experimentId }, activeTab: { secondaryMonitor: 'backtest' } })
  }

  const paper = () => {
    if (status !== 'VALIDATED' && status !== 'RUNNING') return
    setStatus('PAPER')
    setEnvironment('PAPER')
    mockRuntime.setStrategyStatus('RUNNING')
    mockRuntime.setEnvironment('PAPER')
    updateWorkspace({ environment: 'PAPER' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      <Panel title="ALPHA STRATEGY DEFINITION" style={{ flex: '0 0 auto' }}>
        <MetricRow label="Strategy Engine" value="MM_V18 (Avellaneda-Stoikov)" />
        <MetricRow label="Engine Version" value="v18.4.2" />
        <MetricRow
          label="Execution Status"
          value={
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <StatusDot state={status === 'ERROR' ? 'bad' : status === 'TESTING' ? 'warn' : 'ok'} pulse={status === 'RUNNING'} />
              <span className="mono" style={{ fontWeight: 600 }}>
                {status}
              </span>
            </div>
          }
        />
        <MetricRow label="Target Environment" value={`${environment} MODE`} valueClass={environment === 'PAPER' ? 'warn' : 'pos'} />

        <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TEMPLATES.map(([id, label]) => {
            const isActive = id === template
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTemplate(id)
                  setStatus('DRAFT')
                }}
                style={{
                  fontSize: 'var(--font-size-2xs)',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--color-border-accent)' : 'var(--color-border-subtle)',
                  background: isActive ? 'var(--color-bg-control-active)' : 'var(--color-bg-control)',
                  color: isActive ? 'var(--color-focus)' : 'var(--color-text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel title="QUANT STRATEGY EDITOR" style={{ flex: '1 1 auto', minHeight: 0 }} bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: '100%', height: '100%', minHeight: 180, flex: '1 1 auto' }}>
          <Suspense fallback={<div style={{ padding: 12, color: 'var(--color-text-muted)', fontSize: 11 }}>Initializing editor environment…</div>}>
            <MonacoEditor
              height="100%"
              language="python"
              theme="vs-dark"
              value={code}
              onChange={(value) => {
                setCode(value ?? '')
                setStatus('DRAFT')
              }}
              onMount={handleEditorMount}
              options={editorOptions}
            />
          </Suspense>
        </div>
        {diagnostics.length > 0 && (
          <div
            style={{
              padding: '5px 10px',
              borderTop: '1px solid var(--color-border-subtle)',
              background: 'var(--color-bg-raised)',
              color: 'var(--color-positive)',
              fontSize: 'var(--font-size-2xs)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            className="mono"
          >
            <span>✓</span>
            <span>{diagnostics.join(' · ')}</span>
          </div>
        )}
      </Panel>

      <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
        <button type="button" onClick={validate} style={actionStyle(false)}>
          VALIDATE SYNTAX
        </button>
        <button type="button" onClick={run} style={actionStyle(false)}>
          ACTIVATE STRATEGY
        </button>
        <button type="button" onClick={backtest} style={actionStyle(true)}>
          ▶ RUN BACKTEST
        </button>
        <button type="button" onClick={paper} disabled={status !== 'VALIDATED' && status !== 'RUNNING'} style={actionStyle(false)}>
          ENABLE PAPER MODE
        </button>
      </div>
    </div>
  )
}

function actionStyle(primary: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '7px 0',
    background: primary ? 'var(--color-info)' : 'var(--color-bg-control)',
    color: primary ? 'var(--color-bg-base)' : 'var(--color-text-primary)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-xs)',
    fontWeight: 700,
    fontSize: 'var(--font-size-xs)',
    letterSpacing: '0.02em',
    cursor: 'pointer',
  }
}
