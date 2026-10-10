// docs/04 §4.4 — judge runner: build input from DB, evaluate, persist when the hash changed, emit, evaluate alerts.
import type { Db } from '../db/open';
import type { AlertRow, StoredJudgement } from '../../shared/types';
import { SettingsStore } from '../settings/store';
import { loadDefaultConfig, type RuleConfig } from './config';
import { evaluate } from './engine';
import { buildJudgeInput } from './inputs';
import { storeJudgement, latestJudgement } from '../db/queries/judgements';
import { getPoolForToken } from '../db/queries/pools';
import { getToken } from '../db/queries/tokens';
import { evaluateAlerts } from './alerts';

export interface RunnerDeps {
  db: Db; settings: SettingsStore; now: () => number; config?: RuleConfig;
  emitJudgement?: (tokenId: number) => void; emitAlert?: (a: AlertRow) => void;
}

export class JudgeRunner {
  private cfg: RuleConfig;
  constructor(private d: RunnerDeps) { this.cfg = d.config ?? loadDefaultConfig(); }

  /** Evaluates one token. Returns the NEW stored judgement, or null if unchanged / not possible. `force` still only stores on a changed hash. */
  run(tokenId: number, poolId?: number): StoredJudgement | null {
    const { db, settings } = this.d; const now = this.d.now();
    const pool = poolId ? { id: poolId } : getPoolForToken(db, tokenId);
    const tok = getToken(db, tokenId);
    if (!pool || !tok) return null;
    const input = buildJudgeInput(db, tokenId, pool.id, now, {
      positionUsd: settings.get('judge.defaultPositionUsd'), costs: { feePctPerSide: settings.get('costs.tradeFeePctPerSide'), networkFeeUsd: settings.get('costs.networkFeeUsdPerTx') } });
    if (!input) return null;
    const j = evaluate(input, this.cfg);
    const stored = storeJudgement(db, tokenId, pool.id, j, now);
    if (!stored) return null;
    this.d.emitJudgement?.(tokenId);
    const alerts = evaluateAlerts({ db, settings, now: this.d.now }, tokenId, pool.id, stored, stored.id,
      { liquidityUsd: input.latest?.liquidityUsd ?? null, buyersH1: input.latest?.buyersH1 ?? null, createdAtChain: input.pool.createdAtChain, symbol: tok.symbol });
    for (const a of alerts) this.d.emitAlert?.(a);
    return stored;
  }

  /** Always returns the current judgement for the token (recomputing first). */
  recompute(tokenId: number): StoredJudgement | null { this.run(tokenId); return latestJudgement(this.d.db, tokenId); }
}
