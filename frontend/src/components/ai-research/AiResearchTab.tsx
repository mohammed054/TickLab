import { useEffect, useRef, useState } from 'react'
import { BacktestRequest } from '../../contracts'
import { createDefaultBacktestRequest, mockWorkbench } from '../../mock/workbench'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'
import { AttributionBadge, LoadingState } from '../../shared/design-system/primitives'
import { Panel } from '../shared/Panel'

type EvidenceRef = { id: string; label: string; value: string; view: string }
type ChatMessage = { id: number; role: 'user' | 'assistant'; content: string; evidence: EvidenceRef[]; draft?: BacktestRequest }

const QUICK_QUESTIONS = ['Why did the strategy lose money?', 'Why did an order not fill?', 'Why did latency spike?']

export function AiResearchTab() {
  const { experiments } = useWorkbench()
  const [workspace, updateWorkspace] = useWorkspace()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const selectedExperiment = experiments.find((experiment) => experiment.id === workspace.experiment?.id && experiment.results !== null) ?? experiments.find((experiment) => experiment.results !== null)

  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current) }, [])

  const send = (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || pending) return
    const userMessage: ChatMessage = { id: messages.length, role: 'user', content: trimmed, evidence: [] }
    const assistant = createResponse(trimmed, selectedExperiment?.results ?? null)
    const assistantMessage: ChatMessage = { id: messages.length + 1, role: 'assistant', ...assistant }
    setMessages((current) => [...current, userMessage])
    setInput('')
    setPending(true)
    setSelectedMessageId(assistantMessage.id)
    timerRef.current = window.setTimeout(() => {
      setMessages((current) => [...current, assistantMessage])
      setPending(false)
      timerRef.current = null
    }, 350)
  }

  const createExperiment = (message: ChatMessage) => {
    if (!message.draft) return
    const jobId = mockWorkbench.startBacktest(message.draft)
    const job = mockWorkbench.getSnapshot().jobs.find((candidate) => candidate.id === jobId)
    if (job) updateWorkspace({ experiment: { id: job.experimentId }, activeTab: { secondaryMonitor: 'backtest' } })
  }

  const openEvidence = (view: string) => {
    const analyticsView = view.toLowerCase().includes('queue') ? 'queue' : view.toLowerCase().includes('latency') ? 'latency' : view.toLowerCase().includes('attribution') ? 'attribution' : 'equity'
    updateWorkspace({ activeTab: { secondaryMonitor: 'analytics' } })
    window.dispatchEvent(new CustomEvent('ticklab:analytics-view', { detail: analyticsView }))
  }

  const selectedMessage = messages.find((message) => message.id === selectedMessageId)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 34%)', gap: 6, height: '100%', minHeight: 0 }}>
      <Panel title="AI RESEARCH ASSISTANT (MOCK — deterministic local responses)">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '6px 8px', borderBottom: '1px solid var(--color-border-subtle)' }}>{QUICK_QUESTIONS.map((question) => <button key={question} type="button" onClick={() => send(question)} style={{ fontSize: 9, padding: '3px 6px', background: 'var(--color-bg-control)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>{question}</button>)}</div>
        <div style={{ flex: '1 1 auto', minHeight: 0, padding: 8, overflow: 'auto' }}>
          {messages.length === 0 && <div className="dim" style={{ padding: 16 }}>Ask about the selected experiment, metrics, queue behavior, or latency.</div>}
          {messages.map((message) => <div key={message.id} style={{ marginBottom: 10, padding: 8, background: message.role === 'assistant' ? 'var(--color-bg-raised)' : 'var(--color-bg-panel)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}><AttributionBadge kind={message.role === 'assistant' ? 'ai' : 'human'} /><span className="dim" style={{ fontSize: 10 }}>{message.role === 'assistant' ? 'Research assistant' : 'You'}</span></div><div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>{message.content}</div>{message.evidence.length > 0 && <button type="button" onClick={() => setSelectedMessageId(message.id)} style={{ marginTop: 6, fontSize: 10, color: 'var(--color-info)', background: 'transparent', border: 0, padding: 0 }}>View {message.evidence.length} evidence reference(s)</button>}{message.draft && <button type="button" onClick={() => createExperiment(message)} style={{ display: 'block', marginTop: 7, padding: '5px 8px', background: 'var(--color-info)', color: 'var(--color-bg-base)', border: 0, borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 700 }}>[ CREATE EXPERIMENT ]</button>}</div>)}
          {pending && <LoadingState label="Analyzing selected experiment…" progress={45} />}
        </div>
        <div style={{ padding: 8, borderTop: '1px solid var(--color-border-subtle)' }}><textarea aria-label="Ask the research assistant" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send(input) } }} placeholder="Ask about metrics, experiments, or results… Ctrl+Enter to send" rows={2} style={{ width: '100%', resize: 'vertical', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: 8, fontSize: 12 }} /><div style={{ display: 'flex', gap: 6, marginTop: 6 }}><button type="button" disabled={pending || !input.trim()} onClick={() => send(input)} style={{ fontSize: 11, padding: '6px 12px', background: 'var(--color-info)', color: 'var(--color-bg-base)', border: 0, borderRadius: 4, fontWeight: 600 }}>SEND</button><button type="button" onClick={() => { if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null } setMessages([]); setInput(''); setPending(false); setSelectedMessageId(null) }} style={{ fontSize: 11, padding: '6px 12px', background: 'var(--color-bg-base)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border-subtle)', borderRadius: 4 }}>CLEAR</button></div></div>
      </Panel>
      <Panel title="SUPPORTING EVIDENCE">
        {selectedMessage?.evidence.length ? selectedMessage.evidence.map((evidence) => <div key={evidence.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--color-border-subtle)' }}><div style={{ fontSize: 10, color: 'var(--color-info)', fontWeight: 700 }}>{evidence.label}</div><div className="mono" style={{ fontSize: 10, marginTop: 3 }}>{evidence.value}</div><button type="button" onClick={() => openEvidence(evidence.view)} style={{ marginTop: 4, fontSize: 9, color: 'var(--color-text-secondary)', background: 'transparent', border: 0, padding: 0 }}>OPEN {evidence.view}</button></div>) : <div className="dim" style={{ fontSize: 11 }}>Select an assistant response to inspect its evidence references.</div>}
      </Panel>
    </div>
  )
}

function createResponse(question: string, result: import('../../contracts').BacktestResult | null): Omit<ChatMessage, 'id' | 'role'> {
  const normalized = question.toLowerCase()
  const resultContext = result ? `${result.experimentId}: net P&L ${result.headline.netPnl}, fill rate ${result.headline.fillRatePct}%` : 'no completed experiment is selected'
  if (normalized.includes('queue') || normalized.includes('fill')) {
    return { content: 'Queue behavior should be investigated through the order timeline and fill probability calibration. The current response is a simulated association, not a guarantee of future fills.', evidence: [{ id: 'queue', label: 'Queue analysis', value: 'Queue-ahead progression and fill probability from the selected mock experiment', view: 'QUEUE ANALYSIS' }], draft: { ...createDefaultBacktestRequest(), parameters: { ...createDefaultBacktestRequest().parameters, queueModel: 'power-1.5' } } }
  }
  if (normalized.includes('latency')) {
    return { content: 'Latency should be separated into decision, order-creation, exchange-arrival, and fill components. A spike is a signal to investigate the execution path, not a standalone prediction.', evidence: [{ id: 'latency', label: 'Latency analysis', value: 'Latency percentiles and component breakdown for the selected experiment', view: 'LATENCY ANALYSIS' }] }
  }
  return { content: `For the selected scenario (${resultContext}), the next useful investigation is to compare the losing interval with queue, volatility, and adverse-selection evidence before changing parameters. This is a simulated hypothesis, not a trading conclusion.`, evidence: [{ id: 'pnl', label: 'Results context', value: resultContext, view: 'P&L ATTRIBUTION' }], draft: createDefaultBacktestRequest() }
}
