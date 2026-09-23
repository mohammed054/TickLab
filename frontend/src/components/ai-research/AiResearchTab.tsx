import { useState } from 'react'
import { Panel } from '../shared/Panel'
import { useWorkspace } from '../../state/useWorkspace'

type EvidenceQuery = {
  label: string
  value: string
}

type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  evidence?: EvidenceQuery[]
}

const MOCK_RESPONSES = [
  {
    content:
      'I can see from the analytics data that during the highest-volatility intervals, adverse-selection losses increased while average spread capture remained relatively unchanged. This suggests testing wider quotes specifically during elevated volatility.',
    evidence: [
      { label: 'Adverse selection distribution', value: 'Queried §9.6 aggregated markout distribution' },
      { label: 'Spread capture baseline', value: 'Compared against experiment\'s trailing baseline' },
    ],
  },
  {
    content:
      'The fill simulation shows that queue model Power(2.0) keeps orders 4.8 BTC deep in the queue at 14:00, while Power(1.5) reduces this to ~2.1 BTC. Would you like me to propose a experiment with the narrower queue model?',
    evidence: [
      { label: 'Fill timing data', value: 'genMockTrades queue depth analysis' },
      { label: 'Queue model comparison', value: 'Power(2.0) vs Power(1.5) fill times' },
    ],
  },
  {
    content:
      'The recent backtest failure was caused by a dataset normalization issue — the timestamp alignment step in the data pipeline (§5.2) produced offsets greater than 50ms for 12% of records, which the engine rejects as out-of-order events.',
    evidence: [
      { label: 'Pipeline error log', value: 'docs/14 §14.4/§14.9 structured error data' },
      { label: 'Timestamp validation', value: '§5.2 timestamp validation stage' },
    ],
  },
]

export function AiResearchTab() {
  const [ws] = useWorkspace()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [evidencePanelOpen, setEvidencePanelOpen] = useState(false)
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(-1)

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return

    const newMessage: ChatMessage = {
      id: messages.length,
      role: 'user',
      content: trimmed,
    }

    setMessages((prev) => [...prev, newMessage])
    setInput('')

    // Add mock assistant response after a short delay
    setTimeout(() => {
      const mockResponse = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)]
      const assistantMessage: ChatMessage = {
        id: messages.length + 1,
        role: 'assistant',
        content: mockResponse.content,
        evidence: mockResponse.evidence,
      }

      setMessages((prev) => [...prev, assistantMessage])
    }, 500)
  }

  const createExperimentFromMessage = (msgIndex: number) => {
    const msg = messages[msgIndex]
    if (msg.role !== 'assistant') return

    // Render the [CREATE EXPERIMENT] action inline
    return (
      <div
        style={{
          marginTop: 6,
          padding: 8,
          background: 'var(--bg-2)',
          borderRadius: 3,
          border: '1px solid var(--border-1)',
          fontSize: 11,
        }}
      >
        <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
          [ CREATE EXPERIMENT ]{' '}
          {msg.content.split('.')[0].substring(0, 40)}...
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Panel title="AI RESEARCH ASSISTANT (MOCK — no real LLM call)">
        <div style={{ padding: 8, borderBottom: '1px solid var(--border-1)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-2)', marginBottom: 4 }}>
            CHAT STYLE • EVIDENCE CITATION REQUIRED
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 8,
              fontSize: 10,
              color: 'var(--text-2)',
            }}
          >
            <span>History:</span>
            <span>{messages.length} messages</span>
          </div>
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, padding: 8, overflow: 'auto' }}>
          {messages.map((msg, idx) => {
            const isAssistant = msg.role === 'assistant'
            const badgeClass = isAssistant
              ? 'ai-badge'
              : 'human-badge'

            return (
              <div
                key={msg.id}
                style={{
                  marginBottom: 12,
                  padding: isAssistant ? 8 : 6,
                  borderRadius: 3,
                  background: isAssistant ? 'var(--bg-2)' : 'var(--bg-1)',
                  border: '1px solid var(--border-1)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      fontSize: 9,
                      fontWeight: 600,
                      marginRight: 6,
                      textAlign: 'center',
                      lineHeight: 1.8,
                      background: isAssistant ? 'var(--accent)' : 'var(--text-1)',
                      color: '#ffffff',
                    }}
                  >
                    {isAssistant ? 'AI' : 'H'}
                  </span>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: isAssistant ? 'var(--text-0)' : 'var(--text-1)',
                      lineHeight: 1.5,
                    }}
                  >
                    {msg.content}
                  </div>
                </div>

                {msg.evidence && msg.evidence.length > 0 && (
                  <div
                    style={{
                      marginTop: 4,
                      paddingTop: 4,
                      borderTop: '1px solid var(--border-1)',
                      fontSize: 10,
                      color: 'var(--text-2)',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-1)' }}>
                      Evidence:
                    </div>
                    {msg.evidence.map((ev, i) => (
                      <div
                        key={i}
                        style={{
                          marginBottom: 3,
                          paddingLeft: 4,
                          borderLeft: '2px solid var(--accent)',
                          fontSize: 10,
                        }}
                      >
                        <span>{ev.label}</span>: {ev.value}
                      </div>
                    ))}
                  </div>
                )}

                {isAssistant && createExperimentFromMessage(idx)}
              </div>
            )
          })}

          {messages.length === 0 && (
            <div className="dim" style={{ padding: 16, color: 'var(--text-2)' }}>
              Start a conversation by typing a question below.
            </div>
          )}
        </div>

        <div style={{ padding: 8, borderTop: '1px solid var(--border-1)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 10, color: 'var(--text-2)' }}>
            <span>Quick questions:</span>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the AI Research Assistant about metrics, experiments, or backtest results…"
            spellCheck={false}
            rows={1}
            style={{
              flex: '1 1 0',
              width: '100%',
              minHeight: 32,
              resize: 'vertical',
              background: 'var(--bg-0)',
              color: 'var(--text-0)',
              border: '1px solid var(--border-1)',
              borderRadius: 3,
              padding: 8,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', marginTop: 6, gap: 6 }}>
            <button
              onClick={handleSend}
              style={{
                fontSize: 11,
                padding: '6px 12px',
                background: 'var(--accent)',
                color: '#0d0f12',
                border: 'none',
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              Send
            </button>
            <button
              onClick={() => setInput('')}
              style={{
                fontSize: 11,
                padding: '6px 12px',
                background: 'var(--bg-0)',
                color: 'var(--text-2)',
                border: '1px solid var(--border-1)',
                borderRadius: 4,
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </Panel>
    </div>
  )
}