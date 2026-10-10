import type { Db } from '../open';
import type { Token } from '../../../shared/types';

interface R { id: number; mint: string; symbol: string; name: string; decimals: number | null; supply: number | null; creator_wallet: string | null; creator_derived_at: number | null; mint_authority: string | null; freeze_authority: string | null; authorities_checked_at: number | null; first_seen_at: number }
export const mapToken = (r: R): Token => ({ id: r.id, mint: r.mint, symbol: r.symbol, name: r.name, decimals: r.decimals, supply: r.supply, creatorWallet: r.creator_wallet, creatorDerivedAt: r.creator_derived_at, mintAuthority: r.mint_authority, freezeAuthority: r.freeze_authority, authoritiesCheckedAt: r.authorities_checked_at, firstSeenAt: r.first_seen_at });

/** Upsert by mint; returns the row id. Symbol/name are refreshed, other fields untouched. */
export function upsertToken(db: Db, t: { mint: string; symbol: string; name: string }, now: number): { id: number; isNew: boolean } {
  const ex = db.prepare('SELECT id FROM tokens WHERE mint=?').get(t.mint) as { id: number } | undefined;
  if (ex) { db.prepare('UPDATE tokens SET symbol=?, name=? WHERE id=?').run(t.symbol, t.name, ex.id); return { id: ex.id, isNew: false }; }
  const r = db.prepare('INSERT INTO tokens(mint,symbol,name,first_seen_at) VALUES(?,?,?,?)').run(t.mint, t.symbol, t.name, now);
  return { id: Number(r.lastInsertRowid), isNew: true };
}
export const getToken = (db: Db, id: number): Token | null => { const r = db.prepare('SELECT * FROM tokens WHERE id=?').get(id) as R | undefined; return r ? mapToken(r) : null; };
export const getTokenByMint = (db: Db, mint: string): Token | null => { const r = db.prepare('SELECT * FROM tokens WHERE mint=?').get(mint) as R | undefined; return r ? mapToken(r) : null; };
export function setAuthorities(db: Db, id: number, a: { mintAuthority: string | null; freezeAuthority: string | null; decimals: number | null; supply: number | null }, now: number): void {
  db.prepare('UPDATE tokens SET mint_authority=?, freeze_authority=?, decimals=COALESCE(?,decimals), supply=COALESCE(?,supply), authorities_checked_at=? WHERE id=?').run(a.mintAuthority, a.freezeAuthority, a.decimals, a.supply, now, id);
}
export function setCreator(db: Db, id: number, wallet: string, now: number): void {
  db.prepare('UPDATE tokens SET creator_wallet=?, creator_derived_at=? WHERE id=?').run(wallet, now, id);
}
