// docs/06 §6.3 — risk engine. Limits come from SettingsStore.effectiveLimits (loosening cooldown applied).
import type { Db } from '../db/open';
import type { Account, RiskState, Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import { SettingsStore, type Limits } from '../settings/store';
import { equityAndPeak, loadDecisions } from './outcomes';

const DAY = 86_400_000;
const startOfLocalDay = (ts: number): number => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function effectiveLimits(settings: SettingsStore, now: number): Limits { return settings.effectiveLimits(now); }

export function computeRiskState(db: Db, settings: SettingsStore, account: Account, now: number): RiskState {
  const lim = settings.effectiveLimits(now);
  const { equity, peak, lastEventAt } = equityAndPeak(db, account, now);
  const drawdownPct = peak <= 0 ? 0 : Math.max(0, ((peak - equity) / peak) * 100);
  const decisions = loadDecisions(db, account, now);
  const openCount = decisions.filter((d) => d.status === 'open').length;
  const day0 = startOfLocalDay(now);
  const losingToday = decisions.filter((d) => d.status === 'closed' && d.exit && d.exit.occurredAt >= day0 && (d.pnlUsd ?? 0) < 0 && new Date(d.exit.occurredAt).toDateString() === new Date(now).toDateString()).length;
  let pausedReason: RiskState['pausedReason'] = null;
  if (drawdownPct >= lim.maxDrawdownPct - 1e-9 && peak > 0) pausedReason = 'drawdown';
  else if (losingToday >= lim.maxLosingPerDay) pausedReason = 'daily_losses';
  const maxPositionUsd = Math.max(0, Math.min(equity, (equity * lim.maxPositionPct) / 100));
  const canAck = pausedReason === 'drawdown' && lastEventAt !== null && now - lastEventAt >= DAY;
  return {
    account, active: pausedReason === null, pausedReason, maxPositionUsd, openCount, maxOpen: lim.maxOpen, drawdownPct, losingToday, canAck,
    pendingLimits: settings.pending(now), equity, peak,
  };
}

export function canCreateDecision(state: RiskState, sizeUsd: number): Result<true> {
  if (state.pausedReason === 'drawdown') return err('RISK_BLOCKED', 'Paused: drawdown limit reached. Review and acknowledge in the Journal.');
  if (state.pausedReason === 'daily_losses') return err('RISK_BLOCKED', 'Paused for today: too many losing trades. Resumes at local midnight.');
  if (state.openCount >= state.maxOpen) return err('RISK_BLOCKED', `Max open positions reached (${state.openCount}/${state.maxOpen}).`);
  if (!(sizeUsd > 0)) return err('RISK_BLOCKED', 'Size must be greater than zero.');
  if (sizeUsd > state.maxPositionUsd + 0.005) return err('RISK_BLOCKED', `Size exceeds the max position of $${state.maxPositionUsd.toFixed(2)}.`);
  return ok(true);
}

/** Drawdown pause clears only by acknowledgement; inserts risk_acks + a zero 'peak reset' adjust event (restarts the peak). */
export function acknowledgeRisk(db: Db, settings: SettingsStore, account: Account, reason: string, now: number): Result<RiskState> {
  const st = computeRiskState(db, settings, account, now);
  if (!st.canAck) return err('RISK_BLOCKED', 'Acknowledgement is not allowed yet (needs a drawdown pause and 24 h since the last equity change).');
  db.transaction(() => {
    db.prepare('INSERT INTO risk_acks(account,at,reason) VALUES(?,?,?)').run(account, now, reason);
    db.prepare("INSERT INTO equity_events(account,at,kind,amount_usd,note) VALUES(?,?,'adjust',0,'peak reset')").run(account, now);
  })();
  return ok(computeRiskState(db, settings, account, now));
}
