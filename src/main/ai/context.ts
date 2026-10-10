// docs/06 §6.6 — the ONLY data sent to the model. Never mint/pool/wallet addresses, journal data, equity, keys, paths.
import type { Db } from '../db/open';
import { getToken } from '../db/queries/tokens';
import { getPoolForToken } from '../db/queries/pools';
import { latestSnapshot } from '../db/queries/snapshots';
import { latestJudgement } from '../db/queries/judgements';
import { exitImpact } from '../judge/exitImpact';
import { sanitizeName } from './sanitize';

const r = (v: unknown, d = 1): number | null => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/** Human-readable evidence built ONLY from numeric evidence fields (raw evidence can contain addresses). */
export function evidenceText(ruleId: string, e: Record<string, unknown>): string {
  switch (ruleId) {
    case 'R01_MINT_AUTH': return 'the mint authority is still active';
    case 'R02_FREEZE_AUTH': return 'the freeze authority is still active';
    case 'R03_TOP1_HOLDER': return `the largest wallet holds ${r(e.top1_pct)}% of supply`;
    case 'R04_TOP10_HOLDERS': return `top 10 wallets hold ${r(e.top10_pct)}%`;
    case 'R05_CREATOR_SERIAL': return `the creator launched ${e.priorTokens} other tokens recently and ${e.dumped} lost most liquidity`;
    case 'R06_EARLY_SYNC': return `${e.maxDistinctBuyersInWindow} different wallets bought within ${e.windowSec} seconds of launch`;
    case 'R07_SHARED_FUNDER': return `${e.maxSharedFunderCount} early buyers share a funding source`;
    case 'R08_EXIT_IMPACT': return `selling a ${r(e.positionUsd, 0)} dollar position would move the price about ${r(Number(e.impact) * 100)}%`;
    case 'R09_LOW_LIQ': return `liquidity is only ${r(e.liquidityUsd, 0)} dollars`;
    case 'R10_LIQ_DROP': return `liquidity fell ${r(e.dropPct, 0)}% from its peak`;
    case 'R11_THIN_CROWD': return `${r(e.buyers_h1, 0)} buyers in the last hour but ${r(e.vol_h1, 0)} dollars of volume`;
    default: return 'a rule was triggered';
  }
}

export interface AiContext {
  symbol: string; name: string; ageMinutes: number | null; priceUsd: number | null; liquidityUsd: number | null; fdvUsd: number | null; volH1Usd: number | null;
  buyersH1: number | null; sellersH1: number | null;
  risk: { score: number; band: string; completenessPct: number; hits: { rule: string; points: number; evidence: string }[]; unknown: string[] };
  exitEstimate: { sizeUsd: number; impactPct: number | null };
  dataNotes: string[];
}

export function buildAiContext(db: Db, tokenId: number, now: number, positionUsd: number): { ctx: AiContext; dataHash: string } | null {
  const tok = getToken(db, tokenId); const pool = getPoolForToken(db, tokenId);
  const j = latestJudgement(db, tokenId);
  if (!tok || !pool || !j) return null;
  const s = latestSnapshot(db, pool.id);
  const impact = exitImpact(positionUsd, s?.liquidityUsd ?? null);
  const unknown = j.results.filter((x) => x.status === 'unknown').map((x) => x.ruleId);
  const notes = ['Trades older than 24h unavailable'];
  if (j.completeness < 0.5) notes.push('Many risk checks could not run yet');
  const ctx: AiContext = {
    symbol: sanitizeName(tok.symbol), name: sanitizeName(tok.name), ageMinutes: Math.max(0, Math.round((now - pool.createdAtChain) / 60_000)),
    priceUsd: s?.priceUsd ?? null, liquidityUsd: s?.liquidityUsd ?? null, fdvUsd: s?.fdvUsd ?? null, volH1Usd: s?.volH1 ?? null, buyersH1: s?.buyersH1 ?? null, sellersH1: s?.sellersH1 ?? null,
    risk: {
      score: j.score, band: j.band, completenessPct: Math.round(j.completeness * 100),
      hits: j.results.filter((x) => x.status === 'hit').map((x) => ({ rule: x.ruleId, points: x.points, evidence: evidenceText(x.ruleId, x.evidence) })), unknown,
    },
    exitEstimate: { sizeUsd: positionUsd, impactPct: impact === null ? null : r(impact * 100) },
    dataNotes: notes,
  };
  return { ctx, dataHash: `${j.inputsHash}:${j.band}` };
}
