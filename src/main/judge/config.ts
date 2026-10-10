// docs/04 §4.3 — rule config loaded + validated with zod (strict: missing/extra keys rejected).
import { z } from 'zod';
import raw from './rules_v1.json?raw';

const en = { enabled: z.boolean(), points: z.number().int().min(0).max(100) };
const tiersAbove = z.array(z.object({ above: z.number(), points: z.number().int().min(0) })).min(1);
const tiersBelow = z.array(z.object({ below: z.number(), points: z.number().int().min(0) })).min(1);

export const RuleConfigSchema = z.object({
  version: z.string().min(1),
  rules: z.object({
    R01_MINT_AUTH: z.object(en).strict(),
    R02_FREEZE_AUTH: z.object(en).strict(),
    R03_TOP1_HOLDER: z.object({ ...en, thresholdPct: z.number() }).strict(),
    R04_TOP10_HOLDERS: z.object({ ...en, thresholdPct: z.number() }).strict(),
    R05_CREATOR_SERIAL: z.object({ ...en, lookbackDays: z.number(), minPriorTokens: z.number(), minDumped: z.number(), dumpFraction: z.number(), minPeakLiqUsd: z.number() }).strict(),
    R06_EARLY_SYNC: z.object({ ...en, windowSec: z.number(), minWallets: z.number(), earlySec: z.number(), maxFirstTradeDelaySec: z.number() }).strict(),
    R07_SHARED_FUNDER: z.object({ ...en, minShared: z.number(), sample: z.number() }).strict(),
    R08_EXIT_IMPACT: z.object({ enabled: z.boolean(), tiers: tiersAbove }).strict(),
    R09_LOW_LIQ: z.object({ enabled: z.boolean(), tiers: tiersBelow }).strict(),
    R10_LIQ_DROP: z.object({ ...en, dropFraction: z.number(), minPeakUsd: z.number(), minSnapshots: z.number() }).strict(),
    R11_THIN_CROWD: z.object({ ...en, maxBuyersH1: z.number(), minVolH1: z.number() }).strict(),
  }).strict(),
  bands: z.object({ LOW: z.number(), MEDIUM: z.number(), HIGH: z.number() }).strict(),
}).strict();

export type RuleConfig = z.infer<typeof RuleConfigSchema>;
export type RuleId = keyof RuleConfig['rules'];
export const RULE_IDS = Object.keys(RuleConfigSchema.shape.rules.shape) as RuleId[];

export function parseRuleConfig(json: unknown): RuleConfig { return RuleConfigSchema.parse(json); }
export function loadDefaultConfig(): RuleConfig { return parseRuleConfig(JSON.parse(raw)); }
