// Validates every invoke payload with its zod schema and routes to the handler (docs/06 §6.1). Unknown channels are rejected.
import { Schemas, isInvokeChannel } from '../../shared/ipc';
import { err, type Result } from '../../shared/types';
import { log } from '../logger';
import type { Handlers, Services } from './handlers/types';
import { launchHandlers } from './handlers/launches';
import { journalHandlers } from './handlers/journal';
import { miscHandlers } from './handlers/misc';

export function buildHandlers(s: Services): Handlers {
  return { ...launchHandlers(s), ...journalHandlers(s), ...miscHandlers(s) };
}

export type Dispatch = (channel: string, payload: unknown) => Promise<Result<unknown>>;

export function createDispatcher(handlers: Handlers): Dispatch {
  return async (channel, payload) => {
    if (!isInvokeChannel(channel)) return err('VALIDATION', 'Unknown channel.');
    const parsed = Schemas[channel].safeParse(payload ?? {});
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid request.');
    try {
      const h = handlers[channel] as (req: unknown) => Promise<Result<unknown>> | Result<unknown>;
      return await h(parsed.data);
    } catch (e) {
      log.error(`ipc ${channel} failed: ${e instanceof Error ? e.message : String(e)}`);
      return err('DB_ERROR', 'Something went wrong. See Health > Errors.');
    }
  };
}
