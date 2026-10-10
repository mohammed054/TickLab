// Derived decision state (docs/02 §2.1): status, realized PnL, equity timeline. Computed, never stored.
import type { Db } from '../db/open';
import type { Account, DecisionRow, DecisionStatus, FillRow } from '../../shared/types';

interface DRaw { id: number; account: Account; token_id: number; pool_id: number; created_at: number; size_usd: number; planned_entry_price: number | null; stop_rule: string; target_rule: string; thesis: string; judgement_id: number; equity_before: number; symbol: string; mint: string; score: number; band: string; completeness: number }
interface FRaw { id: number; decision_id: number; kind: 'entry' | 'exit'; occurred_at: number; price_usd: number; token_amount: number; usd_value: number; fee_usd: number; slippage_pct: number | null; source: FillRow['source']; tx_sig: string | null; note: string }

export const EXPIRE_MS = 30 * 60_000;

const toFill = (f: FRaw, voided: boolean): FillRow => ({ id: f.id, decisionId: f.decision_id, kind: f.kind, occurredAt: f.occurred_at, priceUsd: f.price_usd, tokenAmount: f.token_amount, usdValue: f.usd_value, feeUsd: f.fee_usd, slippagePct: f.slippage_pct, source: f.source, txSig: f.tx_sig, note: f.note, voided });

export function realizedPnl(entry: FillRow, exit: FillRow): number {
  return exit.usdValue - exit.feeUsd - entry.usdValue - entry.feeUsd;
}

export function loadDecisions(db: Db, account: Account, now: number, opts: { tokenId?: number; decisionId?: number } = {}): DecisionRow[] {
  let sql = `SELECT d.*, t.symbol, t.mint, j.score, j.band, j.completeness FROM decisions d
    JOIN tokens t ON t.id=d.token_id JOIN judgements j ON j.id=d.judgement_id WHERE d.account=?`;
  const args: unknown[] = [account];
  if (opts.tokenId) { sql += ' AND d.token_id=?'; args.push(opts.tokenId); }
  if (opts.decisionId) { sql += ' AND d.id=?'; args.push(opts.decisionId); }
  sql += ' ORDER BY d.created_at DESC, d.id DESC';
  const ds = db.prepare(sql).all(...args) as DRaw[];
  if (ds.length === 0) return [];
  const fills = db.prepare('SELECT f.*, EXISTS(SELECT 1 FROM fill_voids v WHERE v.fill_id=f.id) AS voided FROM fills f ORDER BY f.occurred_at, f.id').all() as (FRaw & { voided: number })[];
  const notes = db.prepare('SELECT id, decision_id, created_at, kind, text FROM decision_notes ORDER BY id').all() as { id: number; decision_id: number; created_at: number; kind: string; text: string }[];
  return ds.map((d) => {
    const mine = fills.filter((f) => f.decision_id === d.id && !f.voided);
    const entryR = mine.find((f) => f.kind === 'entry');
    const exitR = mine.find((f) => f.kind === 'exit');
    const entry = entryR ? toFill(entryR, false) : null;
    const exit = exitR ? toFill(exitR, false) : null;
    const dn = notes.filter((n) => n.decision_id === d.id);
    let status: DecisionStatus;
    if (dn.some((n) => n.kind === 'cancel')) status = 'cancelled';
    else if (entry && exit) status = 'closed';
    else if (entry) status = 'open';
    else status = now - d.created_at > EXPIRE_MS ? 'expired' : 'pending';
    const pnlUsd = status === 'closed' && entry && exit ? realizedPnl(entry, exit) : null;
    const pnlPct = pnlUsd !== null && entry && entry.usdValue > 0 ? (pnlUsd / entry.usdValue) * 100 : null;
    return {
      id: d.id, account: d.account, tokenId: d.token_id, poolId: d.pool_id, createdAt: d.created_at, sizeUsd: d.size_usd,
      plannedEntryPrice: d.planned_entry_price, stopRule: d.stop_rule, targetRule: d.target_rule, thesis: d.thesis, judgementId: d.judgement_id,
      equityBefore: d.equity_before, symbol: d.symbol, mint: d.mint, score: d.score, band: d.band, completeness: d.completeness,
      status, entry, exit, pnlUsd, pnlPct, notes: dn.map((n) => ({ id: n.id, createdAt: n.created_at, kind: n.kind, text: n.text })),
    };
  });
}

export interface TimelinePoint { at: number; equity: number; kind: string; note: string; peakReset: boolean }

/** Equity after each equity-changing event (deposit/withdraw/adjust events and closed-decision exits). */
export function equityTimeline(db: Db, account: Account, now: number): TimelinePoint[] {
  const ev = db.prepare('SELECT at, kind, amount_usd, note, id FROM equity_events WHERE account=? ORDER BY at, id').all(account) as { at: number; kind: string; amount_usd: number; note: string; id: number }[];
  const closed = loadDecisions(db, account, now).filter((d) => d.status === 'closed' && d.exit);
  const items: { at: number; amount: number; kind: string; note: string; reset: boolean; ord: number }[] = [
    ...ev.map((e) => ({ at: e.at, amount: e.amount_usd, kind: e.kind, note: e.note, reset: e.kind === 'adjust' && e.amount_usd === 0 && e.note === 'peak reset', ord: e.id })),
    ...closed.map((d) => ({ at: d.exit!.occurredAt, amount: d.pnlUsd ?? 0, kind: 'trade', note: `${d.symbol} #${d.id}`, reset: false, ord: 1e9 + d.id })),
  ].sort((a, b) => a.at - b.at || a.ord - b.ord);
  let eq = 0;
  return items.map((i) => { eq += i.amount; return { at: i.at, equity: eq, kind: i.kind, note: i.note, peakReset: i.reset }; });
}

export function equityAndPeak(db: Db, account: Account, now: number): { equity: number; peak: number; lastEventAt: number | null } {
  const tl = equityTimeline(db, account, now);
  let peak = 0, equity = 0;
  for (const p of tl) { equity = p.equity; peak = p.peakReset ? p.equity : Math.max(peak, p.equity); }
  return { equity, peak, lastEventAt: tl.length ? tl[tl.length - 1].at : null };
}
