// Typed request/response map for every invoke channel (docs/06 §6.1). Single contract for main handlers and renderer.
import type { z } from 'zod';
import type { Schemas, EventChannel } from './ipc';
import type {
  Result, LaunchRow, TokenDetail, Trade, HolderSnapshot, Candle, StoredJudgement, WatchRow, RiskState, DecisionRow,
  EquityPoint, UnlinkedTrade, LabResult, FrozenConfig, SourceStatus, Gap, ErrorRow, AlertRow, Account, DecisionStatus,
} from './types';

type Req<C extends keyof typeof Schemas> = z.infer<(typeof Schemas)[C]>;

export interface JournalSummary {
  equity: number; peak: number; realizedPnl: number; winRate: number | null; n: number; openExposure: number; drawdownPct: number; risk: RiskState;
}
export interface HealthOverview {
  sources: SourceStatus[];
  budgets: { gtCallsLastMinute: number; gtCap: number; rpcCreditsMonth: number; rpcBudget: number; aiToday: number; aiLimit: number };
  gaps24h: number; intervalMultiplier: number; dbBytes: number; trackedCount: number; deepCount: number; skippedQuote: number;
}
export interface LaunchStats { total: number; tracked: number; deep: number; alertsToday: number; gaps24h: number }
export interface AiAnswer { text: string; cached: boolean; model: string; remainingToday: number }

export interface ApiMap {
  'launches:list': { req: Req<'launches:list'>; res: LaunchRow[] };
  'launches:get': { req: Req<'launches:get'>; res: TokenDetail };
  'launches:stats': { req: Req<'launches:stats'>; res: LaunchStats };
  'detail:select': { req: Req<'detail:select'>; res: void };
  'detail:focus': { req: Req<'detail:focus'>; res: void };
  'detail:pin': { req: Req<'detail:pin'>; res: void };
  'detail:trades': { req: Req<'detail:trades'>; res: Trade[] };
  'detail:holders': { req: Req<'detail:holders'>; res: HolderSnapshot | null };
  'detail:candles': { req: Req<'detail:candles'>; res: Candle[] };
  'detail:exitEstimate': { req: Req<'detail:exitEstimate'>; res: { impactPct: number | null; receivedUsd: number | null } };
  'judge:get': { req: Req<'judge:get'>; res: StoredJudgement | null };
  'judge:recompute': { req: Req<'judge:recompute'>; res: StoredJudgement | null };
  'watchlist:list': { req: Req<'watchlist:list'>; res: WatchRow[] };
  'watchlist:add': { req: Req<'watchlist:add'>; res: void };
  'watchlist:remove': { req: Req<'watchlist:remove'>; res: void };
  'watchlist:setNote': { req: Req<'watchlist:setNote'>; res: void };
  'journal:summary': { req: Req<'journal:summary'>; res: JournalSummary };
  'journal:decisions': { req: Req<'journal:decisions'>; res: DecisionRow[] };
  'journal:decision:create': { req: Req<'journal:decision:create'>; res: { decisionId: number } };
  'journal:fill:create': { req: Req<'journal:fill:create'>; res: { fillId: number } };
  'journal:fill:void': { req: Req<'journal:fill:void'>; res: void };
  'journal:paperExit': { req: Req<'journal:paperExit'>; res: { fillId: number } };
  'journal:note:add': { req: Req<'journal:note:add'>; res: void };
  'journal:equity:add': { req: Req<'journal:equity:add'>; res: void };
  'journal:equity:list': { req: Req<'journal:equity:list'>; res: EquityPoint[] };
  'journal:risk:ack': { req: Req<'journal:risk:ack'>; res: RiskState };
  'journal:export': { req: Req<'journal:export'>; res: { path: string } };
  'wallet:sync': { req: Req<'wallet:sync'>; res: { imported: number; unlinked: number } };
  'wallet:unlinked:list': { req: Req<'wallet:unlinked:list'>; res: UnlinkedTrade[] };
  'wallet:unlinked:link': { req: Req<'wallet:unlinked:link'>; res: { fillId: number } };
  'wallet:unlinked:dismiss': { req: Req<'wallet:unlinked:dismiss'>; res: void };
  'lab:run': { req: Req<'lab:run'>; res: LabResult };
  'lab:freeze': { req: Req<'lab:freeze'>; res: { configId: number; sha256: string } };
  'lab:configs': { req: Req<'lab:configs'>; res: FrozenConfig[] };
  'health:overview': { req: Req<'health:overview'>; res: HealthOverview };
  'health:gaps': { req: Req<'health:gaps'>; res: Gap[] };
  'health:errors': { req: Req<'health:errors'>; res: ErrorRow[] };
  'health:backfill': { req: Req<'health:backfill'>; res: void };
  'health:diagnostics': { req: Req<'health:diagnostics'>; res: { path: string } };
  'settings:get': { req: Req<'settings:get'>; res: Record<string, unknown> & { __pending?: { key: string; value: unknown; effectiveAt: number }[] } };
  'settings:set': { req: Req<'settings:set'>; res: { effectiveAt: number } };
  'secret:set': { req: Req<'secret:set'>; res: void };
  'secret:has': { req: Req<'secret:has'>; res: boolean };
  'ai:explain': { req: Req<'ai:explain'>; res: AiAnswer };
  'ai:models': { req: Req<'ai:models'>; res: { id: string; name: string }[] };
  'ai:usage': { req: Req<'ai:usage'>; res: { today: number; limit: number; remaining: number } };
  'alerts:list': { req: Req<'alerts:list'>; res: AlertRow[] };
  'alerts:markSeen': { req: Req<'alerts:markSeen'>; res: void };
  'app:openExternal': { req: Req<'app:openExternal'>; res: void };
  'app:info': { req: Req<'app:info'>; res: { version: string; dataDir: string; firstRunDone: boolean } };
  'app:openDataFolder': { req: Req<'app:openDataFolder'>; res: void };
  'app:backupNow': { req: Req<'app:backupNow'>; res: { path: string } };
  'app:firstRun': { req: Req<'app:firstRun'>; res: { firstRunDone: boolean } };
}

export interface EventMap {
  'evt:launch-new': { tokenId: number };
  'evt:launches-updated': { tokenIds: number[] };
  'evt:judgement-updated': { tokenId: number };
  'evt:alert': AlertRow;
  'evt:source-status': SourceStatus[];
  'evt:detail-selected': { tokenId: number | null };
  'evt:risk-state': { account: Account; risk: RiskState };
  'evt:pin-changed': { pinned: boolean };
}

/** The renderer's only bridge to main (preload exposes exactly this as window.api). */
export interface RendererApi {
  invoke<C extends keyof ApiMap>(channel: C, payload: ApiMap[C]['req']): Promise<Result<ApiMap[C]['res']>>;
  on<E extends EventChannel>(channel: E, cb: (payload: EventMap[E]) => void): () => void;
}
export type { DecisionStatus };
