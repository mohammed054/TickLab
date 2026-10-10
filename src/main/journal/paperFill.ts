// docs/06 §6.4 — paper simulation. Constant-product approximation; costs are ASSUMPTIONS from settings.
import type { Result, Snapshot } from '../../shared/types';
import { ok, err } from '../../shared/types';

export const FRESH_MS = 15 * 60_000;
export interface PaperCosts { feePctPerSide: number; networkFeeUsd: number }
export interface EntryFill { priceUsd: number; tokenAmount: number; usdValue: number; feeUsd: number; slippagePct: number }
export interface ExitFill { priceUsd: number; tokenAmount: number; usdValue: number; feeUsd: number; slippagePct: number }

export function simulateEntry(sizeUsd: number, snap: Snapshot | null, costs: PaperCosts, now: number): Result<EntryFill> {
  if (!snap || snap.priceUsd === null || snap.liquidityUsd === null || snap.priceUsd <= 0 || snap.liquidityUsd <= 0) return err('VALIDATION', 'No price/liquidity data for this token yet.');
  if (now - snap.observedAt > FRESH_MS) return err('VALIDATION', 'No fresh price. Try again or enter the fill manually.');
  const impact = sizeUsd / (snap.liquidityUsd / 2 + sizeUsd);
  const tokens = ((sizeUsd * (1 - costs.feePctPerSide / 100) - costs.networkFeeUsd) * (1 - impact)) / snap.priceUsd;
  return ok({ priceUsd: snap.priceUsd, tokenAmount: tokens, usdValue: sizeUsd, feeUsd: (sizeUsd * costs.feePctPerSide) / 100 + costs.networkFeeUsd, slippagePct: impact * 100 });
}

export function simulateExit(tokenAmount: number, snap: Snapshot | null, costs: PaperCosts, now: number): Result<ExitFill> {
  if (!snap || snap.priceUsd === null || snap.liquidityUsd === null || now - snap.observedAt > FRESH_MS) return err('VALIDATION', 'No fresh price. Try again or enter the exit manually.');
  const valueBefore = tokenAmount * snap.priceUsd;
  const impactOut = snap.liquidityUsd > 0 ? valueBefore / (snap.liquidityUsd / 2 + valueBefore) : 1;
  const usd = valueBefore * (1 - impactOut);
  return ok({ priceUsd: snap.priceUsd, tokenAmount, usdValue: usd, feeUsd: (usd * costs.feePctPerSide) / 100 + costs.networkFeeUsd, slippagePct: impactOut * 100 });
}
