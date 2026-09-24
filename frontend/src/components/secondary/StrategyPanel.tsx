import { lazy, Suspense, useEffect, useState } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { mockRuntime } from '../../mock/runtime/runtime'
import { createDefaultBacktestRequest, mockWorkbench } from '../../mock/workbench'
import { useWorkspace } from '../../state/useWorkspace'
import { MetricRow, Panel, StatusDot } from '../shared/Panel'

const TEMPLATES = [
  ['market_making', 'Market Making'],
  ['mean_reversion', 'Mean Reversion'],
  ['momentum', 'Momentum'],
  ['order_book_imbalance', 'Order Book Imbalance'],
  ['statistical_arbitrage', 'Statistical Arbitrage'],
  ['execution', 'Execution'],
  ['arbitrage', 'Arbitrage'],
  ['custom', 'Custom'],
] as const

const DEFAULT_CODE = `# MOCK — illustrative only, not executed
class MarketMaker(Strategy):
    def on_book_update(self, book):
        mid = book.mid_price()
        skew = self.inventory / self.inventory_limit
        bid = mid - self.spread_ticks * self.tick_size * (1 + skew)
        ask = mid + self.spread_ticks * self.tick_size * (1 - skew)
        self.requote(bid, ask, size=self.order_size)
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
  const [code, setCode] = useState(() => typeof localStorage === 'undefined' ? DEFAULT_CODE : localStorage.getItem('ticklab.strategy.code') ?? DEFAULT_CODE)
  const [status, setStatus] = useState<EditorStatus>('BACKTESTED')
  const [environment, setEnvironment] = useState<'RESEARCH' | 'PAPER'>('RESEARCH')
  const [diagnostics, setDiagnostics] = useState<string[]>([])
  const [, updateWorkspace] = useWorkspace()

  const handleEditorMount: OnMount = (editor) => {
    editor.focus()
  }

  useEffect(() => {
    if (status !== 'TESTING') return
    const timer = window.setTimeout(() => {
      setStatus('BACKTESTED')
      setDiagnostics(['Syntax valid', 'Required entry point present', 'Parameter schema valid'])
    }, 350)
    return () => window.clearTimeout(timer)
  }, [status])

  useEffect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('ticklab.strategy.code', code)
  }, [code])

  useEffect(() => {
    const onSave = () => {
      setStatus('DRAFT')
      setDiagnostics(['Draft saved locally'])
    }
    window.addEventListener('ticklab:save-strategy', onSave)
    return () => window.removeEventListener('ticklab:save-strategy', onSave)
  }, [])

  const validate = () => {
    setDiagnostics([])
    if (status === 'BACKTESTED') {
      setStatus('VALIDATED')
      setDiagnostics(['Human review gate completed', 'Strategy is eligible for Paper simulation'])
      return
    }
    setStatus('TESTING')
  }

  const run = () => {
    setStatus('RUNNING')
    setEnvironment('RESEARCH')
    mockRuntime.setStrategyStatus('RUNNING')
    mockRuntime.setEnvironment('RESEARCH')
    updateWorkspace({ strategy: { id: 'MM_V18', version: 'v18.4', codeHash: `mock:${template}` }, activeStrategy: 'MM_V18' })
  }

  const backtest = () => {
    const jobId = mockWorkbench.startBacktest(createDefaultBacktestRequest())
    const job = mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === jobId)
    if (job) updateWorkspace({ experiment: { id: job.experimentId }, activeTab: { secondaryMonitor: 'backtest' } })
  }

  const paper = () => {
    if (status !== 'VALIDATED') return
    setStatus('PAPER')
    setEnvironment('PAPER')
    mockRuntime.setStrategyStatus('RUNNING')
    mockRuntime.setEnvironment('PAPER')
    updateWorkspace({ environment: 'PAPER' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      <Panel title="STRATEGY (MOCK)" style={{ flex: '0 0 auto' }}>
        <MetricRow label="Name" value="MM_V18" />
        <MetricRow label="Version" value="v18.4" />
        <MetricRow label="Status" value={<><StatusDot state={status === 'ERROR' ? 'bad' : status === 'TESTING' ? 'warn' : 'ok'} /> {status}</>} />
        <MetricRow label="Environment" value={environment} valueClass={environment === 'PAPER' ? 'warn' : undefined} />
        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TEMPLATES.map(([id, label]) => (
            <button key={id} type="button" onClick={() => { setTemplate(id); setStatus('DRAFT') }} style={{ fontSize: 10, padding: '3px 7px', borderRadius: 3, border: '1px solid var(--border-1)', background: id === template ? 'var(--bg-3)' : 'transparent', color: id === template ? 'var(--text-0)' : 'var(--text-2)' }}>{label}</button>
          ))}
        </div>
      </Panel>

      <Panel title="STRATEGY EDITOR (MOCK — NOT EXECUTED)" style={{ flex: '1 1 auto', minHeight: 0 }} bodyStyle={{ padding: 0 }}>
        <div style={{ width: '100%', height: '100%', minHeight: 160 }}><Suspense fallback={<div style={{ padding: 12, color: 'var(--color-text-tertiary)', fontSize: 11 }}>Loading local editor…</div>}><MonacoEditor height="100%" language="python" theme="vs-dark" value={code} onChange={(value) => { setCode(value ?? ''); setStatus('DRAFT') }} onMount={handleEditorMount} options={editorOptions} /></Suspense></div>
        {diagnostics.length > 0 && <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border-1)', color: 'var(--pos)', fontSize: 10.5 }}>{diagnostics.join(' · ')}</div>}
      </Panel>

      <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
        <button type="button" onClick={validate} style={actionStyle(false)}>VALIDATE</button>
        <button type="button" onClick={run} style={actionStyle(false)}>RUN</button>
        <button type="button" onClick={backtest} style={actionStyle(true)}>BACKTEST</button>
        <button type="button" onClick={paper} disabled={status !== 'VALIDATED'} style={actionStyle(false)}>PAPER</button>
      </div>
    </div>
  )
}

function actionStyle(primary: boolean): React.CSSProperties {
  return { flex: 1, padding: '7px 0', background: primary ? 'var(--color-info)' : 'var(--color-bg-control)', color: primary ? 'var(--color-bg-base)' : 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, fontWeight: 600, fontSize: 11.5 }
}
