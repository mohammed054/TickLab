import type { Db } from '../open';
import type { Pool } from '../../../shared/types';

interface R { id: number; address: string; token_id: number; quote_mint: string | null; quote_symbol: string | null; dex: string | null; created_at_chain: number; first_seen_at: number; source: string; tier: number; tracked_since: number | null; tracked_until: number | null; last_snapshot_at: number | null }
export const mapPool = (r: R): Pool => ({ id: r.id, address: r.address, tokenId: r.token_id, quoteMint: r.quote_mint, quoteSymbol: r.quote_symbol, dex: r.dex, createdAtChain: r.created_at_chain, firstSeenAt: r.first_seen_at, source: r.source, tier: r.tier === 2 ? 2 : 1, trackedSince: r.tracked_since, trackedUntil: r.tracked_until, lastSnapshotAt: r.last_snapshot_at });

export function upsertPool(db: Db, p: { address: string; tokenId: number; quoteMint: string | null; quoteSymbol: string | null; dex: string | null; createdAtChain: number; source: string }, now: number): { id: number; isNew: boolean } {
  const ex = db.prepare('SELECT id FROM pools WHERE address=?').get(p.address) as { id: number } | undefined;
  if (ex) { db.prepare('UPDATE pools SET dex=COALESCE(?,dex), quote_symbol=COALESCE(?,quote_symbol) WHERE id=?').run(p.dex, p.quoteSymbol, ex.id); return { id: ex.id, isNew: false }; }
  const r = db.prepare('INSERT INTO pools(address,token_id,quote_mint,quote_symbol,dex,created_at_chain,first_seen_at,source) VALUES(?,?,?,?,?,?,?,?)').run(p.address, p.tokenId, p.quoteMint, p.quoteSymbol, p.dex, p.createdAtChain, now, p.source);
  return { id: Number(r.lastInsertRowid), isNew: true };
}
export const getPool = (db: Db, id: number): Pool | null => { const r = db.prepare('SELECT * FROM pools WHERE id=?').get(id) as R | undefined; return r ? mapPool(r) : null; };
export const getPoolByAddress = (db: Db, a: string): Pool | null => { const r = db.prepare('SELECT * FROM pools WHERE address=?').get(a) as R | undefined; return r ? mapPool(r) : null; };
/** Primary pool of a token = its newest pool. */
export const getPoolForToken = (db: Db, tokenId: number): Pool | null => { const r = db.prepare('SELECT * FROM pools WHERE token_id=? ORDER BY created_at_chain DESC LIMIT 1').get(tokenId) as R | undefined; return r ? mapPool(r) : null; };
export function promote(db: Db, poolId: number, now: number, untilMs: number | null): void {
  db.prepare('UPDATE pools SET tier=2, tracked_since=COALESCE(tracked_since,?), tracked_until=? WHERE id=?').run(now, untilMs, poolId);
}
export const touchSnapshotTime = (db: Db, poolId: number, at: number): void => { db.prepare('UPDATE pools SET last_snapshot_at=? WHERE id=?').run(at, poolId); };
