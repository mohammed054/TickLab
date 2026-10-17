// research:storage:* handlers (docs/07-phases-and-tasks.md T2.4, docs/09-research-system.md sec 9.3).
// Both channels are READ-ONLY: status reports the cap state, cleanupPreview lists what a configured
// cleanup would prune. No IPC channel can delete research data.
import type { Handlers, Services } from './types';
import { ok } from '../../../shared/types';
import { cleanupConfigFromSettings } from '../../research/storageBudget';

type Keys = 'research:storage:status' | 'research:storage:cleanupPreview';

export function researchStorageHandlers(s: Services): Pick<Handlers, Keys> {
  return {
    'research:storage:status': async (r) => {
      if (r.refresh) {
        const res = await s.storage.refresh();
        if (!res.ok) return res;
      }
      return ok(s.storage.current());
    },
    'research:storage:cleanupPreview': async (r) => {
      if (!s.storage.current()) {
        const res = await s.storage.refresh();
        if (!res.ok) return res;
      }
      return s.storage.cleanupPreview(cleanupConfigFromSettings(s.settings), { verifyHashes: r.verifyHashes });
    },
  };
}
