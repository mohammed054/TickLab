// Builds a JudgeInput from the DB. `asOf` restricts every source to data that existed at that time (used by the Rules Lab: no look-ahead).
import type { Db } from '../db/open';
import type { Snapshot } from '../../shared/types';
import { getToken } from '../db/queries/tokens';
import { getPool } from '../db/queries/pools';
import { snapshotHistory } from '../db/queries/snapshots';
import { allTradesAsc } from '../db/queries/trades';
import { latestHolders } from '../db/queries/holders';
import type { JudgeInput } from './types';

export interface InputOpts { positionUsd: number; costs: { feePctPerSide: number; networkFeeUsd: number }; asOf?: number }

const H24 = 86_400_000;
function creatorPriors(db: Db, creator: string, selfTokenId: number, now: number): JudgeInput['creatorPriorTokens'] {
  const toks = db.prepare('SELECT t.id, MIN(p.created_at_chain) created FROM tokens t JOIN pools p ON p.token_id=t.id WHERE t.creator_wallet=? AND t.id<>? GROUP BY t.id').all(creator, selfTokenId) as { id: number; created: number }[];
  return toks.filter((t) => t.created <= now).map((t) => {
    const snaps = db.prepare('SELECT s.observed_at, s.liquidity_usd FROM pool_snapshots s JOIN pools p ON p.id=s.pool_id WHERE p.token_id=? AND s.observed_at<=? AND s.liquidity_usd IS NOT NULL ORDER BY s.observed_at').all(t.id, now) as { observed_at: number; liquidity_usd: number }[];
    const maxLiq = snaps.length ? Math.max(...snaps.map((s) => s.liquidity_usd)) : null;
    // Liquidity at ~24h: nearest snapshot within +-2h of created+24h, only if that time has already been observed.
    const target = t.created + H24;
    const near = snaps.filter((s) => Math.abs(s.observed_at - target) <= 2 * 3_600_000).sort((a, b) => Math.abs(a.observed_at - target) - Math.abs(b.observed_at - target))[0];
    return { tokenId: t.id, maxLiqUsd: maxLiq, liqAt24hUsd: near ? near.liquidity_usd : null, ageMs: now - t.created };
  });
}

export function buildJudgeInput(db: Db, tokenId: number, poolId: number, now: number, o: InputOpts): JudgeInput | null {
  const asOf = o.asOf ?? Number.MAX_SAFE_INTEGER;
  const tok = getToken(db, tokenId); const pool = getPool(db, poolId);
  if (!tok || !pool) return null;
  const history: Snapshot[] = snapshotHistory(db, poolId, asOf);
  const trades = allTradesAsc(db, poolId, asOf === Number.MAX_SAFE_INTEGER ? undefined : asOf).filter((t) => t.observedAt <= asOf);
  const checked = tok.authoritiesCheckedAt !== null && tok.authoritiesCheckedAt <= asOf;
  const creatorOk = tok.creatorWallet !== null && tok.creatorDerivedAt !== null && tok.creatorDerivedAt <= asOf;
  const links = db.prepare('SELECT wallet, funder FROM wallet_links WHERE token_id=? AND observed_at<=? ORDER BY id').all(tokenId, asOf) as { wallet: string; funder: string | null }[];
  return {
    now,
    token: { id: tok.id, mint: tok.mint, creatorWallet: creatorOk ? tok.creatorWallet : null, mintAuthority: checked ? tok.mintAuthority : null, freezeAuthority: checked ? tok.freezeAuthority : null, authoritiesCheckedAt: checked ? tok.authoritiesCheckedAt : null },
    pool: { id: pool.id, createdAtChain: pool.createdAtChain, firstSeenAt: pool.firstSeenAt },
    latest: history.length ? history[history.length - 1] : null, history,
    trades: trades.length ? trades : null,
    holders: latestHolders(db, tokenId, asOf === Number.MAX_SAFE_INTEGER ? undefined : asOf),
    creatorPriorTokens: creatorOk && tok.creatorWallet ? creatorPriors(db, tok.creatorWallet, tokenId, now) : null,
    earlyBuyerFunders: links.length ? links : null,
    positionUsd: o.positionUsd, costs: o.costs,
  };
}
