// docs/03 §3.7 — Tier 3 deep data for the token open in Detail (or with an open decision).
import type { PipelineCtx } from './context';
import type { HolderRow, HolderSnapshot, Trade } from '../../shared/types';
import type { AccountInfo, LargestAccount } from '../sources/solanaRpc';
import { INCINERATOR, SYSTEM_PROGRAM, MS } from '../../shared/constants';
import { getToken, setCreator } from '../db/queries/tokens';
import { getPoolForToken } from '../db/queries/pools';
import { insertTrades } from '../db/queries/trades';
import { insertHolders, latestHolders } from '../db/queries/holders';
import { creditsThisMonth, logError } from '../db/queries/usage';

export const HOLDERS_REFRESH_MS = 10 * MS.min, DEEP_STOP_AFTER_MS = 60_000, TRADES_EVERY_MS = 30_000, CREATOR_MAX_AGE_MS = 6 * MS.hour, CREATOR_MAX_PAGES = 10;

/** Pure: classify top token accounts. ownerOf maps token account -> owner wallet; ownerInfo is each owner's account (for its program owner). */
export function classifyHolders(largest: LargestAccount[], tokenAccounts: AccountInfo[], ownerAccounts: AccountInfo[], supply: number | null): { rows: HolderRow[]; top1Pct: number | null; top10Pct: number | null; programsPct: number | null; burnedPct: number | null } {
  const ownerByTa = new Map<string, string>();
  for (const a of tokenAccounts) { const info = a.parsed && typeof a.parsed === 'object' ? (a.parsed as { info?: { owner?: unknown } }).info : undefined; if (info && typeof info.owner === 'string') ownerByTa.set(a.address, info.owner); }
  const ownerInfo = new Map(ownerAccounts.map((a) => [a.address, a]));
  const rows: HolderRow[] = [];
  for (const l of largest) {
    const owner = ownerByTa.get(l.address); if (!owner || l.uiAmount === null || !supply || supply <= 0) continue;
    const oi = ownerInfo.get(owner);
    const cls: HolderRow['class'] = owner === INCINERATOR ? 'burn' : oi && oi.exists && oi.owner === SYSTEM_PROGRAM ? 'wallet' : 'program';
    rows.push({ address: l.address, owner, pct: (l.uiAmount / supply) * 100, class: cls });
  }
  if (rows.length === 0) return { rows, top1Pct: null, top10Pct: null, programsPct: null, burnedPct: null };
  const wallets = rows.filter((r) => r.class === 'wallet').map((r) => r.pct).sort((a, b) => b - a);
  const sum = (c: HolderRow['class']) => rows.filter((r) => r.class === c).reduce((s, r) => s + r.pct, 0);
  return { rows, top1Pct: wallets[0] ?? 0, top10Pct: wallets.slice(0, 10).reduce((a, b) => a + b, 0), programsPct: sum('program'), burnedPct: sum('burn') };
}

export class Deep {
  private active = new Set<number>();
  private stopTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private lastTrades = new Map<number, number>();
  private creatorTried = new Set<number>();
  constructor(private c: PipelineCtx) {}

  /** Called by detail:select. `null` closes. Deep stops 60 s after the token leaves Detail. */
  setSelected(tokenId: number | null, prev: number | null): void {
    if (prev !== null && prev !== tokenId) this.scheduleStop(prev);
    if (tokenId !== null) { const t = this.stopTimers.get(tokenId); if (t) clearTimeout(t); this.stopTimers.delete(tokenId); this.active.add(tokenId); }
  }
  private scheduleStop(tokenId: number): void {
    const old = this.stopTimers.get(tokenId); if (old) clearTimeout(old);
    const t = setTimeout(() => { this.active.delete(tokenId); this.stopTimers.delete(tokenId); }, DEEP_STOP_AFTER_MS);
    (t as { unref?: () => void }).unref?.();
    this.stopTimers.set(tokenId, t);
  }
  activeTokenIds(): number[] { return [...this.active]; }
  timerCount(): number { return this.stopTimers.size; }
  stopAll(): void { for (const t of this.stopTimers.values()) clearTimeout(t); this.stopTimers.clear(); this.active.clear(); }

  /** Active deep tokens + tokens with open decisions. */
  private targets(): number[] {
    const open = this.c.db.prepare(`SELECT DISTINCT d.token_id id FROM decisions d WHERE EXISTS (SELECT 1 FROM v_fills_valid f WHERE f.decision_id=d.id AND f.kind='entry')
      AND NOT EXISTS (SELECT 1 FROM v_fills_valid f WHERE f.decision_id=d.id AND f.kind='exit')`).all() as { id: number }[];
    return [...new Set([...this.active, ...open.map((o) => o.id)])];
  }

