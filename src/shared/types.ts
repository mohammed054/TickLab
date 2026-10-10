// Core shared types (docs/06 §6.2). Row types mirror docs/02 columns.
export type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

export type ErrorCode =
  | 'NET_TIMEOUT' | 'NET_OFFLINE' | 'HTTP_429' | 'HTTP_5XX' | 'HTTP_4XX' | 'PARSE_FAIL'
  | 'RPC_ERROR' | 'DB_ERROR' | 'VALIDATION' | 'RISK_BLOCKED' | 'AI_LIMIT' | 'AI_FAIL'
  | 'NOT_IMPLEMENTED' | 'RATE_WAIT_TIMEOUT';

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = (code: ErrorCode | string, message: string): Result<never> => ({ ok: false, error: { code, message } });

export type Account = 'paper' | 'real';
export type Band = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
export type RuleStatus = 'hit' | 'clear' | 'unknown';
export type Side = 'buy' | 'sell';

export interface Filters {
  ageMaxMin: number | null; minLiquidityUsd: number; bands: Band[]; minCompleteness: number;
  dexes: string[] | null; watchlistOnly: boolean; hideLowData: boolean; alertsOnly: boolean; search: string;
}
export interface SortSpec { col: string; dir: 'asc' | 'desc' }

export interface Token {
  id: number; mint: string; symbol: string; name: string; decimals: number | null; supply: number | null;
  creatorWallet: string | null; creatorDerivedAt: number | null;
  mintAuthority: string | null; freezeAuthority: string | null; authoritiesCheckedAt: number | null;
  firstSeenAt: number;
}
export interface Pool {
  id: number; address: string; tokenId: number; quoteMint: string | null; quoteSymbol: string | null; dex: string | null;
  createdAtChain: number; firstSeenAt: number; source: string; tier: 1 | 2;
  trackedSince: number | null; trackedUntil: number | null; lastSnapshotAt: number | null;
}
export interface Snapshot {
  id?: number; poolId: number; observedAt: number;
  priceUsd: number | null; liquidityUsd: number | null; fdvUsd: number | null; mcapUsd: number | null;
  volM5: number | null; volH1: number | null; volH24: number | null;
  buysM5: number | null; sellsM5: number | null; buyersM5: number | null; sellersM5: number | null;
  buysH1: number | null; sellsH1: number | null; buyersH1: number | null; sellersH1: number | null;
  chgM5: number | null; chgH1: number | null; source: string;
}
export interface Trade {
  id?: number; poolId: number; txSig: string; blockTime: number; slot: number | null; side: Side;
  wallet: string; usdValue: number | null; tokenAmount: number | null; priceUsd: number | null; observedAt: number;
}
export type HolderClass = 'wallet' | 'program' | 'burn';
export interface HolderRow { address: string; owner: string; pct: number; class: HolderClass }
export interface HolderSnapshot {
  id?: number; tokenId: number; observedAt: number; supply: number | null;
  top1Pct: number | null; top10Pct: number | null; programsPct: number | null; burnedPct: number | null; rows: HolderRow[];
}
export interface RuleResult { ruleId: string; status: RuleStatus; points: number; evidence: Record<string, unknown> }
export interface Judgement {
  score: number; band: Band; completeness: number; results: RuleResult[]; inputsHash: string; rulesVersion: string;
}
export interface StoredJudgement extends Judgement { id: number; tokenId: number; poolId: number; computedAt: number }

export interface LaunchRow {
  tokenId: number; poolId: number; symbol: string; name: string; mint: string; dex: string | null;
  createdAtChain: number; firstSeenAt: number; late: boolean;
  priceUsd: number | null; liquidityUsd: number | null; fdvUsd: number | null; volH1: number | null;
  buysM5: number | null; sellsM5: number | null; buyersH1: number | null; chgM5: number | null;
  score: number | null; band: string | null; completeness: number | null; hitRuleIds: string[];
  watchlisted: boolean; tier: 1 | 2;
}
export interface TokenDetail {
  token: Token; pool: Pool; latest: Snapshot | null; judgement: (StoredJudgement) | null; watchlisted: boolean;
}
export interface WatchRow extends LaunchRow { note: string; addedAt: number }
export interface AlertRow { id: number; tokenId: number; judgementId: number | null; createdAt: number; kind: string; text: string; seen: boolean; symbol?: string }
export interface Gap { id: number; source: string; startAt: number; endAt: number; reason: string; resolved: boolean }
export interface ErrorRow { id: number; at: number; source: string; code: string; message: string }
export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

