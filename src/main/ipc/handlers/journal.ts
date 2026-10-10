// journal:* and wallet:* handlers.
import { ok } from '../../../shared/types';
import type { Handlers, Services } from './types';
import { loadDecisions, equityTimeline } from '../../journal/outcomes';
import { computeRiskState, acknowledgeRisk } from '../../journal/risk';
import { computeStats } from '../../journal/stats';
import { toCsv } from '../../journal/exportCsv';
import { syncWallet, listUnlinked, linkUnlinked, dismissUnlinked } from '../../wallet/import';

type Keys = 'journal:summary' | 'journal:decisions' | 'journal:decision:create' | 'journal:fill:create' | 'journal:fill:void' | 'journal:paperExit'
  | 'journal:note:add' | 'journal:equity:add' | 'journal:equity:list' | 'journal:risk:ack' | 'journal:export'
  | 'wallet:sync' | 'wallet:unlinked:list' | 'wallet:unlinked:link' | 'wallet:unlinked:dismiss';

export function journalHandlers(s: Services): Pick<Handlers, Keys> {
  const { db } = s;
  const emitRisk = (account: 'paper' | 'real'): void => s.emit('evt:risk-state', { account, risk: computeRiskState(db, s.settings, account, s.now()) });
  const accountOf = (decisionId: number): 'paper' | 'real' | null => {
    const r = db.prepare('SELECT account FROM decisions WHERE id=?').get(decisionId) as { account: 'paper' | 'real' } | undefined;
    return r?.account ?? null;
  };
  const after = <T>(res: T, decisionId: number): T => { const a = accountOf(decisionId); if (a) emitRisk(a); return res; };
  return {
    'journal:summary': (r) => {
      const now = s.now();
      const risk = computeRiskState(db, s.settings, r.account, now);
      const ds = loadDecisions(db, r.account, now);
      const st = computeStats(ds);
      const openExposure = ds.filter((d) => d.status === 'open').reduce((a, d) => a + (d.entry?.usdValue ?? 0), 0);
      return ok({ equity: risk.equity, peak: risk.peak, realizedPnl: st.totalPnl, winRate: st.winRate, n: st.n, openExposure, drawdownPct: risk.drawdownPct, risk });
    },
    'journal:decisions': (r) => {
      const ds = loadDecisions(db, r.account, s.now(), r.tokenId ? { tokenId: r.tokenId } : {});
      return ok(r.status ? ds.filter((d) => d.status === r.status) : ds);
    },
    'journal:decision:create': (r) => { const x = s.journal.createDecision(r); if (x.ok) emitRisk(r.account); return x; },
    'journal:fill:create': (r) => after(s.journal.createFill(r, 'manual'), r.decisionId),
    'journal:fill:void': (r) => { const x = s.journal.voidFill(r.fillId, r.reason); return x.ok ? ok(undefined) : x; },
    'journal:paperExit': (r) => after(s.journal.paperExit(r.decisionId), r.decisionId),
    'journal:note:add': (r) => { const x = s.journal.addNote(r.decisionId, r.kind, r.text); return x.ok ? after(ok(undefined), r.decisionId) : x; },
    'journal:equity:add': (r) => { const x = s.journal.addEquityEvent(r.account, r.kind, r.amountUsd, r.note); if (!x.ok) return x; emitRisk(r.account); return ok(undefined); },
    'journal:equity:list': (r) => ok(equityTimeline(db, r.account, s.now()).map((p) => ({ at: p.at, equity: p.equity, kind: p.kind, note: p.note }))),
    'journal:risk:ack': (r) => { const x = acknowledgeRisk(db, s.settings, r.account, r.reason, s.now()); if (x.ok) emitRisk(r.account); return x; },
    'journal:export': (r) => {
      const csv = toCsv(loadDecisions(db, r.account, s.now()));
      return s.platform.writeExport(`ticklab-journal-${r.account}-${new Date(s.now()).toISOString().slice(0, 10)}.csv`, csv);
    },
    'wallet:sync': () => syncWallet({ db, settings: s.settings, rpc: s.rpc, now: s.now }),
    'wallet:unlinked:list': () => ok(listUnlinked(db, s.now())),
    'wallet:unlinked:link': (r) => { const x = linkUnlinked(db, s.journal, r.id, r.decisionId, r.kind); if (x.ok) emitRisk('real'); return x; },
    'wallet:unlinked:dismiss': (r) => { dismissUnlinked(db, r.id); return ok(undefined); },
  };
}
