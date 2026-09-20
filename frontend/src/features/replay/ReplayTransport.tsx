import { useWorkspaceContext } from '../../shared/sync-bus'
import { publishWorkspaceChange } from '../../shared/sync-bus'

export interface ReplayTransportControls {
  prev: () => void
  next: () => void
  playPause: () => void
  setSpeed: (speed: number) => void
}

export const ReplayTransport: React.FC = () => {
  const {
    timestamp,
    replay: { isPlaying, speed, rangeStart, rangeEnd },
    setTimestamp,
    setActiveTab,
  } = useWorkspaceContext()

  const handlePrev = () => {
    if (rangeStart != null) {
      const newStart = Math.max(0, rangeStart - 1000)
      setTimestamp(newStart)
      publishWorkspaceChange({ timestamp: newStart, replay: { isPlaying: true, speed, rangeStart: newStart, rangeEnd } }, 'secondary')
    }
  }

  const handleNext = () => {
    if (rangeEnd != null) {
      const newEnd = rangeEnd + 1000
      setTimestamp(newEnd)
      publishWorkspaceChange({ timestamp: newEnd, replay: { isPlaying: true, speed, rangeStart, rangeEnd: newEnd } }, 'secondary')
    }
  }

  const handlePlayPause = () => {
    const newIsPlaying = !isPlaying
    setActiveTab(prev => prev) // triggers re-render
    publishWorkspaceChange({ replay: { ...replay, isPlaying: newIsPlaying } }, 'secondary')
  }

  const handleSpeedChange = (speed: number) => {
    setTimestamp(prev => prev) // no-op but triggers re-render
    publishWorkspaceChange({ replay: { ...replay, speed } }, 'secondary')
  }

  return (
    <div className="replay-transport">
      <button onClick={handlePrev} disabled={rangeStart == null} title="Previous event">
        ⏪
      </button>
      <button onClick={handlePlayPause} disabled={isPlaying} title="Play">
        ▶
      </button>
      <button onClick={handlePlayPause} title="Pause">
        ⏸
      </button>
      <button onClick={handleNext} disabled={rangeEnd == null} title="Next event">
        ⏩
      </button>
      <span>
        {speed.toFixed(2)}x
      </span>
    </div>
  )
}