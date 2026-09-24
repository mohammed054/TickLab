import {
  AlertRecord,
  AuditRecord,
  BacktestJob,
  BacktestRequest,
  BacktestResult,
  ExperimentRecord,
  ExecutionModelConfig,
  LogRecord,
  Note,
  RiskLimitsConfig,
  StrategyRef,
  timestampMsToNs,
  timestampNsToMs,
} from '../contracts'

const BASE_EPOCH_MS = Date.UTC(2024, 7, 8, 14, 0, 0)
const TOTAL_EVENTS = 48_291_204
const DEFAULT_SYMBOL = 'BTCUSDT'
const DEFAULT_EXCHANGE = 'binance-futures'
const DEFAULT_MARKET = 'usdt-futures'
const DEFAULT_STRATEGY: StrategyRef = { id: 'MM_V18', version: 'v18.4', codeHash: 'mock:mm-v18' }

const DEFAULT_EXECUTION_MODEL: ExecutionModelConfig = {
  makerFee: -0.005,
  takerFee: 0.02,
  latencyModel: 'empirical-20ms',
  queueModel: 'power-2.0',
  allowPartialFills: true,
  orderTypesAllowed: ['Limit', 'Market', 'IOC', 'FOK', 'GTC', 'Post-only', 'Reduce-only'],
}

const DEFAULT_RISK_LIMITS: RiskLimitsConfig = {
  maxPosition: 2,
  maxOrderSize: 0.1,
  maxDailyLoss: 250,
  maxDrawdownPct: 10,
  maxOpenOrders: 20,
  maxOrderRatePerSec: 10,
  maxNotionalExposure: 25_000,
  emergencyStopEnabled: true,
}

const RESULT_TEMPLATES = [
  { netPnl: 482.16, returnPct: 4.82, maxDrawdownPct: -2.31, sharpe: 1.42, sortino: 2.08, trades: 18_420, fillRatePct: 41.7, fees: 214, slippage: 86 },
  { netPnl: 731.44, returnPct: 7.31, maxDrawdownPct: -3.84, sharpe: 1.76, sortino: 2.41, trades: 21_806, fillRatePct: 39.4, fees: 268, slippage: 104 },
  { netPnl: -164.82, returnPct: -1.65, maxDrawdownPct: -5.17, sharpe: -0.38, sortino: -0.21, trades: 15_209, fillRatePct: 35.8, fees: 192, slippage: 122 },
]

export interface WorkbenchSnapshot {
  jobs: BacktestJob[]
  experiments: ExperimentRecord[]
  notes: Note[]
  alerts: AlertRecord[]
  logs: LogRecord[]
  audit: AuditRecord[]
}

export function createDefaultBacktestRequest(): BacktestRequest {
  return {
    strategyRef: DEFAULT_STRATEGY,
    parameters: { spreadTicks: 5, orderSize: 0.01, requoteMs: 50, inventoryLimit: 2, inventorySkew: 0.35 },
    datasetId: 'mock-dataset-btcusdt-2024-08-08',
    dateRange: { start: timestampMsToNs(BASE_EPOCH_MS), end: timestampMsToNs(BASE_EPOCH_MS + 86_400_000) },
    initialCapital: 10_000,
    executionModel: DEFAULT_EXECUTION_MODEL,
    riskLimits: DEFAULT_RISK_LIMITS,
    randomSeed: 42,
    iterations: 1,
  }
}

const STORAGE_KEY = 'ticklab.workbench.snapshot.v1'

function loadPersistedSnapshot(): Partial<WorkbenchSnapshot> | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Partial<WorkbenchSnapshot>
  } catch {
    return null
  }
}

function persistSnapshot(snapshot: WorkbenchSnapshot): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    return
  }
}

export class MockWorkbench {
  private readonly jobs = new Map<string, BacktestJob>()
  private readonly timers = new Map<string, number>()
  private readonly listeners = new Set<() => void>()
  private experiments: ExperimentRecord[]
  private notes: Note[]
  private alerts: AlertRecord[]
  private logs: LogRecord[]
  private audit: AuditRecord[]
  private nextJobNumber = 4
  private snapshot: WorkbenchSnapshot

