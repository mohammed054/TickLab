import { TimestampNs, timestampMsToNs } from '../../contracts'

export const DEFAULT_SCENARIO_EPOCH_MS = Date.UTC(2024, 7, 8, 0, 0, 0)

export class VirtualClock {
  private elapsedMs: number

  constructor(private readonly epochMs: number) {
    this.elapsedMs = 0
  }

  nowMs(): number {
    return this.epochMs + this.elapsedMs
  }

  nowNs(): TimestampNs {
    return timestampMsToNs(this.nowMs())
  }

  advance(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new Error('clock advance must be a non-negative finite number')
    }
    this.elapsedMs += deltaMs
  }
}
