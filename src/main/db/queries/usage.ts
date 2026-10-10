import type { Db } from '../open';
import type { ErrorRow } from '../../../shared/types';

export const dayKey = (ts: number): string => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function addUsage(db: Db, source: string, now: number, d: { calls?: number; credits?: number; errors?: number }): void {
  db.prepare('INSERT INTO api_usage(source,day,calls,credits,errors) VALUES(?,?,?,?,?) ON CONFLICT(source,day) DO UPDATE SET calls=calls+excluded.calls, credits=credits+excluded.credits, errors=errors+excluded.errors')
    .run(source, dayKey(now), d.calls ?? 0, d.credits ?? 0, d.errors ?? 0);
}
export const usageToday = (db: Db, source: string, now: number): { calls: number; credits: number; errors: number } =>
  (db.prepare('SELECT calls,credits,errors FROM api_usage WHERE source=? AND day=?').get(source, dayKey(now)) as { calls: number; credits: number; errors: number } | undefined) ?? { calls: 0, credits: 0, errors: 0 };
export const creditsThisMonth = (db: Db, source: string, now: number): number =>
  (db.prepare('SELECT COALESCE(SUM(credits),0) c FROM api_usage WHERE source=? AND day LIKE ?').get(source, `${dayKey(now).slice(0, 7)}-%`) as { c: number }).c;
export const logError = (db: Db, source: string, code: string, message: string, now: number): void => {
  db.prepare('INSERT INTO error_log(at,source,code,message) VALUES(?,?,?,?)').run(now, source, code, message.slice(0, 500));
};
export const listErrors = (db: Db, limit: number): ErrorRow[] =>
  (db.prepare('SELECT * FROM error_log ORDER BY at DESC, id DESC LIMIT ?').all(limit) as ErrorRow[]);
export function jobState(db: Db, name: string): { lastRunAt: number | null; lastOkAt: number | null; lastError: string | null; cursor: unknown } {
  const r = db.prepare('SELECT * FROM jobs_state WHERE name=?').get(name) as { last_run_at: number | null; last_ok_at: number | null; last_error: string | null; cursor_json: string | null } | undefined;
  return { lastRunAt: r?.last_run_at ?? null, lastOkAt: r?.last_ok_at ?? null, lastError: r?.last_error ?? null, cursor: r?.cursor_json ? JSON.parse(r.cursor_json) : null };
}
export function setJobState(db: Db, name: string, p: { ok?: boolean; error?: string | null; cursor?: unknown }, now: number): void {
  db.prepare('INSERT OR IGNORE INTO jobs_state(name) VALUES(?)').run(name);
  db.prepare('UPDATE jobs_state SET last_run_at=?, last_ok_at=CASE WHEN ? THEN ? ELSE last_ok_at END, last_error=?, cursor_json=COALESCE(?,cursor_json) WHERE name=?')
    .run(now, p.ok ? 1 : 0, now, p.ok ? null : (p.error ?? null), p.cursor === undefined ? null : JSON.stringify(p.cursor), name);
}