  async tick(): Promise<void> { for (const id of this.targets()) await this.refresh(id); }

  async refresh(tokenId: number): Promise<void> {
    const pool = getPoolForToken(this.c.db, tokenId); const tok = getToken(this.c.db, tokenId);
    if (!pool || !tok) return;
    const now = this.c.now();
    if (now - (this.lastTrades.get(tokenId) ?? 0) >= TRADES_EVERY_MS) {
      this.lastTrades.set(tokenId, now);
      const r = await this.c.gt.poolTrades(pool.address, pool.id, undefined, 0);
      if (r.ok) { this.c.monitor.ok('geckoterminal'); insertTrades(this.c.db, r.value as Trade[]); } else { logError(this.c.db, 'geckoterminal', r.error.code, r.error.message, now); this.c.monitor.fail('geckoterminal', r.error.code); }
    }
    const h = latestHolders(this.c.db, tokenId);
    if ((!h || now - h.observedAt >= HOLDERS_REFRESH_MS) && now - pool.createdAtChain >= 10 * MS.min) await this.refreshHolders(tokenId, tok.mint);
    if (!tok.creatorWallet && now - pool.createdAtChain < CREATOR_MAX_AGE_MS && !this.creatorTried.has(tokenId)) { this.creatorTried.add(tokenId); await this.deriveCreator(tokenId, tok.mint); }
    this.c.judge.run(tokenId);
    this.c.batcher.add([tokenId]);
  }

  async refreshHolders(tokenId: number, mint: string): Promise<boolean> {
    const { rpc, db } = this.c; const now = this.c.now();
    const fail = (code: string, msg: string): false => { logError(db, 'rpc', code, msg, now); this.c.monitor.fail('rpc', code); return false; };
    const sup = await rpc.tokenSupply(mint); if (!sup.ok) return fail(sup.error.code, sup.error.message);
    const largest = await rpc.largestAccounts(mint); if (!largest.ok) return fail(largest.error.code, largest.error.message);
    const tas = await rpc.multipleAccounts(largest.value.map((l) => l.address)); if (!tas.ok) return fail(tas.error.code, tas.error.message);
    const owners = [...new Set(tas.value.flatMap((a) => { const i = a.parsed && typeof a.parsed === 'object' ? (a.parsed as { info?: { owner?: unknown } }).info : undefined; return i && typeof i.owner === 'string' ? [i.owner] : []; }))];
    const oa = await rpc.multipleAccounts(owners); if (!oa.ok) return fail(oa.error.code, oa.error.message);
    this.c.monitor.ok('rpc');
    const cl = classifyHolders(largest.value, tas.value, oa.value, sup.value);
    const snap: HolderSnapshot = { tokenId, observedAt: now, supply: sup.value, top1Pct: cl.top1Pct, top10Pct: cl.top10Pct, programsPct: cl.programsPct, burnedPct: cl.burnedPct, rows: cl.rows };
    insertHolders(db, snap);
    return true;
  }

  /** Best effort, tokens < 6 h old: oldest signature of the mint -> its fee payer = creator. Page cap bounds RPC credits. */
  async deriveCreator(tokenId: number, mint: string): Promise<boolean> {
    const { rpc, db, settings } = this.c; const now = this.c.now();
    if (creditsThisMonth(db, 'rpc', now) > 0.8 * settings.get('sources.rpc.monthlyCreditBudget')) return false;
    let before: string | undefined; let oldest: string | null = null;
    for (let page = 0; page < CREATOR_MAX_PAGES; page++) {
      const r = await rpc.signatures(mint, { limit: 1000, before });
      if (!r.ok) { logError(db, 'rpc', r.error.code, r.error.message, now); return false; }
      if (r.value.length === 0) break;
      oldest = r.value[r.value.length - 1].signature;
      if (r.value.length < 1000) { const tx = await rpc.transaction(oldest); if (!tx.ok || !tx.value) return false;
        const payer = tx.value.transaction.message.accountKeys[0]?.pubkey; if (!payer) return false; setCreator(db, tokenId, payer, now); return true; }
      before = oldest;
    }
    return false; // page cap hit or no signatures: creator stays NULL (R05 = unknown)
  }
}
