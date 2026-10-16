// Read-only legacy journal handlers (docs/09-research-system.md §9.9, T1.5).
// All insert/mutate channels (decision:create, fill:create, fill:void, paperExit,
// note:add, equity:add, risk:ack) and all wallet:* channels were removed. The
// renderer can only read existing rows and export CSV.
import { ok } from '../../../shared/types';
import type { Handlers, Services } from './types';

type Keys = 'journal:summary' | 'journal:decisions' | 'journal:equity:list' | 'journal:export';

export function journalHandlers(s: Services): Pick<Handlers, Keys> {
  const { journal } = s;
  return {
    'journal:summary': (r) => ok(journal.summary(r.account)),
    'journal:decisions': (r) => ok(journal.decisions(r.account, r.tokenId ? { tokenId: r.tokenId } : {})),
    'journal:equity:list': (r) => ok(journal.equity(r.account)),
    'journal:export': (r) => {
      const csv = journal.csv(r.account);
      return s.platform.writeExport(`ticklab-journal-${r.account}-${new Date(s.now()).toISOString().slice(0, 10)}.csv`, csv);
    },
  };
}
