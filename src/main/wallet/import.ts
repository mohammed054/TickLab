// docs/06 §6.5 — read-only wallet import. Never signs, never sends.
import type { Db } from '../db/open';
import type { Result, UnlinkedTrade, Side } from '../../shared/types';
import { ok, err } from '../../shared/types';
import type { RpcLike } from '../pipeline/context';
import { SettingsStore } from '../settings/store';
import { jobState, setJobState } from '../db/queries/usage';
import { parseSwapFromTx } from './parseSwap';
import { solUsdAt } from './solUsd';
import { validateAddress } from './address';
import { JournalService } from '../journal/service';
import { loadDecisions } from '../journal/outcomes';

export interface WalletDeps { db: Db; settings: SettingsStore; rpc: RpcLike; now: () => number }
const MAX_PER_SYNC = 50;

export async function syncWallet(d: WalletDeps): Promise<Result<{ imported: number; unlinked: number }>> {
  const addr = d.settings.get('wallet.address');
  if (!addr) return err('VALIDATION', 'No wallet address set.');
  const v = validateAddress(addr);
  if (!v.ok) return err('VALIDATION', v.message);
  const st = jobState(d.db, 'wallet');
  const until = (st.cursor as { sig?: string } | null)?.sig;
  const sigs = await d.rpc.signatures(addr, { limit: MAX_PER_SYNC, ...(until ? { until } : {}) });
  if (!sigs.ok) { setJobState(d.db, 'wallet', { ok: false, error: sigs.error.message }, d.now()); return sigs; }
  const ordered = [...sigs.value].reverse().filter((s) => s.err === null).slice(0, MAX_PER_SYNC); // oldest first
  let imported = 0;
  const ins = d.db.prepare('INSERT OR IGNORE INTO unlinked_trades(tx_sig,block_time,mint,side,token_amount,sol_amount,usd_value,fee_sol) VALUES(?,?,?,?,?,?,?,?)');
  for (const s of ordered) {
    const tx = await d.rpc.transaction(s.signature);
    if (!tx.ok) { setJobState(d.db, 'wallet', { ok: false, error: tx.error.message }, d.now()); return tx; }
    const p = parseSwapFromTx(tx.value, addr);
    if (!p) continue;
    const sol = solUsdAt(d.db, p.blockTime);
    imported += ins.run(p.txSig || s.signature, p.blockTime, p.mint, p.side, p.tokenAmount, p.solAmount, sol === null ? null : p.solAmount * sol, p.feeSol).changes;
  }
  const newest = sigs.value[0]?.signature ?? until;
  setJobState(d.db, 'wallet', { ok: true, cursor: { sig: newest } }, d.now());
  const unlinked = (d.db.prepare('SELECT COUNT(*) c FROM unlinked_trades WHERE linked_fill_id IS NULL AND dismissed=0').get() as { c: number }).c;
  return ok({ imported, unlinked });
}

export function listUnlinked(db: Db, now: number): UnlinkedTrade[] {
  const rows = db.prepare(`SELECT u.*, t.symbol, t.id token_id FROM unlinked_trades u LEFT JOIN tokens t ON t.mint=u.mint
    WHERE u.linked_fill_id IS NULL AND u.dismissed=0 ORDER BY u.block_time DESC`).all() as
    { id: number; tx_sig: string; block_time: number; mint: string; side: Side; token_amount: number; sol_amount: number; usd_value: number | null; fee_sol: number; linked_fill_id: number | null; dismissed: number; symbol: string | null; token_id: number | null }[];
  const real = rows.some((r) => r.token_id !== null) ? loadDecisions(db, 'real', now) : [];
  return rows.map((r) => {
    const m = real.find((d) => d.tokenId === r.token_id && (r.side === 'buy' ? d.status === 'pending' || d.status === 'expired' : d.status === 'open'));
    return {
      id: r.id, txSig: r.tx_sig, blockTime: r.block_time, mint: r.mint, side: r.side, tokenAmount: r.token_amount, solAmount: r.sol_amount,
      usdValue: r.usd_value, feeSol: r.fee_sol, linkedFillId: r.linked_fill_id, dismissed: false, symbol: r.symbol, suggestedDecisionId: m?.id ?? null,
    };
  });
}

/** User-confirmed linking only (never automatic). Creates a 'wallet' fill and marks the queue row. */
export function linkUnlinked(db: Db, svc: JournalService, id: number, decisionId: number, kind: 'entry' | 'exit'): Result<{ fillId: number }> {
  const u = db.prepare('SELECT * FROM unlinked_trades WHERE id=?').get(id) as
    { id: number; tx_sig: string; block_time: number; side: Side; token_amount: number; usd_value: number | null; fee_sol: number; linked_fill_id: number | null } | undefined;
  if (!u || u.linked_fill_id !== null) return err('VALIDATION', 'Trade not found or already linked.');
  if ((kind === 'entry') !== (u.side === 'buy')) return err('VALIDATION', 'A buy links to an entry, a sell links to an exit.');
  if (u.usd_value === null) return err('VALIDATION', 'USD value is still pending (no SOL/USD price for that hour).');
  const solUsd = solUsdAt(db, u.block_time) ?? 0;
  const r = svc.createFill({
    decisionId, kind, occurredAt: u.block_time, priceUsd: u.token_amount > 0 ? u.usd_value / u.token_amount : 0, tokenAmount: u.token_amount,
    usdValue: u.usd_value, feeUsd: u.fee_sol * solUsd, txSig: u.tx_sig, note: 'linked from wallet import',
  }, 'wallet');
  if (!r.ok) return r;
  db.prepare('UPDATE unlinked_trades SET linked_fill_id=? WHERE id=?').run(r.value.fillId, id);
  return r;
}
export const dismissUnlinked = (db: Db, id: number): void => { db.prepare('UPDATE unlinked_trades SET dismissed=1 WHERE id=?').run(id); };
