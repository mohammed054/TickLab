// docs/04 §4.6 — replay the alert rule over history using ONLY data that existed at each time.
import type { Db } from '../db/open';
import type { LabParams, LabResult, Snapshot } from '../../shared/types';
import type { RuleConfig } from '../judge/config';
import { evaluate } from '../judge/engine';
import { buildJudgeInput } from '../judge/inputs';
import { alertRulePasses, type AlertRule } from '../judge/alerts';
import { snapshotHistory } from '../db/queries/snapshots';
import { allGaps, isInGap } from '../db/queries/gaps';
import { mulberry32 } from './prng';
import { computeStats, verdict, valuesFor, bootstrapDiffCi, bootstrapMeanCi, type Outcome } from './stats';

const MIN = 60_000, TEN_MIN = 10 * MIN;
interface Cand { tokenId: number; poolId: number; created: number; snaps: Snapshot[] }
interface Entry { cand: Cand; idx: number; T: number; L: number; p: number }

export function entryTokens(S: number, L: number, p: number, feePct: number, netFee: number): number {
  const impactIn = S / (L / 2 + S);
  return ((S * (1 - feePct / 100) - netFee) * (1 - impactIn)) / p;
}

/** Outcome at horizon H (docs/04 §4.6 step 4). Pure. */
export function outcomeAt(e: Entry, tokens: number, H: number, P: LabParams): Outcome {
  const snaps = e.cand.snaps; const end = e.T + H * MIN;
  let exit: Snapshot | null = null; let rugged = false;
  for (let i = e.idx + 1; i < snaps.length && snaps[i].observedAt <= end; i++) {
    const L = snaps[i].liquidityUsd;
    if (L !== null && L <= 0.2 * e.L) { exit = snaps[i]; rugged = true; break; }
  }
  if (!exit) {
    let best: Snapshot | null = null;
    for (let i = e.idx + 1; i < snaps.length; i++) {
      const d = Math.abs(snaps[i].observedAt - end);
      if (d <= TEN_MIN && (best === null || d < Math.abs(best.observedAt - end))) best = snaps[i];
      if (snaps[i].observedAt > end + TEN_MIN) break;
    }
    exit = best;
  }
  if (!exit || exit.priceUsd === null || exit.liquidityUsd === null || exit.liquidityUsd <= 0) return { returnPct: null, rugged };
  const vb = tokens * exit.priceUsd;
  const impactOut = vb / (exit.liquidityUsd / 2 + vb);
  const value = vb * (1 - impactOut) * (1 - P.feePctPerSide / 100) - P.networkFeeUsd;
  return { returnPct: ((value - P.sizeUsd) / P.sizeUsd) * 100, rugged };
}

