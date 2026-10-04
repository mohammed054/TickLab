export type DataServiceHealth = 'connecting' | 'connected' | 'disconnected'

export type ImportStatus = 'queued' | 'running' | 'complete' | 'failed'

export interface BinanceTradeDataset {
  source: string
  market: string
  symbol: string
  data_type: string
  source_uri: string
  archive_filename: string
  archive_sha256: string
  retrieved_at_ns: number | string
  coverage_start_ns: number | string
  coverage_end_ns: number | string
  row_count: number
  pipeline_version: string
  dataset_id: string
  data_capabilities: string[]
  book_depth_available: boolean
  historical_best_quotes_available: boolean
  data_fidelity: string
  normalization_status?: string
  raw_csv_path?: string
  normalized_path?: string
  source_order_status?: string
  ordering_regressions?: number
  first_ordering_regression_row?: number | null
}

export interface BinanceImportJob {
  jobId: string
  status: ImportStatus
  source: string
  market: string
  symbol: string
  dataType: string
  startDate: string
  endDate: string
  archivesCompleted?: number
  archivesTotal?: number
  currentArchive?: string
  datasets: Array<Partial<BinanceTradeDataset> & { dataset_id?: string }>
  error?: string
}

export const dataServiceBaseUrl = (import.meta.env.VITE_DATA_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')

async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${dataServiceBaseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    })
  } catch {
    throw new Error(`Cannot reach the TickLab data service at ${dataServiceBaseUrl}. Start it and retry.`)
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = await response.json() as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // Keep the HTTP status when the server did not return a JSON error body.
    }
    throw new Error(detail)
  }
  return await response.json() as T
}

export async function getDataServiceHealth(): Promise<DataServiceHealth> {
  try {
    const result = await readJson<{ status: string }>('/health', { signal: AbortSignal.timeout(3500) })
    return result.status === 'healthy' ? 'connected' : 'disconnected'
  } catch {
    return 'disconnected'
  }
}

export async function listBinanceTradeDatasets(): Promise<BinanceTradeDataset[]> {
  const result = await readJson<{ datasets: BinanceTradeDataset[] }>('/binance/trades/datasets')
  return result.datasets
}

export async function submitBinanceTradeImport(startDate: string, endDate: string): Promise<BinanceImportJob> {
  return await readJson<BinanceImportJob>('/binance/trades/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate }),
  })
}

export async function getBinanceImportJob(jobId: string): Promise<BinanceImportJob> {
  return await readJson<BinanceImportJob>(`/binance/trades/jobs/${encodeURIComponent(jobId)}`)
}

export function formatManifestTimestamp(timestampNs: number | string): string {
  const milliseconds = Number(timestampNs) / 1_000_000
  if (!Number.isFinite(milliseconds)) return 'Invalid timestamp'
  return new Date(milliseconds).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
}

export function formatManifestDate(timestampNs: number | string): string {
  const milliseconds = Number(timestampNs) / 1_000_000
  if (!Number.isFinite(milliseconds)) return 'Invalid date'
  return new Date(milliseconds).toISOString().slice(0, 10)
}

export function formatTradeCount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

export function formatMarketName(market: string): string {
  if (market === 'BINANCE_SPOT') return 'BINANCE SPOT'
  if (market === 'BINANCE_USDM_PERPETUAL') return 'BINANCE USDⓈ-M PERPETUAL'
  return market.replace(/_/g, ' ')
}
