// docs/05 §5.6 / 06 §6.2 — Filters -> SQL. NULL-safe sorting (nulls last).
import type { Db } from '../open';
import type { Filters, SortSpec, LaunchRow, WatchRow } from '../../../shared/types';
import { LATE_MS } from '../../../shared/constants';

const SORT_SQL: Record<string, string> = {
  age: 'p.created_at_chain', token: 'LOWER(t.symbol)', dex: 'LOWER(p.dex)', risk: 'j.score', data: 'j.completeness',
  price: 's.price_usd', liq: 's.liquidity_usd', fdv: 's.fdv_usd', vol1h: 's.vol_h1',
  bs5m: '(s.buys_m5 + s.sells_m5)', buyers1h: 's.buyers_h1', chg5m: 's.chg_m5',
};
export const SORT_COLS = Object.keys(SORT_SQL);

const BASE = `FROM pools p JOIN tokens t ON t.id=p.token_id
  LEFT JOIN pool_snapshots s ON s.id=(SELECT id FROM pool_snapshots WHERE pool_id=p.id ORDER BY observed_at DESC, id DESC LIMIT 1)
  LEFT JOIN judgements j ON j.id=(SELECT id FROM judgements WHERE token_id=t.id ORDER BY computed_at DESC, id DESC LIMIT 1)
  LEFT JOIN watchlist w ON w.token_id=t.id`;
const COLS = `t.id token_id, p.id pool_id, t.symbol, t.name, t.mint, p.dex, p.created_at_chain, p.first_seen_at, p.tier,
  s.price_usd, s.liquidity_usd, s.fdv_usd, s.vol_h1, s.buys_m5, s.sells_m5, s.buyers_h1, s.chg_m5,
  j.id judgement_id, j.score, j.band, j.completeness, w.added_at w_added, w.note w_note`;

interface Raw { token_id: number; pool_id: number; symbol: string; name: string; mint: string; dex: string | null; created_at_chain: number; first_seen_at: number; tier: number; price_usd: number | null; liquidity_usd: number | null; fdv_usd: number | null; vol_h1: number | null; buys_m5: number | null; sells_m5: number | null; buyers_h1: number | null; chg_m5: number | null; judgement_id: number | null; score: number | null; band: string | null; completeness: number | null; w_added: number | null; w_note: string | null }

function toRow(r: Raw, hits: string[]): LaunchRow {
  return { tokenId: r.token_id, poolId: r.pool_id, symbol: r.symbol, name: r.name, mint: r.mint, dex: r.dex, createdAtChain: r.created_at_chain, firstSeenAt: r.first_seen_at,
    late: r.first_seen_at - r.created_at_chain > LATE_MS, priceUsd: r.price_usd, liquidityUsd: r.liquidity_usd, fdvUsd: r.fdv_usd, volH1: r.vol_h1,
    buysM5: r.buys_m5, sellsM5: r.sells_m5, buyersH1: r.buyers_h1, chgM5: r.chg_m5, score: r.score, band: r.band, completeness: r.completeness,
    hitRuleIds: hits, watchlisted: r.w_added !== null, tier: r.tier === 2 ? 2 : 1 };
}

function hitsFor(db: Db, ids: (number | null)[]): Map<number, string[]> {
  const m = new Map<number, string[]>();
  const uniq = [...new Set(ids.filter((i): i is number => i !== null))];
  for (let i = 0; i < uniq.length; i += 500) {
    const chunk = uniq.slice(i, i + 500);
    const rows = db.prepare(`SELECT judgement_id, rule_id FROM rule_results WHERE status='hit' AND judgement_id IN (${chunk.map(() => '?').join(',')}) ORDER BY points DESC, id`).all(...chunk) as { judgement_id: number; rule_id: string }[];
    for (const r of rows) { const a = m.get(r.judgement_id) ?? []; a.push(r.rule_id); m.set(r.judgement_id, a); }
  }
  return m;
}

