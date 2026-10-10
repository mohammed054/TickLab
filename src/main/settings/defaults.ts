// docs/01 §1.7 — default settings. Fee/slippage numbers are ASSUMPTIONS until measured from real fills.
export const DEFAULT_SETTINGS = {
  'sources.gt.enabled': true,
  'sources.gt.callsPerMinuteCap': 24,
  'sources.gt.discoveryIntervalSec': 15,
  'sources.rpc.url': 'https://api.mainnet-beta.solana.com',
  'sources.rpc.creditCost': { default: 1 } as Record<string, number>,
  'sources.rpc.monthlyCreditBudget': 1_000_000,
  'track.minLiquidityUsd': 3000,
  'track.minTx5m': 10,
  'track.maxAgeMinForEntry': 30,
  'track.durationHours': 24,
  'backfill.maxPages': 10,
  'backfill.maxClosedHours': 6,
  'retention.snapshotDays': 30,
  'retention.tradeDays': 30,
  'judge.rulesVersion': 'rules_v1',
  'judge.defaultPositionUsd': 10,
  'costs.tradeFeePctPerSide': 1.0,
  'costs.networkFeeUsdPerTx': 0.1,
  'alerts.enabled': true,
  'alerts.maxScore': 30,
  'alerts.minCompleteness': 0.6,
  'alerts.minLiquidityUsd': 5000,
  'alerts.minBuyersH1': 20,
  'alerts.minAgeMin': 5,
  'alerts.maxAgeMin': 120,
  'journal.startEquityUsd': 200,
  'risk.maxPositionPct': 5,
  'risk.maxOpenPositions': 3,
  'risk.maxDrawdownPct': 25,
  'risk.maxLosingTradesPerDay': 3,
  'risk.loosenCooldownHours': 24,
  'ai.enabled': true,
  'ai.models': [] as string[],
  'ai.dailyLimit': 50,
  'wallet.address': null as string | null,
  'wallet.solUsdPool': null as string | null,
  'ui.feedMaxRows': 5000,
  'window.feed': null as unknown,
  'window.detail': null as unknown,
  'app.firstRunDone': false,
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

/** risk.* keys where a higher value means looser limits (docs/06 §6.3). */
export const LOOSEN_UP_KEYS: SettingKey[] = ['risk.maxPositionPct', 'risk.maxOpenPositions', 'risk.maxDrawdownPct', 'risk.maxLosingTradesPerDay'];
/** Lowering the cooldown is itself a loosening of the protection, so it is also delayed (assumption, see QUESTIONS.md). */
export const LOOSEN_DOWN_KEYS: SettingKey[] = ['risk.loosenCooldownHours'];
