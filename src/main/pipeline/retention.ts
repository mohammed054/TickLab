// docs/02 §2.2 — retention. Never touches journal tables.
import type { Db } from '../db/open';
import { MS } from '../../shared/constants';

export interface RetentionResult { snapshots: number; trades: number; judgements: number; errors: number }
const KEEP_TOKENS = `(SELECT token_id FROM watchlist UNION SELECT token_id FROM decisions)`;

export function runRetention(db: Db, now: number, snapshotDays: number, tradeDays: number): RetentionResult {
  const sCut = now - snapshotDays * MS.day, tCut = now - tradeDays * MS.day;
  const res = db.transaction((): RetentionResult => {
    const snapshots = db.prepare(`DELETE FROM pool_snapshots WHERE observed_at<? AND pool_id NOT IN (SELECT id FROM pools WHERE token_id IN ${KEEP_TOKENS})`).run(sCut).changes;
    const trades = db.prepare(`DELETE FROM trades WHERE block_time<? AND pool_id NOT IN (SELECT id FROM pools WHERE token_id IN ${KEEP_TOKENS})`).run(tCut).changes;
    const doomed = `SELECT j.id FROM judgements j WHERE j.computed_at<? AND j.id NOT IN (SELECT MAX(id) FROM judgements GROUP BY token_id)
      AND j.id NOT IN (SELECT judgement_id FROM decisions) AND j.id NOT IN (SELECT judgement_id FROM alerts WHERE judgement_id IS NOT NULL)`;
    db.prepare(`DELETE FROM rule_results WHERE judgement_id IN (${doomed})`).run(sCut);
    const judgements = db.prepare(`DELETE FROM judgements WHERE id IN (${doomed.replace('SELECT j.id FROM judgements j WHERE', 'SELECT j.id FROM judgements j WHERE')})`).run(sCut).changes;
    const errors = db.prepare('DELETE FROM error_log WHERE at<?').run(now - 30 * MS.day).changes;
    return { snapshots, trades, judgements, errors };
  })();
  db.pragma('optimize');
  return res;
}
