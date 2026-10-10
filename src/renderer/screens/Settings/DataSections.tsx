import { NumberSetting, Section, SecretField, TextSetting } from './fields';
import type { SettingsCtx } from './fields';

export function DataSourcesSection({ ctx }: { ctx: SettingsCtx }) {
  return (
    <Section title="Data sources" help="Read-only market data. Keys are stored encrypted on this computer and are never shown again.">
      <TextSetting ctx={ctx} k="sources.rpc.url" label="RPC URL" help="Solana JSON-RPC endpoint" />
      <SecretField name="rpcKey" label="RPC key" help="Optional. Added to requests by the app." />
      <NumberSetting ctx={ctx} k="sources.gt.callsPerMinuteCap" label="GeckoTerminal calls per minute cap" help="Free tier allows about 30; the default keeps a margin." integer min={1} />
      <NumberSetting ctx={ctx} k="sources.rpc.monthlyCreditBudget" label="RPC monthly credit budget" integer />
    </Section>
  );
}

export function TrackingSection({ ctx }: { ctx: SettingsCtx }) {
  return (
    <Section title="Tracking filter" help="Which new launches get periodic snapshots.">
      <NumberSetting ctx={ctx} k="track.minLiquidityUsd" label="Min liquidity (USD)" />
      <NumberSetting ctx={ctx} k="track.minTx5m" label="Min trades in 5 minutes" integer />
      <NumberSetting ctx={ctx} k="track.maxAgeMinForEntry" label="Max age to start tracking (min)" integer />
      <NumberSetting ctx={ctx} k="track.durationHours" label="Tracking duration (hours)" integer />
    </Section>
  );
}

export function AlertsSection({ ctx }: { ctx: SettingsCtx }) {
  return (
    <Section title="Alerts" help="An alert means a launch passed your filters. It is not advice.">
      <NumberSetting ctx={ctx} k="alerts.maxScore" label="Max risk score" integer />
      <NumberSetting ctx={ctx} k="alerts.minCompleteness" label="Min data completeness (0-1)" step="0.05" />
      <NumberSetting ctx={ctx} k="alerts.minLiquidityUsd" label="Min liquidity (USD)" />
      <NumberSetting ctx={ctx} k="alerts.minBuyersH1" label="Min buyers in 1 hour" integer />
      <NumberSetting ctx={ctx} k="alerts.minAgeMin" label="Min age (min)" integer />
      <NumberSetting ctx={ctx} k="alerts.maxAgeMin" label="Max age (min)" integer />
    </Section>
  );
}

export function CostsSection({ ctx }: { ctx: SettingsCtx }) {
  return (
    <Section title="Costs assumptions" help="Assumptions used for paper fills and the Rules Lab. Replace them with measured numbers from real fills.">
      <NumberSetting ctx={ctx} k="costs.tradeFeePctPerSide" label="Trade fee % per side" step="0.1" />
      <NumberSetting ctx={ctx} k="costs.networkFeeUsdPerTx" label="Network fee per transaction (USD)" step="0.01" />
      <NumberSetting ctx={ctx} k="judge.defaultPositionUsd" label="Default position size for estimates (USD)" />
    </Section>
  );
}
