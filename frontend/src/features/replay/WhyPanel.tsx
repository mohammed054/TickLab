import { useWorkspaceContext } from '../../shared/sync-bus'
import { publishWorkspaceChange } from '../../shared/sync-bus'

type WhyQuestion =
  | 'why-lost-here'
  | 'why-no-fill'
  | 'why-inventory-increased'
  | 'why-fill-rate-collapsed'
  | 'why-latency-spiked'

interface QuestionMeta {
  label: string
  navigatesTo: string
}

const QUESTIONS: Record<WhyQuestion, QuestionMeta> = {
  'why-lost-here': {
    label: 'Why did the strategy lose here?',
    navigatesTo: 'Trade Investigation (§8.20)',
  },
  'why-no-fill': {
    label: 'Why didn\'t this order fill?',
    navigatesTo: 'Queue Analysis (§9.7)',
  },
  'why-inventory-increased': {
    label: 'Why did inventory increase?',
    navigatesTo: 'Position Tracking',
  },
  'why-fill-rate-collapsed': {
    label: 'Why did fill rate collapse?',
    navigatesTo: 'Fill Rate Metrics (§9.8)',
  },
  'why-latency-spiked': {
    label: 'Why did latency spike?',
    navigatesTo: 'Latency Breakdown (§9.9)',
  },
}

export const WhyPanel: React.FC = () => {
  const {
    selectedTradeId,
    selectedOrderId,
    selectedFillId,
    timestamp,
    experiment,
  } = useWorkspaceContext()

  const handleSelect = (question: WhyQuestion) => {
    const meta = QUESTIONS[question]
    // Navigate workspace via Sync Bus to the evidence
    publishWorkspaceChange({
      selectedTradeId,
      selectedOrderId,
      selectedFillId,
      timestamp,
      experiment,
    }, 'secondary')
    // In a full implementation, this would also open the specific panel
    // For now, we publish the change and let the workspace navigate
  }

  return (
    <div className="why-panel">
      <h3>Why Investigation</h3>
      <div className="question-list">
        {Object.entries(QUESTIONS).map
  ([key, meta]) => (
    <div
      key={key}
      className="question-item"
      onClick={() => handleSelect(key as WhyQuestion)}
    >
      <span className="question-text">{meta.label}</span>
    </div>
  )}
</div>
</div>
  )
}