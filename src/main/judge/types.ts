import type { Snapshot, Trade, HolderSnapshot, RuleResult } from '../../shared/types';

export interface JudgeInput {
  now: number;
  token: { id: number; mint: string; creatorWallet: string | null; mintAuthority: string | null; freezeAuthority: string | null; authoritiesCheckedAt: number | null };
  pool: { id: number; createdAtChain: number; firstSeenAt: number };
  latest: Snapshot | null;
  history: Snapshot[];
  trades: Trade[] | null;
  holders: HolderSnapshot | null;
  creatorPriorTokens: { tokenId: number; maxLiqUsd: number | null; liqAt24hUsd: number | null; ageMs: number }[] | null;
  earlyBuyerFunders: { wallet: string; funder: string | null }[] | null;
  positionUsd: number;
  costs: { feePctPerSide: number; networkFeeUsd: number };
}
export type RuleFn<C> = (input: JudgeInput, cfg: C) => RuleResult;
export const unknown = (ruleId: string, why: string, extra: Record<string, unknown> = {}): RuleResult =>
  ({ ruleId, status: 'unknown', points: 0, evidence: { reason: why, ...extra } });
export const mk = (ruleId: string, hit: boolean, points: number, evidence: Record<string, unknown>): RuleResult =>
  ({ ruleId, status: hit ? 'hit' : 'clear', points: hit ? points : 0, evidence });
