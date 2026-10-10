// docs/07 — crashes must never lose data or hang: log, then keep running (main) or reload (renderer).
import { log } from '../logger';

export function installCrashHandlers(): void {
  process.on('uncaughtException', (e) => { log.error(`uncaughtException: ${e.stack ?? e.message}`); });
  process.on('unhandledRejection', (r) => { log.error(`unhandledRejection: ${r instanceof Error ? (r.stack ?? r.message) : String(r)}`); });
}
