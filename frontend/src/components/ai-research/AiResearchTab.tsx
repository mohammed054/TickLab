import { useEffect, useRef, useState } from 'react'
import { BacktestRequest } from '../../contracts'
import { createDefaultBacktestRequest, mockWorkbench } from '../../mock/workbench'
import { useWorkbench } from '../../state/workbenchStore'
import { useWorkspace } from '../../state/useWorkspace'
import { AttributionBadge, LoadingState } from '../../shared/design-system/primitives'
import { Panel } from '../shared/Panel'

type EvidenceRef = { id: string; label: string; value: string; view: string }
type ChatMessage = { id: number; role: 'user' | 'assistant'; content: string; evidence: EvidenceRef[]; draft?: BacktestRequest }

const QUICK_QUESTIONS = [
  'Why did the strategy underperform in the morning session?',
  'Analyze queue-ahead cancellation velocity',
  'Suggest optimal inventory skew parameters',
  'Assess adverse selection on passive fills',
]

export function AiResearchTab() {
  const { experiments } = useWorkbench()
  const [workspace, updateWorkspace] = useWorkspace()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const selectedExperiment =
    experiments.find((experiment) => experiment.id === workspace.experiment?.id && experiment.results !== null) ??
    experiments.find((experiment) => experiment.results !== null)

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

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
    const analyticsView = view.toLowerCase().includes('queue')
      ? 'queue'
      : view.toLowerCase().includes('latency')
      ? 'latency'
      : view.toLowerCase().includes('attribution')
      ? 'attribution'
      : 'equity'
    updateWorkspace({ activeTab: { secondaryMonitor: 'analytics' } })
    window.dispatchEvent(new CustomEvent('ticklab:analytics-view', { detail: analyticsView }))
  }

  const selectedMessage = messages.find((message) => message.id === selectedMessageId)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 34%)',
        gap: 6,
        height: '100%',
        minHeight: 0,
      }}
    >
      <Panel
        title="AI QUANT RESEARCH ANALYST"
        bodyStyle={{ display: 'flex', flexDirection: 'column', padding: 0 }}
      >
        <div
          style={{
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            padding: '5px 8px',
            borderBottom: '1px solid var(--color-border-subtle)',
            background: 'var(--color-bg-raised)',
          }}
        >
          {QUICK_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => send(question)}
              style={{
                fontSize: '9.5px',
                padding: '2px 7px',
                background: 'var(--color-bg-control)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
              }}
            >
              {question}
            </button>
          ))}
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, padding: 10, overflow: 'auto' }}>
          {messages.length === 0 && (
            <div className="dim" style={{ padding: 20, textAlign: 'center', fontSize: 'var(--font-size-xs)' }}>
              Ask the AI Quantitative Analyst about order flow anomalies, parameter sensitivity, fill slippage, or queue progression.
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                marginBottom: 10,
                padding: 10,
                background: message.role === 'assistant' ? 'var(--color-bg-raised)' : 'var(--color-bg-panel)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-xs)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <AttributionBadge kind={message.role === 'assistant' ? 'ai' : 'human'} />
                <span className="dim" style={{ fontSize: '10px' }}>
                  {message.role === 'assistant' ? 'AI Quant Agent' : 'Lead Trader'}
                </span>
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
                {message.content}
              </div>
              {message.evidence.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedMessageId(message.id)}
                  style={{
                    marginTop: 6,
                    fontSize: '10px',
                    color: 'var(--color-focus)',
                    background: 'transparent',
                    border: 0,
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  Inspect {message.evidence.length} cited evidence artifact(s) →
                </button>
              )}
              {message.draft && (
                <button
                  type="button"
                  onClick={() => createExperiment(message)}
                  style={{
                    display: 'block',
                    marginTop: 8,
                    padding: '4px 8px',
                    background: 'var(--color-info)',
                    color: 'var(--color-bg-base)',
                    border: 0,
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  [ SPAWN CANDIDATE EXPERIMENT ]
                </button>
              )}
            </div>
          ))}
          {pending && <LoadingState label="Evaluating statistical evidence & tear-sheet…" progress={45} />}
        </div>

        <div style={{ padding: 8, borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-raised)' }}>
          <textarea
            aria-label="Ask the research assistant"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                send(input)
              }
            }}
            placeholder="Ask questions about strategy performance, micro-structure, or parameters… (Ctrl+Enter to send)"
            rows={2}
            style={{
              width: '100%',
              resize: 'vertical',
              background: 'var(--color-bg-base)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-xs)',
              padding: 8,
              fontSize: 'var(--font-size-xs)',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              type="button"
              disabled={pending || !input.trim()}
              onClick={() => send(input)}
              style={{
                fontSize: 'var(--font-size-xs)',
                padding: '4px 12px',
                background: 'var(--color-info)',
                color: 'var(--color-bg-base)',
                border: 0,
                borderRadius: 'var(--radius-xs)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              QUERY AGENT
            </button>
            <button
              type="button"
              onClick={() => {
                if (timerRef.current !== null) {
                  window.clearTimeout(timerRef.current)
                  timerRef.current = null
                }
                setMessages([])
                setInput('')
                setPending(false)
                setSelectedMessageId(null)
              }}
              style={{
                fontSize: 'var(--font-size-xs)',
                padding: '4px 12px',
                background: 'var(--color-bg-base)',
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
              }}
            >
              CLEAR CONVERSATION
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="CITED QUANTITATIVE EVIDENCE">
        {selectedMessage?.evidence.length ? (
          selectedMessage.evidence.map((evidence) => (
            <div
              key={evidence.id}
              style={{
                marginBottom: 8,
                paddingBottom: 8,
                borderBottom: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ fontSize: '10.5px', color: 'var(--color-focus)', fontWeight: 700 }}>
                {evidence.label}
              </div>
              <div className="mono" style={{ fontSize: '10px', marginTop: 3, color: 'var(--color-text-secondary)' }}>
                {evidence.value}
              </div>
              <button
                type="button"
                onClick={() => openEvidence(evidence.view)}
                style={{
                  marginTop: 5,
                  fontSize: '9.5px',
                  color: 'var(--color-text-primary)',
                  background: 'var(--color-bg-control)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '2px 6px',
                  cursor: 'pointer',
                }}
              >
                OPEN {evidence.view} →
              </button>
            </div>
          ))
        ) : (
          <div className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>
            Select an assistant message to inspect quantitative evidence artifacts and data proofs.
          </div>
        )}
      </Panel>
    </div>
  )
}

function createResponse(
  question: string,
  result: import('../../contracts').BacktestResult | null
): Omit<ChatMessage, 'id' | 'role'> {
  const normalized = question.toLowerCase()
  const resultContext = result
    ? `${result.experimentId}: Net P&L $${result.headline.netPnl.toFixed(2)}, Fill Rate ${result.headline.fillRatePct.toFixed(1)}%, Sharpe ${result.headline.sharpe}`
    : 'Active market scenario'

  if (normalized.includes('queue') || normalized.includes('fill')) {
    return {
      content:
        'Analysis of queue-ahead depth reveals that fill probability is highly sensitive to queue progression in volatile periods. When order cancellation velocity increases at top of book, resting orders experience extended wait times before fill execution.',
      evidence: [
        {
          id: 'queue',
          label: 'Queue Depth Progression',
          value: 'Queue-ahead depletion rate and fill probability distribution from backtest event logs',
          view: 'QUEUE ANALYSIS',
        },
      ],
      draft: {
        ...createDefaultBacktestRequest(),
        parameters: { ...createDefaultBacktestRequest().parameters, queueModel: 'power-1.5' },
      },
    }
  }

  if (normalized.includes('latency')) {
    return {
      content:
        'Hardware decision latency is currently operating at 200μs baseline with 99th percentile at 1.2ms. The observed latency distribution indicates minimal queue jitter across the iceoryx2 zero-copy IPC bus.',
      evidence: [
        {
          id: 'latency',
          label: 'Latency Percentiles Breakdown',
          value: 'Feed arrival, decision calculation, order submission, and exchange gateway RTT metrics',
          view: 'LATENCY ANALYSIS',
        },
      ],
    }
  }

  return {
    content: `Based on active telemetry (${resultContext}), strategy performance exhibits steady positive alpha under mean-reverting regimes. Recommendation: optimize inventory skew coefficient from 0.35 to 0.42 to minimize post-fill adverse selection markout.`,
    evidence: [
      {
        id: 'pnl',
        label: 'P&L Attribution Vector',
        value: resultContext,
        view: 'P&L ATTRIBUTION',
      },
    ],
    draft: createDefaultBacktestRequest(),
  }
}
