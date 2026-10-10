import type { Db } from '../open';

export const utcDay = (ts: number): string => new Date(ts).toISOString().slice(0, 10);
export const getCache = (db: Db, tokenId: number, dataHash: string, question: string): { text: string; model: string } | null => {
  const r = db.prepare('SELECT response_text, model FROM ai_cache WHERE token_id=? AND data_hash=? AND question=?').get(tokenId, dataHash, question) as { response_text: string; model: string } | undefined;
  return r ? { text: r.response_text, model: r.model } : null;
};
export const putCache = (db: Db, tokenId: number, dataHash: string, question: string, model: string, text: string, now: number): void => {
  db.prepare('INSERT OR REPLACE INTO ai_cache(token_id,data_hash,question,model,created_at,response_text) VALUES(?,?,?,?,?,?)').run(tokenId, dataHash, question, model, now, text);
};
export const aiUsedToday = (db: Db, now: number): number => ((db.prepare('SELECT requests FROM ai_usage WHERE day=?').get(utcDay(now)) as { requests: number } | undefined)?.requests ?? 0);
export const countAiAttempt = (db: Db, now: number): void => {
  db.prepare('INSERT INTO ai_usage(day,requests) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET requests=requests+1').run(utcDay(now));
};
