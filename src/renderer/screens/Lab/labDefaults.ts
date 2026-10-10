import type { FrozenConfig, LabParams } from '@shared/types';

export const DAY = 86_400_000;
export const HORIZONS = [{ min: 60, label: '1h' }, { min: 240, label: '4h' }, { min: 1440, label: '24h' }];

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function defaultParams(s: Record<string, unknown> = {}, now = Date.now()): LabParams {
  return {
    configId: null,
    alertRule: {
      maxScore: num(s['alerts.maxScore'], 30), minCompleteness: num(s['alerts.minCompleteness'], 0.6), minLiquidityUsd: num(s['alerts.minLiquidityUsd'], 5000),
      minBuyersH1: num(s['alerts.minBuyersH1'], 20), minAgeMin: num(s['alerts.minAgeMin'], 5), maxAgeMin: num(s['alerts.maxAgeMin'], 120),
    },
    sizeUsd: num(s['judge.defaultPositionUsd'], 10), horizonsMin: [60, 240, 1440], feePctPerSide: num(s['costs.tradeFeePctPerSide'], 1),
    networkFeeUsd: num(s['costs.networkFeeUsdPerTx'], 0.1), fromTs: now - 7 * DAY, toTs: now, seed: 1, missingMode: 'conservative',
  };
}

/** Runtime guard for a frozen config's JSON (it may be `{params}` or the params themselves). */
export function parseFrozen(c: FrozenConfig): LabParams | null {
  try {
    const raw: unknown = JSON.parse(c.configJson);
    const o = (typeof raw === 'object' && raw !== null && 'params' in raw ? (raw as { params: unknown }).params : raw) as Partial<LabParams> | null;
    if (!o || typeof o !== 'object' || !o.alertRule || !Array.isArray(o.horizonsMin) || typeof o.sizeUsd !== 'number') return null;
    return { ...defaultParams(), ...o, configId: c.id } as LabParams;
  } catch { return null; }
}
