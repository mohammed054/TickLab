// docs/06 §6.4 — decisions & fills. All writes are append-only; voids and cancels are separate rows.
import type { Db } from '../db/open';
import type { Account, CreateDecisionInput, Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { SettingsStore } from '../settings/store';
import { latestJudgement } from '../db/queries/judgements';
import { latestSnapshot } from '../db/queries/snapshots';
import { computeRiskState, canCreateDecision } from './risk';
import { simulateEntry, simulateExit, type PaperCosts } from './paperFill';
import { loadDecisions } from './outcomes';

export const MIN_THESIS = 20;

export class JournalService {
  constructor(private db: Db, private settings: SettingsStore, private now: () => number) {}

  costs(): PaperCosts { return { feePctPerSide: this.settings.get('costs.tradeFeePctPerSide'), networkFeeUsd: this.settings.get('costs.networkFeeUsdPerTx') }; }

  /** Inserts the starting deposit for each account on first run (docs/02 §2.1). Idempotent. */
  ensureInitialDeposits(): void {
    const start = this.settings.get('journal.startEquityUsd');
    for (const a of ['paper', 'real'] as Account[]) {
      const has = this.db.prepare('SELECT 1 FROM equity_events WHERE account=? LIMIT 1').get(a);
      if (!has) this.db.prepare("INSERT INTO equity_events(account,at,kind,amount_usd,note) VALUES(?,?,'deposit',?,'starting equity')").run(a, this.now(), start);
    }
  }

  createDecision(input: CreateDecisionInput): Result<{ decisionId: number }> {
    const now = this.now();
    const pool = this.db.prepare('SELECT id, token_id FROM pools WHERE id=?').get(input.poolId) as { id: number; token_id: number } | undefined;
    if (!pool || pool.token_id !== input.tokenId) return err('VALIDATION', 'Unknown token/pool.');
    const j = latestJudgement(this.db, input.tokenId);
    if (!j) return err('VALIDATION', 'No judgement exists for this token yet.');
    const thesis = input.thesis.trim();
    if (thesis.length < MIN_THESIS) return err('VALIDATION', `Thesis must be at least ${MIN_THESIS} characters.`);
    if (!input.stopRule.trim() || !input.targetRule.trim()) return err('VALIDATION', 'Stop and target rules are required.');
    const risk = computeRiskState(this.db, this.settings, input.account, now);
    const gate = canCreateDecision(risk, input.sizeUsd);
    if (!gate.ok) return gate;
    const snap = latestSnapshot(this.db, input.poolId);
    let decisionId = 0;
    try {
      this.db.transaction(() => {
        decisionId = Number(this.db.prepare(`INSERT INTO decisions(account,token_id,pool_id,created_at,size_usd,planned_entry_price,stop_rule,target_rule,thesis,judgement_id,equity_before,risk_state_json)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.account, input.tokenId, input.poolId, now, input.sizeUsd, snap?.priceUsd ?? null, input.stopRule, input.targetRule, thesis, j.id, risk.equity, JSON.stringify(risk)).lastInsertRowid);
        if (input.account === 'paper') {
          const f = simulateEntry(input.sizeUsd, snap, this.costs(), now);
          if (!f.ok) throw new PaperError(f.error.message);
          this.insertFill(decisionId, 'entry', now, f.value, 'paper_sim', null, '');
        }
      })();
    } catch (e) {
      if (e instanceof PaperError) return err('VALIDATION', e.message);
      throw e;
    }
    return ok({ decisionId });
  }

  private insertFill(decisionId: number, kind: 'entry' | 'exit', at: number, f: { priceUsd: number; tokenAmount: number; usdValue: number; feeUsd: number; slippagePct?: number | null }, source: 'manual' | 'wallet' | 'paper_sim', txSig: string | null, note: string): number {
    return Number(this.db.prepare(`INSERT INTO fills(decision_id,kind,occurred_at,price_usd,token_amount,usd_value,fee_usd,slippage_pct,source,tx_sig,note) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(decisionId, kind, at, f.priceUsd, f.tokenAmount, f.usdValue, f.feeUsd, f.slippagePct ?? null, source, txSig, note).lastInsertRowid);
  }

  private find(decisionId: number) {
    const d = this.db.prepare('SELECT account FROM decisions WHERE id=?').get(decisionId) as { account: Account } | undefined;
    if (!d) return null;
    return loadDecisions(this.db, d.account, this.now(), { decisionId })[0] ?? null;
  }

  /** Manual / wallet fill. One valid entry and one valid exit per decision; entry before exit (docs/05 T6.7). */
  createFill(p: { decisionId: number; kind: 'entry' | 'exit'; occurredAt: number; priceUsd: number; tokenAmount: number; usdValue: number; feeUsd: number; slippagePct?: number; txSig?: string; note?: string }, source: 'manual' | 'wallet' = 'manual'): Result<{ fillId: number }> {
    const d = this.find(p.decisionId);
    if (!d) return err('VALIDATION', 'Unknown decision.');
    if (d.status === 'cancelled') return err('VALIDATION', 'Decision is cancelled.');
    if (p.kind === 'entry' && d.entry) return err('VALIDATION', 'This decision already has an entry fill. Void it first.');
    if (p.kind === 'exit') {
      if (!d.entry) return err('VALIDATION', 'Record the entry fill before the exit.');
      if (d.exit) return err('VALIDATION', 'This decision already has an exit fill. Void it first.');
      if (p.occurredAt < d.entry.occurredAt) return err('VALIDATION', 'Exit cannot be before the entry.');
      if (p.usdValue === 0 && !(p.note ?? '').trim()) return err('VALIDATION', 'A zero-value exit (failed/unexitable) needs a note.');
    } else if (p.usdValue <= 0 || p.tokenAmount <= 0) return err('VALIDATION', 'Entry needs a positive USD value and token amount.');
    const id = this.insertFill(p.decisionId, p.kind, p.occurredAt, p, source, p.txSig ?? null, p.note ?? '');
    return ok({ fillId: id });
  }

  voidFill(fillId: number, reason: string): Result<true> {
    if (!reason.trim()) return err('VALIDATION', 'A reason is required.');
    if (!this.db.prepare('SELECT 1 FROM fills WHERE id=?').get(fillId)) return err('VALIDATION', 'Unknown fill.');
    if (this.db.prepare('SELECT 1 FROM fill_voids WHERE fill_id=?').get(fillId)) return err('VALIDATION', 'Fill already voided.');
    this.db.prepare('INSERT INTO fill_voids(fill_id,voided_at,reason) VALUES(?,?,?)').run(fillId, this.now(), reason.trim());
    return ok(true);
  }

  paperExit(decisionId: number): Result<{ fillId: number }> {
    const d = this.find(decisionId);
    if (!d || d.account !== 'paper') return err('VALIDATION', 'Not a paper decision.');
    if (d.status !== 'open' || !d.entry) return err('VALIDATION', 'Only open paper decisions can be exited.');
    const f = simulateExit(d.entry.tokenAmount, latestSnapshot(this.db, d.poolId), this.costs(), this.now());
    if (!f.ok) return f;
    return ok({ fillId: this.insertFill(decisionId, 'exit', this.now(), f.value, 'paper_sim', null, '') });
  }

  addNote(decisionId: number, kind: 'cancel' | 'review' | 'note', text: string): Result<true> {
    const d = this.find(decisionId);
    if (!d) return err('VALIDATION', 'Unknown decision.');
    if (kind === 'cancel' && d.status !== 'pending' && d.status !== 'expired') return err('VALIDATION', 'Only decisions without an entry fill can be cancelled.');
    this.db.prepare('INSERT INTO decision_notes(decision_id,created_at,kind,text) VALUES(?,?,?,?)').run(decisionId, this.now(), kind, text.trim());
    return ok(true);
  }

  addEquityEvent(account: Account, kind: 'deposit' | 'withdraw' | 'adjust', amountUsd: number, note: string): Result<true> {
    if (!Number.isFinite(amountUsd) || amountUsd === 0 && kind !== 'adjust') return err('VALIDATION', 'Amount must be non-zero.');
    const amt = kind === 'withdraw' ? -Math.abs(amountUsd) : kind === 'deposit' ? Math.abs(amountUsd) : amountUsd;
    this.db.prepare('INSERT INTO equity_events(account,at,kind,amount_usd,note) VALUES(?,?,?,?,?)').run(account, this.now(), kind, amt, note);
    return ok(true);
  }
}
class PaperError extends Error {}