  constructor() {
    const persisted = loadPersistedSnapshot()
    this.experiments = persisted?.experiments ?? this.createSeedExperiments()
    this.notes = persisted?.notes ?? this.createSeedNotes()
    this.alerts = persisted?.alerts ?? this.createSeedAlerts()
    this.logs = persisted?.logs ?? this.createSeedLogs()
    this.audit = persisted?.audit ?? this.createSeedAudit()
    persisted?.jobs?.forEach((job) => this.jobs.set(job.id, job))
    const highestJobNumber = Array.from(this.jobs.keys()).reduce((highest, id) => Math.max(highest, Number(id.replace(/\D/g, '')) || 0), 3)
    this.nextJobNumber = highestJobNumber + 1
    this.snapshot = this.createSnapshot()
    persisted?.jobs?.filter((job) => job.progress.status === 'queued' || job.progress.status === 'running').forEach((job) => this.scheduleJob(job.id))
    if (typeof window !== 'undefined') window.addEventListener('storage', this.handleStorage)
  }

  private readonly handleStorage = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      const parsed: unknown = JSON.parse(event.newValue)
      if (!parsed || typeof parsed !== 'object') return
      this.hydrate(parsed as Partial<WorkbenchSnapshot>)
    } catch {
      return
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): WorkbenchSnapshot => this.snapshot

  startBacktest(request: BacktestRequest = createDefaultBacktestRequest()): string {
    const jobNumber = this.nextJobNumber
    this.nextJobNumber += 1
    const jobId = `mock-job-${jobNumber.toString().padStart(4, '0')}`
    const experimentId = `mock-exp-${jobNumber.toString().padStart(4, '0')}`
    const progress = {
      jobId,
      eventsProcessed: 0,
      totalEvents: TOTAL_EVENTS,
      eventsPerSec: 18_000 + jobNumber * 137,
      ordersSubmitted: 0,
      fills: 0,
      simulatedTimeNs: request.dateRange.start,
      wallClockElapsedMs: 0,
      status: 'queued' as const,
    }
    this.jobs.set(jobId, { id: jobId, request, progress, experimentId, errorMessage: null })
    this.experiments = [this.createExperiment(experimentId, request, 'queued', null), ...this.experiments]
    this.notify()
    this.scheduleJob(jobId)
    return jobId
  }

  private scheduleJob(jobId: string): void {
    if (typeof window === 'undefined' || this.timers.has(jobId)) return
    const timer = window.setTimeout(() => {
      this.advanceJob(jobId)
      const interval = window.setInterval(() => this.advanceJob(jobId), 180)
      this.timers.set(jobId, interval)
    }, 240)
    this.timers.set(jobId, timer)
  }

  advanceJob(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job || job.progress.status === 'complete' || job.progress.status === 'cancelled' || job.progress.status === 'failed') {
      return
    }
    const increment = Math.max(1_000_000, Math.round(job.progress.totalEvents * 0.035))
    const eventsProcessed = Math.min(job.progress.totalEvents, job.progress.eventsProcessed + increment)
    const progress = {
      ...job.progress,
      status: eventsProcessed >= job.progress.totalEvents ? 'complete' as const : 'running' as const,
      eventsProcessed,
      ordersSubmitted: Math.round(eventsProcessed / 27),
      fills: Math.round(eventsProcessed / 117),
      simulatedTimeNs: timestampMsToNs(timestampNsToMs(job.request.dateRange.start) + (timestampNsToMs(job.request.dateRange.end) - timestampNsToMs(job.request.dateRange.start)) * (eventsProcessed / job.progress.totalEvents)),
      wallClockElapsedMs: job.progress.wallClockElapsedMs + 180,
    }
    const nextJob: BacktestJob = { ...job, progress }
    this.jobs.set(jobId, nextJob)
    if (progress.status === 'complete') {
      this.finishJob(nextJob)
    } else {
      this.notify()
    }
  }

  cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job || job.progress.status === 'complete') return
    this.clearTimer(jobId)
    const nextJob = { ...job, progress: { ...job.progress, status: 'cancelled' as const } }
    this.jobs.set(jobId, nextJob)
    this.experiments = this.experiments.map((experiment) => experiment.id === job.experimentId ? { ...experiment, status: 'cancelled' } : experiment)
    this.notify()
  }

  retryJob(jobId: string): string | null {
    const job = this.jobs.get(jobId)
    return job ? this.startBacktest(job.request) : null
  }

  reproduceExperiment(experimentId: string): string | null {
    const experiment = this.experiments.find((candidate) => candidate.id === experimentId)
    if (!experiment) return null
    return this.startBacktest({
      strategyRef: experiment.strategyRef,
      parameters: experiment.parameters,
      datasetId: experiment.datasetId,
      dateRange: experiment.dateRange,
      initialCapital: 10_000,
      executionModel: experiment.executionModel,
      riskLimits: experiment.riskLimits,
      randomSeed: experiment.randomSeed,
      iterations: 1,
    })
  }

  duplicateExperiment(experimentId: string): string | null {
    const experiment = this.experiments.find((candidate) => candidate.id === experimentId)
    if (!experiment) return null
    return this.startBacktest({ strategyRef: experiment.strategyRef, parameters: { ...experiment.parameters }, datasetId: experiment.datasetId, dateRange: experiment.dateRange, initialCapital: 10_000, executionModel: experiment.executionModel, riskLimits: experiment.riskLimits, randomSeed: experiment.randomSeed, iterations: 1 })
  }

  branchExperiment(experimentId: string): string | null {
    const experiment = this.experiments.find((candidate) => candidate.id === experimentId)
    if (!experiment) return null
    const spreadTicks = typeof experiment.parameters.spreadTicks === 'number' ? experiment.parameters.spreadTicks : 5
    return this.startBacktest({ strategyRef: experiment.strategyRef, parameters: { ...experiment.parameters, spreadTicks: spreadTicks + 1 }, datasetId: experiment.datasetId, dateRange: experiment.dateRange, initialCapital: 10_000, executionModel: experiment.executionModel, riskLimits: experiment.riskLimits, randomSeed: experiment.randomSeed, iterations: 1 })
  }

  addNote(note: Omit<Note, 'id' | 'createdAt'>): Note {
    const created: Note = { ...note, id: `mock-note-${this.notes.length + 1}`, createdAt: new Date(BASE_EPOCH_MS + this.notes.length * 60_000).toISOString() }
    this.notes = [created, ...this.notes]
    this.notify()
    return created
  }

  acknowledgeAlert(alertId: string): void {
    this.alerts = this.alerts.map((alert) => alert.id === alertId ? { ...alert, acknowledged: true } : alert)
    this.notify()
  }

  appendAudit(action: string, objectType: string, objectId: string, value: string): void {
    const record: AuditRecord = { id: `mock-audit-${this.audit.length + 1}`, timestampNs: timestampMsToNs(BASE_EPOCH_MS + this.audit.length * 1_000), actor: { type: 'human', id: 'local-user' }, action, objectType, objectId, value }
    this.audit = [record, ...this.audit]
    this.notify()
  }

  getExperimentResult(experimentId: string): BacktestResult | null {
    return this.experiments.find((experiment) => experiment.id === experimentId)?.results ?? null
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.handleStorage)
      this.timers.forEach((timer) => window.clearTimeout(timer))
      this.timers.forEach((timer) => window.clearInterval(timer))
    }
    this.timers.clear()
    this.listeners.clear()
  }

  private hydrate(snapshot: Partial<WorkbenchSnapshot>): void {
    this.timers.forEach((timer) => {
      if (typeof window !== 'undefined') {
        window.clearTimeout(timer)
        window.clearInterval(timer)
      }
    })
    this.timers.clear()
    this.jobs.clear()
    snapshot.jobs?.forEach((job) => this.jobs.set(job.id, job))
    this.nextJobNumber = Array.from(this.jobs.keys()).reduce((highest, id) => Math.max(highest, Number(id.replace(/\D/g, '')) || 0), 3) + 1
    this.experiments = snapshot.experiments ?? this.experiments
    this.notes = snapshot.notes ?? this.notes
    this.alerts = snapshot.alerts ?? this.alerts
    this.logs = snapshot.logs ?? this.logs
    this.audit = snapshot.audit ?? this.audit
    this.snapshot = this.createSnapshot()
    this.jobs.forEach((job) => {
      if (job.progress.status === 'queued' || job.progress.status === 'running') this.scheduleJob(job.id)
    })
    this.listeners.forEach((listener) => listener())
  }

  private finishJob(job: BacktestJob): void {
    this.clearTimer(job.id)
    const result = this.createResult(job)
    this.experiments = this.experiments.map((experiment) => experiment.id === job.experimentId ? { ...experiment, status: 'complete', results: result } : experiment)
    this.logs = [{ id: `mock-log-${this.logs.length + 1}`, timestampNs: job.request.dateRange.end, category: 'System', level: 'INFO', service: 'mock-workbench', message: `Backtest ${job.id} completed`, context: { jobId: job.id, experimentId: job.experimentId } }, ...this.logs]
    this.notify()
  }

  private createResult(job: BacktestJob): BacktestResult {
    const template = RESULT_TEMPLATES[(this.nextJobNumber - 2) % RESULT_TEMPLATES.length]
    const initialCapital = job.request.initialCapital
    const finalCapital = initialCapital + template.netPnl
    return {
      jobId: job.id,
      experimentId: job.experimentId,
      engineVersion: 'hftbacktest-mock-0.1.0',
      headline: {
        initialCapital,
        finalCapital,
        netPnl: template.netPnl,
        returnPct: template.returnPct,
        maxDrawdownPct: template.maxDrawdownPct,
        sharpe: template.sharpe,
        sortino: template.sortino,
        trades: template.trades,
        fillRatePct: template.fillRatePct,
        fees: template.fees,
        slippage: template.slippage,
      },
      recorderSeriesRef: `mock://recorder/${job.experimentId}.npz`,
      fineGrainedEventsRef: `mock://events/${job.experimentId}.parquet`,
    }
  }

  private createExperiment(id: string, request: BacktestRequest, status: ExperimentRecord['status'], results: BacktestResult | null): ExperimentRecord {
    return {
      id,
      strategyRef: request.strategyRef,
      parameters: request.parameters,
      datasetId: request.datasetId,
      dateRange: request.dateRange,
      exchange: DEFAULT_EXCHANGE,
      symbol: DEFAULT_SYMBOL,
      market: DEFAULT_MARKET,
      executionModel: request.executionModel,
      riskLimits: request.riskLimits,
      randomSeed: request.randomSeed,
      createdAt: new Date(BASE_EPOCH_MS).toISOString(),
      createdBy: { agentType: 'human', id: 'local-user' },
      parentExperimentId: null,
      status,
      results,
    }
  }

  private createSeedExperiments(): ExperimentRecord[] {
    const request = createDefaultBacktestRequest()
    return ['mock-exp-0001', 'mock-exp-0002', 'mock-exp-0003'].map((id, index) => {
      const template = RESULT_TEMPLATES[index]
      const initialCapital = request.initialCapital
      const results: BacktestResult = {
        jobId: `mock-job-${index + 1}`,
        experimentId: id,
        engineVersion: 'hftbacktest-mock-0.1.0',
        headline: {
          initialCapital,
          finalCapital: initialCapital + template.netPnl,
          netPnl: template.netPnl,
          returnPct: template.returnPct,
          maxDrawdownPct: template.maxDrawdownPct,
          sharpe: template.sharpe,
          sortino: template.sortino,
          trades: template.trades,
          fillRatePct: template.fillRatePct,
          fees: template.fees,
          slippage: template.slippage,
        },
        recorderSeriesRef: `mock://recorder/${id}.npz`,
        fineGrainedEventsRef: `mock://events/${id}.parquet`,
      }
      return this.createExperiment(id, request, 'complete', results)
    })
  }

  private createSeedNotes(): Note[] {
    return [{ id: 'mock-note-1', targetType: 'strategy', targetId: DEFAULT_STRATEGY.id, body: 'Review quote behavior during the volatility burst.', authoredBy: { agentType: 'human', id: 'local-user' }, createdAt: new Date(BASE_EPOCH_MS).toISOString() }]
  }

  private createSeedAlerts(): AlertRecord[] {
    return [{ id: 'mock-alert-1', type: 'latency', severity: 'warning', message: 'Mock feed latency is above the configured warning threshold.', linkedView: { path: 'analytics/latency', params: {} }, createdAt: new Date(BASE_EPOCH_MS).toISOString(), acknowledged: false }]
  }

  private createSeedLogs(): LogRecord[] {
    return [{ id: 'mock-log-1', timestampNs: timestampMsToNs(BASE_EPOCH_MS), category: 'System', level: 'INFO', service: 'mock-runtime', message: 'Deterministic mock scenario initialized', context: { scenario: 'btc-2024-08-08' } }]
  }

  private createSeedAudit(): AuditRecord[] {
    return [{ id: 'mock-audit-1', timestampNs: timestampMsToNs(BASE_EPOCH_MS), actor: { type: 'system', id: 'mock-runtime' }, action: 'SCENARIO_INITIALIZED', objectType: 'workspace', objectId: 'btc-2024-08-08', value: 'deterministic mock scenario loaded' }]
  }

  private createSnapshot(): WorkbenchSnapshot {
    return { jobs: Array.from(this.jobs.values()), experiments: this.experiments, notes: this.notes, alerts: this.alerts, logs: this.logs, audit: this.audit }
  }

  private notify(): void {
    this.snapshot = this.createSnapshot()
    persistSnapshot(this.snapshot)
    this.listeners.forEach((listener) => listener())
  }

  private clearTimer(jobId: string): void {
    const timer = this.timers.get(jobId)
    if (timer === undefined) return
    if (typeof window !== 'undefined') {
      window.clearTimeout(timer)
      window.clearInterval(timer)
    }
    this.timers.delete(jobId)
  }
}

export const mockWorkbench = new MockWorkbench()
