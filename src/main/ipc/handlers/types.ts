// Shared shape of the main-process services handed to every IPC handler (docs/06 §6.1).
import type { z } from 'zod';
import type { Db } from '../../db/open';
import type { Result } from '../../../shared/types';
import type { Schemas } from '../../../shared/ipc';
import type { ApiMap, EventMap } from '../../../shared/api';
import type { SettingsStore } from '../../settings/store';
import type { SecretStore } from '../../settings/secrets';
import type { JournalService } from '../../journal/service';
import type { JudgeRunner } from '../../judge/runner';
import type { GeckoTerminalClient } from '../../sources/geckoterminal';
import type { RpcLike } from '../../pipeline/context';
import type { Scheduler } from '../../pipeline/scheduler';
import type { SourceMonitor } from '../../pipeline/status';
import type { OpenRouterClient } from '../../ai/openrouter';

/** OS-specific actions injected by the Electron entry, so handlers stay testable without Electron. */
export interface Platform {
  version: string;
  dataDir: string;
  openExternal(url: string): void;
  openDataFolder(): void;
  focusDetail(): void;
  setPin(pinned: boolean): void;
  backupNow(): Result<{ path: string }>;
  writeExport(fileName: string, content: string): Result<{ path: string }>;
  writeDiagnostics(): Result<{ path: string }>;
}

export interface Services {
  db: Db; settings: SettingsStore; secrets: SecretStore; journal: JournalService; judge: JudgeRunner;
  gt: Pick<GeckoTerminalClient, 'poolOhlcv'>; rpc: RpcLike; scheduler: Scheduler; monitor: SourceMonitor; ai: OpenRouterClient;
  platform: Platform; now: () => number;
  emit: <E extends keyof EventMap>(channel: E, payload: EventMap[E]) => void;
  /** Mutable selection state for the Detail window. */
  state: { selected: number | null };
  /** In-memory pipeline counters surfaced on Health. */
  counters: { skippedQuote: number; rejected: number };
}

type Req<C extends keyof typeof Schemas> = z.infer<(typeof Schemas)[C]>;
export type Handler<C extends keyof ApiMap> = (req: Req<C>) => Promise<Result<ApiMap[C]['res']>> | Result<ApiMap[C]['res']>;
export type Handlers = { [C in keyof ApiMap]: Handler<C> };
