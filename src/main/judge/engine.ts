// docs/04 §4.1 — PURE evaluate(): no I/O, no clock, no randomness.
import { createHash } from 'node:crypto';
import type { Judgement, RuleResult, Band } from '../../shared/types';
import type { RuleConfig, RuleId } from './config';
import { RULE_IDS } from './config';
import type { JudgeInput } from './types';
import { R01 } from './rules/R01'; import { R02 } from './rules/R02'; import { R03 } from './rules/R03'; import { R04 } from './rules/R04';
import { R05 } from './rules/R05'; import { R06 } from './rules/R06'; import { R07 } from './rules/R07'; import { R08 } from './rules/R08';
import { R09 } from './rules/R09'; import { R10 } from './rules/R10'; import { R11 } from './rules/R11';

type Fn = (i: JudgeInput, c: never) => RuleResult;
const FNS: Record<RuleId, Fn> = { R01_MINT_AUTH: R01, R02_FREEZE_AUTH: R02, R03_TOP1_HOLDER: R03, R04_TOP10_HOLDERS: R04, R05_CREATOR_SERIAL: R05, R06_EARLY_SYNC: R06, R07_SHARED_FUNDER: R07, R08_EXIT_IMPACT: R08, R09_LOW_LIQ: R09, R10_LIQ_DROP: R10, R11_THIN_CROWD: R11 };

export function bandFor(score: number, bands: RuleConfig['bands']): Band {
  if (score <= bands.LOW) return 'LOW';
  if (score <= bands.MEDIUM) return 'MEDIUM';
  if (score <= bands.HIGH) return 'HIGH';
  return 'EXTREME';
}

/** Stable stringify (sorted keys) for hashing. */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
}

export function evaluate(input: JudgeInput, config: RuleConfig): Judgement {
  const results: RuleResult[] = [];
  for (const id of RULE_IDS) {
    const cfg = config.rules[id];
    if (!cfg.enabled) continue;
    results.push((FNS[id] as (i: JudgeInput, c: unknown) => RuleResult)(input, cfg));
  }
  const score = Math.min(100, results.reduce((s, r) => s + (r.status === 'hit' ? r.points : 0), 0));
  const known = results.filter((r) => r.status !== 'unknown').length;
  const completeness = results.length === 0 ? 0 : known / results.length;
  // Hash only the numbers the enabled rules actually read (their evidence + status), so unchanged data -> same hash.
  const inputsHash = createHash('sha256').update(stableJson(results.map((r) => [r.ruleId, r.status, r.points, r.evidence]))).digest('hex');
  return { score, band: bandFor(score, config.bands), completeness, results, inputsHash, rulesVersion: config.version };
}
