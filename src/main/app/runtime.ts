// Electron-free composition root: builds every service from a db + a few injected OS hooks. Tested without Electron.
import { join } from 'node:path';
import type { Db } from '../db/open';
import type { SettingsStore } from '../settings/store';
import { SettingsStore as Settings } from '../settings/store';
import type { SecretStore } from '../settings/secrets';
import { TokenBucket } from '../net/tokenBucket';
import { GeckoTerminalClient } from '../sources/geckoterminal';
import { SolanaRpc } from '../sources/solanaRpc';
import { SourceMonitor } from '../pipeline/status';
import { Scheduler } from '../pipeline/scheduler';
import type { PipelineCtx } from '../pipeline/context';
import { LaunchBatcher } from '../ipc/events';
import { JudgeRunner } from '../judge/runner';
import { JournalService } from '../journal/service';
import { OpenRouterClient } from '../ai/openrouter';
import { addUsage } from '../db/queries/usage';
import { refreshSolUsd } from '../wallet/solUsd';
import { buildHandlers, createDispatcher, type Dispatch } from '../ipc/register';
import type { Services, Platform } from '../ipc/handlers/types';
import type { EventMap } from '../../shared/api';
import { backupDb, writeDiagnostics, writeTextFile } from './backup';

export interface OsHooks {
  version: string; dataDir: string;
  openExternal(url: string): void; openDataFolder(): void; focusDetail(): void; setPin(pinned: boolean): void;
}
export interface Runtime { services: Services; dispatch: Dispatch; scheduler: Scheduler; start(): Promise<void>; stop(): Promise<void>; suspend(): Promise<void>; resume(): void; backup(): void; settings: SettingsStore }

export function createRuntime(a: { db: Db; secrets: SecretStore; os: OsHooks; emit: <E extends keyof EventMap>(c: E, p: EventMap[E]) => void; now?: () => number }): Runtime {
  const now = a.now ?? ((): number => Date.now());
  const { db } = a;
  const settings = new Settings(db);
  const monitor = new SourceMonitor(db, now);
  const cap = settings.get('sources.gt.callsPerMinuteCap');
  const bucket = new TokenBucket(Math.max(1, Math.round(cap / 4)), cap / 60);
  const gt = new GeckoTerminalClient({ bucket, hooks: monitor.hooks('geckoterminal') });
  const rpc = new SolanaRpc({
    url: () => settings.get('sources.rpc.url'), apiKey: () => a.secrets.get('rpcKey'), creditCost: () => settings.get('sources.rpc.creditCost'),
    onCredits: (_m, credits) => addUsage(db, 'rpc', now(), { credits }), hooks: monitor.hooks('rpc'),
  });
  const counters = { skippedQuote: 0, rejected: 0 };
  const judge = new JudgeRunner({ db, settings, now, emitJudgement: (tokenId) => a.emit('evt:judgement-updated', { tokenId }), emitAlert: (al) => a.emit('evt:alert', al) });
  const batcher = new LaunchBatcher((tokenIds) => a.emit('evt:launches-updated', { tokenIds }));
  const ctx: PipelineCtx = { db, settings, gt, rpc, judge, monitor, batcher, now, emit: a.emit, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), counters };
  const scheduler = new Scheduler(ctx);
  const journal = new JournalService(db, settings, now);
  const ai = new OpenRouterClient({ db, settings, now, getKey: () => a.secrets.get('openrouterKey') });
  const dirs = { backups: join(a.os.dataDir, 'backups'), exports: join(a.os.dataDir, 'exports'), diag: join(a.os.dataDir, 'diagnostics') };
  const platform: Platform = {
    version: a.os.version, dataDir: a.os.dataDir, openExternal: a.os.openExternal, openDataFolder: a.os.openDataFolder, focusDetail: a.os.focusDetail, setPin: a.os.setPin,
    backupNow: () => backupDb(db, dirs.backups, now()),
    writeExport: (name, content) => writeTextFile(dirs.exports, name, content),
    writeDiagnostics: () => writeDiagnostics(db, dirs.diag, now(), { version: a.os.version, sources: monitor.status() }),
  };
  const services: Services = { db, settings, secrets: a.secrets, journal, judge, gt, rpc, scheduler, monitor, ai, platform, now, emit: a.emit, state: { selected: null }, counters };
  let solTimer: ReturnType<typeof setInterval> | null = null;
  const refreshSol = (): void => { void refreshSolUsd(db, gt, settings.get('wallet.solUsdPool')); };
  return {
    services, settings, scheduler, dispatch: createDispatcher(buildHandlers(services)),
    async start() {
      journal.ensureInitialDeposits();
      solTimer = setInterval(refreshSol, 3_600_000); (solTimer as { unref?: () => void }).unref?.();
      void scheduler.startAll();
    },
    async stop() { if (solTimer) clearInterval(solTimer); await scheduler.stopAll(); },
    suspend: () => scheduler.suspend(),
    resume() { void scheduler.resume(); },
    backup() { backupDb(db, dirs.backups, now()); },
  };
}
