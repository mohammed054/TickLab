// IPC channel allowlist + zod payload schemas (docs/06 §6.1).
import { z } from 'zod';

const band = z.enum(['LOW', 'MEDIUM', 'HIGH', 'EXTREME']);
const id = z.number().int().positive();
const empty = z.object({}).strict();

export const FiltersSchema = z.object({
  ageMaxMin: z.number().positive().nullable(), minLiquidityUsd: z.number().min(0), bands: z.array(band),
  minCompleteness: z.number().min(0).max(1), dexes: z.array(z.string()).nullable(),
  watchlistOnly: z.boolean(), hideLowData: z.boolean(), alertsOnly: z.boolean(), search: z.string().max(100),
});
export const DEFAULT_FILTERS = {
  ageMaxMin: 360, minLiquidityUsd: 0, bands: ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'], minCompleteness: 0, dexes: null,
  watchlistOnly: false, hideLowData: false, alertsOnly: false, search: '',
} as const;

const labParams = z.object({
  configId: id.nullable(),
  alertRule: z.object({ maxScore: z.number(), minCompleteness: z.number(), minLiquidityUsd: z.number(), minBuyersH1: z.number(), minAgeMin: z.number(), maxAgeMin: z.number() }),
  sizeUsd: z.number().positive(), horizonsMin: z.array(z.number().positive()).min(1).max(5),
  feePctPerSide: z.number().min(0).max(20), networkFeeUsd: z.number().min(0),
  fromTs: z.number(), toTs: z.number(), seed: z.number().int(), missingMode: z.enum(['conservative', 'optimistic']),
});

export const Schemas = {
  'launches:list': z.object({ filters: FiltersSchema, sort: z.object({ col: z.string(), dir: z.enum(['asc', 'desc']) }), limit: z.number().int().min(1).max(20000) }),
  'launches:get': z.object({ tokenId: id }),
  'launches:stats': empty,
  'detail:select': z.object({ tokenId: id.nullable() }),
  'detail:focus': empty,
  'detail:pin': z.object({ pinned: z.boolean() }),
  'detail:trades': z.object({ tokenId: id, minUsd: z.number().min(0).optional() }),
  'detail:holders': z.object({ tokenId: id }),
  'detail:candles': z.object({ tokenId: id, tf: z.enum(['1m', '5m', '15m']) }),
  'detail:exitEstimate': z.object({ tokenId: id, sizeUsd: z.number().positive() }),
  'judge:get': z.object({ tokenId: id }),
  'judge:recompute': z.object({ tokenId: id }),
  'watchlist:list': empty,
  'watchlist:add': z.object({ tokenId: id }),
  'watchlist:remove': z.object({ tokenId: id }),
  'watchlist:setNote': z.object({ tokenId: id, note: z.string().max(200) }),
  'lab:run': labParams,
  'lab:freeze': z.object({ name: z.string().min(1).max(100), params: labParams }),
  'lab:configs': empty,
  'health:overview': empty,
  'health:gaps': z.object({ limit: z.number().int().min(1).max(500) }),
  'health:errors': z.object({ limit: z.number().int().min(1).max(500) }),
  'health:backfill': empty,
  'health:diagnostics': empty,
  'settings:get': z.object({ keys: z.array(z.string()).optional() }),
  'settings:set': z.object({ key: z.string().min(1), value: z.unknown() }),
  'secret:set': z.object({ name: z.enum(['rpcKey']), value: z.string().min(1).max(500) }),
  'secret:has': z.object({ name: z.enum(['rpcKey']) }),
  'alerts:list': z.object({ limit: z.number().int().min(1).max(200) }),
  'alerts:markSeen': z.object({ ids: z.union([z.array(id), z.literal('all')]) }),
  'app:openExternal': z.object({ url: z.string().max(2000) }),
  'app:info': empty,
  'app:openDataFolder': empty,
  'app:backupNow': empty,
  'app:firstRun': z.object({ done: z.boolean().optional() }),
  'research:jobs:list': z.object({ limit: z.number().int().min(1).max(1000).optional() }),
  'research:jobs:get': z.object({ jobId: z.string().min(1) }),
  'research:jobs:create': z.object({ jobId: z.string().min(1), command: z.string().min(1), payload: z.record(z.unknown()) }),
  'research:jobs:claim': z.object({ jobId: z.string().min(1), pid: z.number().int().positive() }),
  'research:jobs:progress': z.object({ jobId: z.string().min(1), completed: z.number().int().min(0), total: z.number().int().positive(), message: z.string().max(500).optional() }),
  'research:jobs:complete': z.object({ jobId: z.string().min(1), resultPath: z.string().min(1) }),
  'research:jobs:fail': z.object({ jobId: z.string().min(1), errorCode: z.string().min(1), errorMessage: z.string().max(500) }),
  'research:jobs:cancel': z.object({ jobId: z.string().min(1) }),
  'research:jobs:pause': z.object({ jobId: z.string().min(1) }),
  'research:jobs:resume': z.object({ jobId: z.string().min(1) }),
  'research:jobs:interrupt': z.object({ jobId: z.string().min(1) }),
  'research:storage:status': z.object({ refresh: z.boolean().optional() }),
  'research:storage:cleanupPreview': z.object({ verifyHashes: z.boolean().optional() }),
  'journal:summary': z.object({ account: z.enum(['paper', 'real']) }),
  'journal:decisions': z.object({ account: z.enum(['paper', 'real']), status: z.enum(['open', 'closed', 'pending', 'cancelled']).optional(), tokenId: z.number().int().positive().optional() }),
  'journal:equity:list': z.object({ account: z.enum(['paper', 'real']) }),
  'journal:export': z.object({ account: z.enum(['paper', 'real']) }),
} as const;

export type InvokeChannel = keyof typeof Schemas;
export const INVOKE_CHANNELS = Object.keys(Schemas) as InvokeChannel[];

export const EVENT_CHANNELS = [
  'evt:launch-new', 'evt:launches-updated', 'evt:judgement-updated', 'evt:alert',
  'evt:source-status', 'evt:detail-selected', 'evt:risk-state', 'evt:pin-changed',
] as const;
export type EventChannel = (typeof EVENT_CHANNELS)[number];

export const isInvokeChannel = (c: string): c is InvokeChannel => (INVOKE_CHANNELS as string[]).includes(c);
export const isEventChannel = (c: string): c is EventChannel => (EVENT_CHANNELS as readonly string[]).includes(c);
