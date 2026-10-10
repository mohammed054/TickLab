// launches:*, detail:*, judge:*, watchlist:*, alerts:* handlers.
import { ok, err } from '../../../shared/types';
import type { Handlers, Services } from './types';
import { listLaunches, listWatchlist, addWatch, removeWatch, setWatchNote, isWatched } from '../../db/queries/listLaunches';
import { getToken } from '../../db/queries/tokens';
import { getPoolForToken } from '../../db/queries/pools';
import { latestSnapshot } from '../../db/queries/snapshots';
import { latestJudgement } from '../../db/queries/judgements';
import { listTrades } from '../../db/queries/trades';
import { latestHolders } from '../../db/queries/holders';
import { listAlerts, markSeen, alertsSince } from '../../db/queries/alerts';
import { gapsSince } from '../../db/queries/gaps';
import { estimateExit } from '../../judge/exitImpact';
import { MS } from '../../../shared/constants';

type Keys = 'launches:list' | 'launches:get' | 'launches:stats' | 'detail:select' | 'detail:focus' | 'detail:pin' | 'detail:trades' | 'detail:holders'
  | 'detail:candles' | 'detail:exitEstimate' | 'judge:get' | 'judge:recompute' | 'watchlist:list' | 'watchlist:add' | 'watchlist:remove'
  | 'watchlist:setNote' | 'alerts:list' | 'alerts:markSeen';

export function launchHandlers(s: Services): Pick<Handlers, Keys> {
  const { db } = s;
  return {
    'launches:list': (r) => ok(listLaunches(db, r.filters, r.sort, r.limit, s.now())),
    'launches:get': (r) => {
      const token = getToken(db, r.tokenId); const pool = getPoolForToken(db, r.tokenId);
      if (!token || !pool) return err('VALIDATION', 'Unknown token.');
      return ok({ token, pool, latest: latestSnapshot(db, pool.id), judgement: latestJudgement(db, r.tokenId), watchlisted: isWatched(db, r.tokenId) });
    },
    'launches:stats': () => {
      const now = s.now();
      const c = (sql: string): number => (db.prepare(sql).get() as { c: number }).c;
      return ok({
        total: c('SELECT COUNT(*) c FROM pools'), tracked: c("SELECT COUNT(*) c FROM pools WHERE tier>=2"), deep: s.scheduler.deep.activeTokenIds().length,
        alertsToday: alertsSince(db, now - MS.day), gaps24h: gapsSince(db, now - MS.day),
      });
    },
    'detail:select': (r) => {
      const prev = s.state.selected; s.state.selected = r.tokenId;
      s.scheduler.deep.setSelected(r.tokenId, prev);
      s.emit('evt:detail-selected', { tokenId: r.tokenId });
      if (r.tokenId !== null) void s.scheduler.deep.refresh(r.tokenId);
      return ok(undefined);
    },
    'detail:focus': () => { s.platform.focusDetail(); return ok(undefined); },
    'detail:pin': (r) => { s.platform.setPin(r.pinned); s.emit('evt:pin-changed', { pinned: r.pinned }); return ok(undefined); },
    'detail:trades': (r) => {
      const pool = getPoolForToken(db, r.tokenId);
      return ok(pool ? listTrades(db, pool.id, { minUsd: r.minUsd, limit: 200 }) : []);
    },
    'detail:holders': (r) => ok(latestHolders(db, r.tokenId)),
    'detail:candles': async (r) => {
      const pool = getPoolForToken(db, r.tokenId);
      if (!pool) return ok([]);
      return s.gt.poolOhlcv(pool.address, r.tf, 0);
    },
    'detail:exitEstimate': (r) => {
      const pool = getPoolForToken(db, r.tokenId);
      const snap = pool ? latestSnapshot(db, pool.id) : null;
      const e = estimateExit(r.sizeUsd, snap?.liquidityUsd ?? null, s.settings.get('costs.tradeFeePctPerSide'), s.settings.get('costs.networkFeeUsdPerTx'));
      return ok({ impactPct: e ? e.impactPct : null, receivedUsd: e ? e.receivedUsd : null });
    },
    'judge:get': (r) => ok(latestJudgement(db, r.tokenId)),
    'judge:recompute': (r) => { s.judge.run(r.tokenId); return ok(latestJudgement(db, r.tokenId)); },
    'watchlist:list': () => ok(listWatchlist(db)),
    'watchlist:add': (r) => { addWatch(db, r.tokenId, s.now()); return ok(undefined); },
    'watchlist:remove': (r) => { removeWatch(db, r.tokenId); return ok(undefined); },
    'watchlist:setNote': (r) => { setWatchNote(db, r.tokenId, r.note); return ok(undefined); },
    'alerts:list': (r) => ok(listAlerts(db, r.limit)),
    'alerts:markSeen': (r) => { markSeen(db, r.ids); return ok(undefined); },
  };
}
