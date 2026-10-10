// Hourly SOL/USD cache from the reference SOL/USDC pool (address chosen in Phase 0, setting wallet.solUsdPool).
import type { Db } from '../db/open';
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';
import type { GeckoTerminalClient } from '../sources/geckoterminal';

const H = 3_600_000;
export const hourOf = (ts: number): number => Math.floor(ts / H) * H;

export function solUsdAt(db: Db, ts: number): number | null {
  const r = db.prepare('SELECT price FROM sol_usd WHERE hour_ts=?').get(hourOf(ts)) as { price: number } | undefined;
  return r ? r.price : null;
}

export async function refreshSolUsd(db: Db, gt: Pick<GeckoTerminalClient, 'poolOhlcvHour'>, pool: string | null): Promise<Result<number>> {
  if (!pool) return err('VALIDATION', 'No SOL/USD reference pool configured (wallet.solUsdPool).');
  const r = await gt.poolOhlcvHour(pool);
  if (!r.ok) return r;
  const st = db.prepare('INSERT OR REPLACE INTO sol_usd(hour_ts,price) VALUES(?,?)');
  db.transaction(() => { for (const c of r.value) if (c.c > 0) st.run(hourOf(c.t), c.c); })();
  return ok(r.value.length);
}