export interface RiskState {
  account: Account; active: boolean; pausedReason: null | 'drawdown' | 'daily_losses';
  maxPositionUsd: number; openCount: number; maxOpen: number; drawdownPct: number; losingToday: number;
  canAck: boolean; pendingLimits: { key: string; value: unknown; effectiveAt: number }[];
  equity: number; peak: number;
}
export interface CreateDecisionInput {
  account: Account; tokenId: number; poolId: number; sizeUsd: number; stopRule: string; targetRule: string;
  thesis: string; acknowledgedFlags: true;
}
export type DecisionStatus = 'pending' | 'open' | 'closed' | 'cancelled' | 'expired';
export interface FillRow {
  id: number; decisionId: number; kind: 'entry' | 'exit'; occurredAt: number; priceUsd: number; tokenAmount: number;
  usdValue: number; feeUsd: number; slippagePct: number | null; source: 'manual' | 'wallet' | 'paper_sim';
  txSig: string | null; note: string; voided: boolean;
}
export interface DecisionRow {
  id: number; account: Account; tokenId: number; poolId: number; createdAt: number; sizeUsd: number;
  plannedEntryPrice: number | null; stopRule: string; targetRule: string; thesis: string; judgementId: number;
  equityBefore: number; symbol: string; mint: string; score: number; band: string; completeness: number;
  status: DecisionStatus; entry: FillRow | null; exit: FillRow | null; pnlUsd: number | null; pnlPct: number | null;
  notes: { id: number; createdAt: number; kind: string; text: string }[];
}
export interface EquityPoint { at: number; equity: number; kind: string; note: string }
export interface UnlinkedTrade {
  id: number; txSig: string; blockTime: number; mint: string; side: Side; tokenAmount: number; solAmount: number;
  usdValue: number | null; feeSol: number; linkedFillId: number | null; dismissed: boolean; symbol?: string | null;
  suggestedDecisionId?: number | null;
}
export type SourceState = 'LIVE' | 'DELAYED' | 'STALE' | 'OFFLINE';
export interface SourceStatus { source: 'geckoterminal' | 'rpc'; state: SourceState; lastOkAt: number | null; ageSec: number | null; callsToday: number; errorsToday: number }
export interface LabParams {
  configId: number | null; alertRule: { maxScore: number; minCompleteness: number; minLiquidityUsd: number; minBuyersH1: number; minAgeMin: number; maxAgeMin: number };
  sizeUsd: number; horizonsMin: number[]; feePctPerSide: number; networkFeeUsd: number; fromTs: number; toTs: number;
  seed: number; missingMode: 'conservative' | 'optimistic';
}
export interface LabStats {
  n: number; meanReturn: number | null; medianReturn: number | null; p10: number | null; worst: number | null;
  winRate: number | null; ruggedRate: number | null; unknownRate: number | null; ci: [number, number] | null;
  unknownCount: number; histogram: number[];
}
export interface LabResult {
  verdict: 'EDGE NOT PROVEN' | 'EDGE SIGNAL (needs forward paper test)';
  sets: Record<'alerts' | 'all' | 'random', Record<string, { conservative: LabStats; optimistic: LabStats }>>;
  diffCi240: [number, number] | null; nAlerts: number;
  quality: { excludedForGaps: number; fewSnapshots: number; candidates: number; mostUnknownRules: { ruleId: string; count: number }[] };
  params: LabParams;
}
export interface FrozenConfig { id: number; name: string; configJson: string; sha256: string; frozenAt: number }
