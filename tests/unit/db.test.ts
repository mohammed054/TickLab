import { describe, it, expect } from 'vitest';
import { openDb } from '../../src/main/db/open';
import { migrate, schemaVersion } from '../../src/main/db/migrate';

function seeded() {
  const db = openDb(':memory:');
  migrate(db);
  db.prepare("INSERT INTO tokens(id,mint,symbol,name,first_seen_at) VALUES(1,'M','S','N',1)").run();
  db.prepare("INSERT INTO pools(id,address,token_id,created_at_chain,first_seen_at,source) VALUES(1,'P',1,1,1,'geckoterminal')").run();
  db.prepare("INSERT INTO judgements(id,token_id,pool_id,rules_version,computed_at,score,band,completeness,inputs_hash) VALUES(1,1,1,'v',1,10,'LOW',1,'h')").run();
  db.prepare("INSERT INTO decisions(id,account,token_id,pool_id,created_at,size_usd,stop_rule,target_rule,thesis,judgement_id,equity_before,risk_state_json) VALUES(1,'paper',1,1,1,10,'s','t','x'||'y'||'0123456789012345678',1,200,'{}')").run();
  db.prepare("INSERT INTO fills(id,decision_id,kind,occurred_at,price_usd,token_amount,usd_value,source) VALUES(1,1,'entry',1,1,1,1,'manual')").run();
  db.prepare("INSERT INTO fill_voids(fill_id,voided_at,reason) VALUES(1,1,'r')").run();
  db.prepare("INSERT INTO decision_notes(id,decision_id,created_at,kind,text) VALUES(1,1,1,'note','t')").run();
  db.prepare("INSERT INTO rule_configs(id,name,config_json,sha256,frozen_at) VALUES(1,'n','{}','abc',1)").run();
  db.prepare("INSERT INTO equity_events(id,account,at,kind,amount_usd) VALUES(1,'paper',1,'deposit',200)").run();
  db.prepare("INSERT INTO risk_acks(id,account,at,reason) VALUES(1,'paper',1,'r')").run();
  return db;
}

describe('db migrations', () => {
  it('is idempotent', () => {
    const db = openDb(':memory:');
    expect(migrate(db)).toBe(1);
    expect(migrate(db)).toBe(1);
    expect(schemaVersion(db)).toBe(1);
  });
  const tables: [string, string][] = [
    ['decisions', 'id=1'], ['fills', 'id=1'], ['fill_voids', 'fill_id=1'], ['decision_notes', 'id=1'],
    ['rule_configs', 'id=1'], ['equity_events', 'id=1'], ['risk_acks', 'id=1'],
  ];
  for (const [t, where] of tables) {
    it(`${t} is append-only`, () => {
      const db = seeded();
      const col = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => (c as { name: string }).name)[1];
      expect(() => db.prepare(`UPDATE ${t} SET ${col}=${col} WHERE ${where}`).run()).toThrow('append-only table');
      expect(() => db.prepare(`DELETE FROM ${t} WHERE ${where}`).run()).toThrow('append-only table');
    });
  }
  it('unlinked_trades stays updatable (work queue)', () => {
    const db = seeded();
    db.prepare("INSERT INTO unlinked_trades(tx_sig,block_time,mint,side,token_amount,sol_amount,fee_sol) VALUES('s',1,'M','buy',1,1,0.1)").run();
    expect(() => db.prepare('UPDATE unlinked_trades SET dismissed=1').run()).not.toThrow();
  });
  it('v_fills_valid excludes voided fills', () => {
    const db = seeded();
    expect(db.prepare('SELECT COUNT(*) c FROM v_fills_valid').get()).toEqual({ c: 0 });
  });
  it('enforces thesis >= 20 chars', () => {
    const db = seeded();
    expect(() => db.prepare("INSERT INTO decisions(account,token_id,pool_id,created_at,size_usd,stop_rule,target_rule,thesis,judgement_id,equity_before,risk_state_json) VALUES('paper',1,1,1,10,'s','t','short',1,200,'{}')").run()).toThrow();
  });
});
