// docs/04 §4.6 step 7 — per-set stats, histogram, seeded bootstrap CIs.
import type { LabStats } from '../../shared/types';
import { mulberry32 } from './prng';

export interface Outcome { returnPct: number | null; rugged: boolean }   // returnPct null = UNKNOWN
export const HIST_BINS = 40, HIST_MIN = -100, HIST_MAX = 300, BOOT_N = 2000, MIN_N_FOR_EDGE = 200;

const mean = (a: number[]): number | null => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = (a: number[]): number | null => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a: number[], p: number): number | null => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };

/** Values used for a mode: conservative maps UNKNOWN to -100, optimistic drops them. */
export function valuesFor(o: Outcome[], mode: 'conservative' | 'optimistic'): number[] {
  const out: number[] = [];
  for (const x of o) { if (x.returnPct !== null) out.push(x.returnPct); else if (mode === 'conservative') out.push(-100); }
  return out;
}

export function histogram(vals: number[]): number[] {
  const bins = new Array<number>(HIST_BINS).fill(0);
  const w = (HIST_MAX - HIST_MIN) / HIST_BINS;
  for (const v of vals) bins[Math.min(HIST_BINS - 1, Math.max(0, Math.floor((v - HIST_MIN) / w)))]++;
  return bins;
}

export function bootstrapMeanCi(vals: number[], seed: number, n = BOOT_N): [number, number] | null {
  if (!vals.length) return null;
  const rnd = mulberry32(seed); const means: number[] = [];
  for (let b = 0; b < n; b++) { let s = 0; for (let i = 0; i < vals.length; i++) s += vals[Math.floor(rnd() * vals.length)]; means.push(s / vals.length); }
  means.sort((x, y) => x - y);
  return [means[Math.floor(0.025 * n)], means[Math.min(n - 1, Math.floor(0.975 * n))]];
}
/** CI of mean(a) - mean(b), independent resamples from one seeded stream. */
export function bootstrapDiffCi(a: number[], b: number[], seed: number, n = BOOT_N): [number, number] | null {
  if (!a.length || !b.length) return null;
  const rnd = mulberry32(seed); const diffs: number[] = [];
  for (let k = 0; k < n; k++) {
    let sa = 0, sb = 0;
    for (let i = 0; i < a.length; i++) sa += a[Math.floor(rnd() * a.length)];
    for (let i = 0; i < b.length; i++) sb += b[Math.floor(rnd() * b.length)];
    diffs.push(sa / a.length - sb / b.length);
  }
  diffs.sort((x, y) => x - y);
  return [diffs[Math.floor(0.025 * n)], diffs[Math.min(n - 1, Math.floor(0.975 * n))]];
}

export function computeStats(outcomes: Outcome[], mode: 'conservative' | 'optimistic', seed: number): LabStats {
  const vals = valuesFor(outcomes, mode);
  const unknown = outcomes.filter((o) => o.returnPct === null).length;
  return {
    n: vals.length, meanReturn: mean(vals), medianReturn: median(vals), p10: pct(vals, 0.1), worst: vals.length ? Math.min(...vals) : null,
    winRate: vals.length ? vals.filter((v) => v > 0).length / vals.length : null,
    ruggedRate: outcomes.length ? outcomes.filter((o) => o.rugged).length / outcomes.length : null,
    unknownRate: outcomes.length ? unknown / outcomes.length : null, unknownCount: unknown,
    ci: bootstrapMeanCi(vals, seed), histogram: histogram(vals),
  };
}

export type Verdict = 'EDGE NOT PROVEN' | 'EDGE SIGNAL (needs forward paper test)';
/** Only these two strings are ever returned. */
export function verdict(nAlerts: number, alertCi: [number, number] | null, diffCi: [number, number] | null): Verdict {
  return nAlerts >= MIN_N_FOR_EDGE && alertCi !== null && alertCi[0] > 0 && diffCi !== null && diffCi[0] > 0 ? 'EDGE SIGNAL (needs forward paper test)' : 'EDGE NOT PROVEN';
}
