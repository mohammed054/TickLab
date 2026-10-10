import type { Db } from '../open';
import type { Judgement, StoredJudgement, RuleResult, Band } from '../../../shared/types';

interface J { id: number; token_id: number; pool_id: number; rules_version: string; computed_at: number; score: number; band: Band; completeness: number; inputs_hash: string }
interface RR { rule_id: string; status: RuleResult['status']; points: number; evidence_json: string }

function load(db: Db, j: J): StoredJudgement {
  const rr = db.prepare('SELECT rule_id,status,points,evidence_json FROM rule_results WHERE judgement_id=? ORDER BY id').all(j.id) as RR[];
  return { id: j.id, tokenId: j.token_id, poolId: j.pool_id, computedAt: j.computed_at, score: j.score, band: j.band, completeness: j.completeness, inputsHash: j.inputs_hash, rulesVersion: j.rules_version,
    results: rr.map((r) => ({ ruleId: r.rule_id, status: r.status, points: r.points, evidence: JSON.parse(r.evidence_json) as Record<string, unknown> })) };
}
export const latestJudgement = (db: Db, tokenId: number): StoredJudgement | null => { const j = db.prepare('SELECT * FROM judgements WHERE token_id=? ORDER BY computed_at DESC, id DESC LIMIT 1').get(tokenId) as J | undefined; return j ? load(db, j) : null; };
export const getJudgement = (db: Db, id: number): StoredJudgement | null => { const j = db.prepare('SELECT * FROM judgements WHERE id=?').get(id) as J | undefined; return j ? load(db, j) : null; };

/** Stores a judgement only if its inputs_hash differs from the token's previous row. Returns the new row or null. */
export function storeJudgement(db: Db, tokenId: number, poolId: number, j: Judgement, now: number): StoredJudgement | null {
  const prev = db.prepare('SELECT inputs_hash FROM judgements WHERE token_id=? ORDER BY computed_at DESC, id DESC LIMIT 1').get(tokenId) as { inputs_hash: string } | undefined;
  if (prev && prev.inputs_hash === j.inputsHash) return null;
  const id = db.transaction(() => {
    const r = db.prepare('INSERT INTO judgements(token_id,pool_id,rules_version,computed_at,score,band,completeness,inputs_hash) VALUES(?,?,?,?,?,?,?,?)').run(tokenId, poolId, j.rulesVersion, now, j.score, j.band, j.completeness, j.inputsHash);
    const jid = Number(r.lastInsertRowid);
    const st = db.prepare('INSERT INTO rule_results(judgement_id,rule_id,status,points,evidence_json) VALUES(?,?,?,?,?)');
    for (const x of j.results) st.run(jid, x.ruleId, x.status, x.points, JSON.stringify(x.evidence));
    return jid;
  })();
  return getJudgement(db, id);
}
