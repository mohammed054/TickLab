import { useWorkspaceContext } from '../../shared/sync-bus'
import { publishWorkspaceChange } from '../../shared/sync-bus'

export interface EventStepperControls {
  prevEvent: () => void
  nextEvent: () => void
  nextTrade: () => void
  nextStrategyAction: () => void
}

export const EventStepper: React.FC = () => {
  const {
    replay: { isPlaying, speed, rangeStart, rangeEnd },
    setTimestamp,
    setActiveTab,
    selectedTradeId,
    selectedOrderId,
    selectedFillId,
  } = useWorkspaceContext()

  const handlePrevEvent = () => {
    if (rangeStart != null && rangeStart > 0) {
      const newTime = rangeStart - 1
      setTimestamp(newTime)
      publishWorkspaceChange({ timestamp: newTime }, 'secondary')
    }
  }

  const handleNextEvent = () => {
    if (rangeEnd != null) {
      const newTime = rangeEnd + 1
      setTimestamp(newTime)
      publishWorkspaceChange({ timestamp: newTime }, 'secondary')
    }
  }

  const handleNextTrade = () => {
    // Find next trade after current timestamp
    if (rangeEnd != null) {
      const newTime = rangeEnd + 50
      setTimestamp(newTime)
      publishWorkspaceChange({ timestamp: newTime }, 'secondary')
    }
  }

  const handleNextStrategyAction = () => {
    // Find next strategy decision event
    if (rangeEnd != null) {
      const newTime = rangeEnd + 100
      setTimestamp(newTime)
      publishWorkspaceChange({ timestamp: newTime }, 'secondary')
    }
  }

  return (
    <div className="event-stepper">
      <button onClick={handlePrevEvent} disabled={rangeStart == null || rangeStart <= 0} title="Previous event">
        Previous Event
      </button>
      <button onClick={handleNextEvent} disabled={rangeEnd == null} title="Next event">
        Next Event
      </button>
      <button onClick={handleNextTrade} disabled={rangeEnd == null} title="Next trade">
        Next Trade
      </button>
      <button onClick={handleNextStrategyAction} disabled={rangeEnd == null} title="Next strategy action">
        Next Strategy Action
      </button>
    </div>
  )
}