export function runLab(db: Db, P: LabParams, rules: RuleConfig, defaults: { positionUsd: number }): LabResult {
  const gaps = allGaps(db);
  const pools = db.prepare('SELECT id, token_id, created_at_chain FROM pools WHERE created_at_chain>=? AND created_at_chain<=? ORDER BY id').all(P.fromTs, P.toTs) as { id: number; token_id: number; created_at_chain: number }[];
  let excludedForGaps = 0, fewSnapshots = 0;
  const cands: Cand[] = [];
  for (const p of pools) {
    if (isInGap(gaps, p.created_at_chain)) { excludedForGaps++; continue; }
    const snaps = snapshotHistory(db, p.id);
    if (snaps.length < 3) { fewSnapshots++; continue; }
    cands.push({ tokenId: p.token_id, poolId: p.id, created: p.created_at_chain, snaps });
  }
  const costs = { feePctPerSide: P.feePctPerSide, networkFeeUsd: P.networkFeeUsd };
  const facts = (c: Cand, s: Snapshot) => ({ liquidityUsd: s.liquidityUsd, buyersH1: s.buyersH1, ageMin: (s.observedAt - c.created) / MIN });
  const allRule: AlertRule = { ...P.alertRule, maxScore: 100, minCompleteness: 0 };
  const unknownCount = new Map<string, number>();
  const alertEntries: Entry[] = [], allEntries: Entry[] = [];
  const usable = (s: Snapshot): s is Snapshot & { priceUsd: number; liquidityUsd: number } => s.priceUsd !== null && s.priceUsd > 0 && s.liquidityUsd !== null && s.liquidityUsd > 0;

  for (const c of cands) {
    let allDone = false, alertDone = false;
    for (let i = 0; i < c.snaps.length && !(allDone && alertDone); i++) {
      const s = c.snaps[i]; if (!usable(s)) continue;
      const f = facts(c, s);
      // Cheap pre-filter: the baseline-ALL rule is exactly the non-score conditions.
      if (!alertRulePasses(allRule, { score: 0, completeness: 1, ...f })) continue;
      const entry: Entry = { cand: c, idx: i, T: s.observedAt, L: s.liquidityUsd, p: s.priceUsd };
      if (!allDone) { allEntries.push(entry); allDone = true; }
      if (!alertDone) {
        const input = buildJudgeInput(db, c.tokenId, c.poolId, s.observedAt, { positionUsd: defaults.positionUsd, costs, asOf: s.observedAt });
        if (!input) continue;
        const j = evaluate(input, rules);
        if (alertRulePasses(P.alertRule, { score: j.score, completeness: j.completeness, ...f })) {
          alertEntries.push(entry); alertDone = true;
          for (const r of j.results) if (r.status === 'unknown') unknownCount.set(r.ruleId, (unknownCount.get(r.ruleId) ?? 0) + 1);
        }
      }
    }
  }

  // Baseline RANDOM: for each alert entry pick another candidate + random snapshot satisfying age/liquidity only.
  const rnd = mulberry32(P.seed); const randomEntries: Entry[] = [];
  const ageLiq = (c: Cand, s: Snapshot) => usable(s) && s.liquidityUsd >= P.alertRule.minLiquidityUsd && (s.observedAt - c.created) / MIN >= P.alertRule.minAgeMin && (s.observedAt - c.created) / MIN <= P.alertRule.maxAgeMin;
  for (const a of alertEntries) {
    const pool = cands.filter((c) => c.poolId !== a.cand.poolId);
    for (let tries = 0; tries < 50 && pool.length; tries++) {
      const c = pool[Math.floor(rnd() * pool.length)];
      const ok = c.snaps.map((s, i) => ({ s, i })).filter(({ s }) => ageLiq(c, s));
      if (!ok.length) continue;
      const pick = ok[Math.floor(rnd() * ok.length)];
      randomEntries.push({ cand: c, idx: pick.i, T: pick.s.observedAt, L: pick.s.liquidityUsd as number, p: pick.s.priceUsd as number });
      break;
    }
  }

  const outcomesFor = (entries: Entry[], H: number): Outcome[] => entries.map((e) => outcomeAt(e, entryTokens(P.sizeUsd, e.L, e.p, P.feePctPerSide, P.networkFeeUsd), H, P));
  const sets: LabResult['sets'] = { alerts: {}, all: {}, random: {} };
  const outs: Record<string, Record<string, Outcome[]>> = { alerts: {}, all: {}, random: {} };
  for (const [name, entries] of [['alerts', alertEntries], ['all', allEntries], ['random', randomEntries]] as const) {
    for (const H of P.horizonsMin) {
      const o = outcomesFor(entries, H); outs[name][String(H)] = o;
      sets[name][String(H)] = { conservative: computeStats(o, 'conservative', P.seed), optimistic: computeStats(o, 'optimistic', P.seed) };
    }
  }
  const key = '240';
  let diffCi: [number, number] | null = null;
  if (outs.alerts[key] && outs.all[key]) diffCi = bootstrapDiffCi(valuesFor(outs.alerts[key], 'conservative'), valuesFor(outs.all[key], 'conservative'), P.seed);
  const aCi = outs.alerts[key] ? bootstrapMeanCi(valuesFor(outs.alerts[key], 'conservative'), P.seed) : null;
  return {
    verdict: verdict(alertEntries.length, aCi, diffCi), sets, diffCi240: diffCi, nAlerts: alertEntries.length, params: P,
    quality: { excludedForGaps, fewSnapshots, candidates: cands.length, mostUnknownRules: [...unknownCount].map(([ruleId, count]) => ({ ruleId, count })).sort((a, b) => b.count - a.count).slice(0, 5) },
  };
}
