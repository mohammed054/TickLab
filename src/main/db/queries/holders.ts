import type { Db } from '../open';
import type { HolderSnapshot, HolderRow } from '../../../shared/types';

interface R { id: number; token_id: number; observed_at: number; supply: number | null; top1_pct: number | null; top10_pct: number | null; programs_pct: number | null; burned_pct: number | null; rows_json: string }
const map = (r: R): HolderSnapshot => ({ id: r.id, tokenId: r.token_id, observedAt: r.observed_at, supply: r.supply, top1Pct: r.top1_pct, top10Pct: r.top10_pct, programsPct: r.programs_pct, burnedPct: r.burned_pct, rows: JSON.parse(r.rows_json) as HolderRow[] });
export function insertHolders(db: Db, h: HolderSnapshot): number {
  return Number(db.prepare('INSERT INTO holder_snapshots(token_id,observed_at,supply,top1_pct,top10_pct,programs_pct,burned_pct,rows_json) VALUES(?,?,?,?,?,?,?,?)').run(h.tokenId, h.observedAt, h.supply, h.top1Pct, h.top10Pct, h.programsPct, h.burnedPct, JSON.stringify(h.rows)).lastInsertRowid);
}
/** Latest holders row observed at or before `upTo` (omit for the newest). */
export function latestHolders(db: Db, tokenId: number, upTo?: number): HolderSnapshot | null {
  const r = (upTo === undefined
    ? db.prepare('SELECT * FROM holder_snapshots WHERE token_id=? ORDER BY observed_at DESC, id DESC LIMIT 1').get(tokenId)
    : db.prepare('SELECT * FROM holder_snapshots WHERE token_id=? AND observed_at<=? ORDER BY observed_at DESC, id DESC LIMIT 1').get(tokenId, upTo)) as R | undefined;
  return r ? map(r) : null;
}
