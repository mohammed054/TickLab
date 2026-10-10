import type { Db } from '../open';
import type { Gap } from '../../../shared/types';

interface R { id: number; source: string; start_at: number; end_at: number; reason: string; resolved: number }
const map = (r: R): Gap => ({ id: r.id, source: r.source, startAt: r.start_at, endAt: r.end_at, reason: r.reason, resolved: r.resolved === 1 });
export const insertGap = (db: Db, g: { source: string; startAt: number; endAt: number; reason: string }): number =>
  Number(db.prepare('INSERT INTO gaps(source,start_at,end_at,reason) VALUES(?,?,?,?)').run(g.source, g.startAt, g.endAt, g.reason).lastInsertRowid);
export const listGaps = (db: Db, limit: number): Gap[] => (db.prepare('SELECT * FROM gaps ORDER BY start_at DESC, id DESC LIMIT ?').all(limit) as R[]).map(map);
export const gapsSince = (db: Db, since: number): number => (db.prepare('SELECT COUNT(*) c FROM gaps WHERE end_at>=?').get(since) as { c: number }).c;
export const allGaps = (db: Db): Gap[] => (db.prepare('SELECT * FROM gaps ORDER BY start_at').all() as R[]).map(map);
export const isInGap = (gaps: Gap[], ts: number): boolean => gaps.some((g) => ts >= g.startAt && ts <= g.endAt);
