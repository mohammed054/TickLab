// docs/04 §4.2 — constant-product approximation (50/50 pool). The UI must label it "estimate".
export function exitImpact(sizeUsd: number, liquidityUsd: number | null): number | null {
  if (liquidityUsd === null || !Number.isFinite(liquidityUsd) || liquidityUsd <= 0) return null;
  return sizeUsd / (liquidityUsd / 2 + sizeUsd);
}
export function estimateExit(sizeUsd: number, liquidityUsd: number | null, feePctPerSide: number, networkFeeUsd: number): { impactPct: number; receivedUsd: number } | null {
  const impact = exitImpact(sizeUsd, liquidityUsd);
  if (impact === null) return null;
  return { impactPct: impact * 100, receivedUsd: sizeUsd * (1 - impact) * (1 - feePctPerSide / 100) - networkFeeUsd };
}