export function buildWhere(f: Filters, now: number): { where: string; args: unknown[] } {
  const w: string[] = []; const a: unknown[] = [];
  if (f.ageMaxMin !== null) { w.push('(? - p.created_at_chain) <= ?'); a.push(now, f.ageMaxMin * 60_000); }
  if (f.minLiquidityUsd > 0) { w.push('s.liquidity_usd >= ?'); a.push(f.minLiquidityUsd); }
  if (f.bands.length < 4) {
    if (f.bands.length === 0) w.push('0');
    else { w.push(`j.band IN (${f.bands.map(() => '?').join(',')})`); a.push(...f.bands); }
  }
  if (f.minCompleteness > 0) { w.push('j.completeness >= ?'); a.push(f.minCompleteness - 1e-9); }
  if (f.dexes && f.dexes.length) { w.push(`p.dex IN (${f.dexes.map(() => '?').join(',')})`); a.push(...f.dexes); }
  if (f.watchlistOnly) w.push('w.token_id IS NOT NULL');
  if (f.hideLowData) w.push('j.completeness >= 0.5');
  if (f.alertsOnly) w.push("EXISTS (SELECT 1 FROM alerts al WHERE al.token_id=t.id AND al.kind='worth_a_look')");
  const q = f.search.trim();
  if (q) { w.push('(t.symbol LIKE ? ESCAPE \'\\\' OR t.name LIKE ? ESCAPE \'\\\' OR t.mint=? OR p.address=?)'); const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`; a.push(like, like, q, q); }
  return { where: w.length ? `WHERE ${w.join(' AND ')}` : '', args: a };
}

export function listLaunches(db: Db, f: Filters, sort: SortSpec, limit: number, now: number): LaunchRow[] {
  const { where, args } = buildWhere(f, now);
  const expr = SORT_SQL[sort.col] ?? SORT_SQL.age;
  let dir = sort.dir === 'desc' ? 'DESC' : 'ASC';
  if (expr === SORT_SQL.age) dir = dir === 'ASC' ? 'DESC' : 'ASC'; // age asc = newest first = created_at_chain desc
  const rows = db.prepare(`SELECT ${COLS} ${BASE} ${where} ORDER BY (${expr}) IS NULL, ${expr} ${dir}, p.id DESC LIMIT ?`).all(...args, limit) as Raw[];
  const hits = hitsFor(db, rows.map((r) => r.judgement_id));
  return rows.map((r) => toRow(r, (r.judgement_id !== null ? hits.get(r.judgement_id) : undefined) ?? []));
}

export function getLaunchRow(db: Db, tokenId: number): LaunchRow | null {
  const r = db.prepare(`SELECT ${COLS} ${BASE} WHERE t.id=? ORDER BY p.created_at_chain DESC LIMIT 1`).get(tokenId) as Raw | undefined;
  if (!r) return null;
  return toRow(r, r.judgement_id !== null ? (hitsFor(db, [r.judgement_id]).get(r.judgement_id) ?? []) : []);
}

export function listWatchlist(db: Db): WatchRow[] {
  const rows = db.prepare(`SELECT ${COLS} ${BASE} WHERE w.token_id IS NOT NULL ORDER BY w.added_at DESC`).all() as Raw[];
  const hits = hitsFor(db, rows.map((r) => r.judgement_id));
  return rows.map((r) => ({ ...toRow(r, (r.judgement_id !== null ? hits.get(r.judgement_id) : undefined) ?? []), note: r.w_note ?? '', addedAt: r.w_added ?? 0 }));
}
export const addWatch = (db: Db, tokenId: number, now: number): void => { db.prepare('INSERT OR IGNORE INTO watchlist(token_id,added_at) VALUES(?,?)').run(tokenId, now); };
export const removeWatch = (db: Db, tokenId: number): void => { db.prepare('DELETE FROM watchlist WHERE token_id=?').run(tokenId); };
export const setWatchNote = (db: Db, tokenId: number, note: string): void => { db.prepare('UPDATE watchlist SET note=? WHERE token_id=?').run(note.slice(0, 200), tokenId); };
export const isWatched = (db: Db, tokenId: number): boolean => Boolean(db.prepare('SELECT 1 FROM watchlist WHERE token_id=?').get(tokenId));
