import { openDb, type Db } from '../../src/main/db/open';
import { migrate } from '../../src/main/db/migrate';
import { SettingsStore } from '../../src/main/settings/store';
import { upsertToken } from '../../src/main/db/queries/tokens';
import { upsertPool } from '../../src/main/db/queries/pools';
import { insertSnapshot } from '../../src/main/db/queries/snapshots';
import type { Snapshot } from '../../src/shared/types';

export function freshDb(): { db: Db; settings: SettingsStore } {
  const db = openDb(':memory:'); migrate(db);
  return { db, settings: new SettingsStore(db) };
}
export const snapOf = (poolId: number, observedAt: number, o: Partial<Snapshot> = {}): Snapshot => ({
  poolId, observedAt, priceUsd: 0.001, liquidityUsd: 1000, fdvUsd: null, mcapUsd: null, volM5: null, volH1: 1000, volH24: null,
  buysM5: 10, sellsM5: 5, buyersM5: null, sellersM5: null, buysH1: null, sellsH1: null, buyersH1: 30, sellersH1: null, chgM5: null, chgH1: null, source: 'geckoterminal', ...o,
});
export function seedToken(db: Db, n: number, createdAt: number, now: number, o: Partial<Snapshot> = {}): { tokenId: number; poolId: number } {
  const t = upsertToken(db, { mint: `MINT${String(n).padStart(40, '0')}`, symbol: `TK${n}`, name: `Token ${n}` }, now);
  const p = upsertPool(db, { address: `POOL${String(n).padStart(40, '0')}`, tokenId: t.id, quoteMint: 'So11111111111111111111111111111111111111112', quoteSymbol: 'SOL', dex: n % 2 ? 'raydium' : 'orca', createdAtChain: createdAt, source: 'geckoterminal' }, now);
  insertSnapshot(db, snapOf(p.id, now, o));
  return { tokenId: t.id, poolId: p.id };
}
export function seedJudgement(db: Db, tokenId: number, poolId: number, score = 20, band = 'LOW', completeness = 0.8, hash = `h${Math.random()}`, at = 1): number {
  return Number(db.prepare('INSERT INTO judgements(token_id,pool_id,rules_version,computed_at,score,band,completeness,inputs_hash) VALUES(?,?,?,?,?,?,?,?)').run(tokenId, poolId, 'rules_v1', at, score, band, completeness, hash).lastInsertRowid);
}
