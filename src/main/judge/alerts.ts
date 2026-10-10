// docs/04 §4.5 — "worth a look", NEVER "buy".
import type { Db } from '../db/open';
import type { AlertRow, Judgement, StoredJudgement } from '../../shared/types';
import { insertAlert, hasAlert } from '../db/queries/alerts';
import { SettingsStore } from '../settings/store';

export interface AlertRule { maxScore: number; minCompleteness: number; minLiquidityUsd: number; minBuyersH1: number; minAgeMin: number; maxAgeMin: number }
export interface AlertFacts { score: number; completeness: number; liquidityUsd: number | null; buyersH1: number | null; ageMin: number }

/** Shared by the live alerts and the Rules Lab replay so both use the identical rule. */
export function alertRulePasses(r: AlertRule, f: AlertFacts): boolean {
  if (f.liquidityUsd === null || f.buyersH1 === null) return false;
  return f.score <= r.maxScore && f.completeness >= r.minCompleteness && f.liquidityUsd >= r.minLiquidityUsd && f.buyersH1 >= r.minBuyersH1 && f.ageMin >= r.minAgeMin && f.ageMin <= r.maxAgeMin;
}
export const alertRuleFromSettings = (s: SettingsStore): AlertRule => ({
  maxScore: s.get('alerts.maxScore'), minCompleteness: s.get('alerts.minCompleteness'), minLiquidityUsd: s.get('alerts.minLiquidityUsd'),
  minBuyersH1: s.get('alerts.minBuyersH1'), minAgeMin: s.get('alerts.minAgeMin'), maxAgeMin: s.get('alerts.maxAgeMin'),
});
export const worthALookText = (symbol: string, score: number, band: string, completeness: number): string =>
  `${symbol}: risk ${score} ${band}, data ${Math.round(completeness * 100)}%. Passed your filters. This is not advice.`;

export interface AlertCtx { db: Db; settings: SettingsStore; now: () => number }
export function evaluateAlerts(c: AlertCtx, tokenId: number, poolId: number, j: Judgement | StoredJudgement, judgementId: number | null,
  facts: { liquidityUsd: number | null; buyersH1: number | null; createdAtChain: number; symbol: string }): AlertRow[] {
  const out: AlertRow[] = [];
  const now = c.now();
  if (!c.settings.get('alerts.enabled')) return out;
  if (!hasAlert(c.db, tokenId, 'worth_a_look') && alertRulePasses(alertRuleFromSettings(c.settings), {
    score: j.score, completeness: j.completeness, liquidityUsd: facts.liquidityUsd, buyersH1: facts.buyersH1, ageMin: (now - facts.createdAtChain) / 60_000 })) {
    const a = insertAlert(c.db, { tokenId, judgementId, kind: 'worth_a_look', text: worthALookText(facts.symbol, j.score, j.band, j.completeness) }, now);
    if (a) out.push(a);
  }
  const r10 = j.results.find((r) => r.ruleId === 'R10_LIQ_DROP');
  if (r10?.status === 'hit' && !hasAlert(c.db, tokenId, 'liq_drop')) {
    const watched = c.db.prepare('SELECT 1 FROM watchlist WHERE token_id=?').get(tokenId);
    const open = c.db.prepare(`SELECT 1 FROM decisions d WHERE d.token_id=? AND EXISTS (SELECT 1 FROM v_fills_valid f WHERE f.decision_id=d.id AND f.kind='entry')
      AND NOT EXISTS (SELECT 1 FROM v_fills_valid f WHERE f.decision_id=d.id AND f.kind='exit') AND NOT EXISTS (SELECT 1 FROM decision_notes n WHERE n.decision_id=d.id AND n.kind='cancel')`).get(tokenId);
    if (watched || open) {
      const pct = Math.round(Number(r10.evidence.dropPct ?? 0));
      const a = insertAlert(c.db, { tokenId, judgementId, kind: 'liq_drop', text: `${facts.symbol}: liquidity fell ${pct}% from peak.` }, now);
      if (a) out.push(a);
    }
  }
  void poolId;
  return out;
}
