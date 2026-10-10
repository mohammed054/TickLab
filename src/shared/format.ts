// docs/05 §5.2 formatting. Pure, unit-tested.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DASH = '—';
const bad = (v: number | null | undefined): v is null | undefined => v === null || v === undefined || !Number.isFinite(v);

export function fmtPrice(v: number | null | undefined): string {
  if (bad(v)) return DASH;
  const a = Math.abs(v);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(4);
  if (a === 0) return '0.0000';
  const d = Math.min(12, 3 - Math.floor(Math.log10(a)));
  return v.toFixed(d);
}
export function fmtUsd(v: number | null | undefined): string {
  if (bad(v)) return DASH;
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  if (a >= 1) return `${s}$${a.toFixed(2)}`;
  return `${s}$${fmtPrice(a)}`;
}
export function fmtPct(v: number | null | undefined, signed = true): string {
  if (bad(v)) return DASH;
  const t = v.toFixed(1);
  if (!signed) return `${t}%`;
  return `${v > 0 ? '+' : ''}${t}%`;
}
export function pctColor(v: number | null | undefined): 'good' | 'bad' | 'neutral' {
  if (bad(v) || Number(v.toFixed(1)) === 0) return 'neutral';
  return v > 0 ? 'good' : 'bad';
}
export function fmtAge(ms: number | null | undefined): string {
  if (bad(ms)) return DASH;
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (s < 3600) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(s / 3600);
  if (s < 86400) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  const d = Math.floor(s / 86400);
  return `${d}d ${h % 24}h`;
}
export function fmtAddr(a: string | null | undefined): string {
  if (!a) return DASH;
  return a.length <= 9 ? a : `${a.slice(0, 4)}…${a.slice(-4)}`;
}
export function fmtCompleteness(x: number | null | undefined): string {
  if (bad(x)) return DASH;
  return `${Math.round(x * 100)}%`;
}
const p2 = (n: number) => String(n).padStart(2, '0');
export function fmtDate(ts: number | null | undefined, now: number = Date.now()): string {
  if (bad(ts)) return DASH;
  const d = new Date(ts), n = new Date(now);
  const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  if (d.toDateString() === n.toDateString()) return hm;
  return `${p2(d.getDate())} ${MON[d.getMonth()]} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export function fmtBytes(b: number | null | undefined): string {
  if (bad(b)) return DASH;
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  if (b >= 1e3) return `${Math.round(b / 1e3)} KB`;
  return `${b} B`;
}
export function fmtCount(v: number | null | undefined): string {
  if (bad(v)) return DASH;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`.replace('.0M', 'M');
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(Math.round(v));
}
