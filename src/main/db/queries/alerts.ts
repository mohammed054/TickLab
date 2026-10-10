import type { Db } from '../open';
import type { AlertRow } from '../../../shared/types';

interface R { id: number; token_id: number; judgement_id: number | null; created_at: number; kind: string; text: string; seen: number; symbol: string }
const map = (r: R): AlertRow => ({ id: r.id, tokenId: r.token_id, judgementId: r.judgement_id, createdAt: r.created_at, kind: r.kind, text: r.text, seen: r.seen === 1, symbol: r.symbol });
/** One alert per (token, kind). Returns the new row, or null if it already existed. */
export function insertAlert(db: Db, a: { tokenId: number; judgementId: number | null; kind: string; text: string }, now: number): AlertRow | null {
  const r = db.prepare('INSERT OR IGNORE INTO alerts(token_id,judgement_id,created_at,kind,text) VALUES(?,?,?,?,?)').run(a.tokenId, a.judgementId, now, a.kind, a.text);
  if (r.changes === 0) return null;
  return map(db.prepare('SELECT a.*, t.symbol FROM alerts a JOIN tokens t ON t.id=a.token_id WHERE a.id=?').get(Number(r.lastInsertRowid)) as R);
}
export const listAlerts = (db: Db, limit: number): AlertRow[] => (db.prepare('SELECT a.*, t.symbol FROM alerts a JOIN tokens t ON t.id=a.token_id ORDER BY a.created_at DESC, a.id DESC LIMIT ?').all(limit) as R[]).map(map);
export function markSeen(db: Db, ids: number[] | 'all'): void {
  if (ids === 'all') db.prepare('UPDATE alerts SET seen=1').run();
  else { const st = db.prepare('UPDATE alerts SET seen=1 WHERE id=?'); db.transaction(() => { for (const i of ids) st.run(i); })(); }
}
export const alertsSince = (db: Db, since: number): number => (db.prepare("SELECT COUNT(*) c FROM alerts WHERE created_at>=? AND kind='worth_a_look'").get(since) as { c: number }).c;
export const hasAlert = (db: Db, tokenId: number, kind: string): boolean => Boolean(db.prepare('SELECT 1 FROM alerts WHERE token_id=? AND kind=?').get(tokenId, kind));
