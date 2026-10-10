import type { Db } from '../db/open';
import type { SettingsStore } from '../settings/store';
import type { GeckoTerminalClient } from '../sources/geckoterminal';
import type { SolanaRpc } from '../sources/solanaRpc';
import type { JudgeRunner } from '../judge/runner';
import type { SourceMonitor } from './status';
import type { LaunchBatcher } from '../ipc/events';
import type { EventMap } from '../../shared/api';

export type GtLike = Pick<GeckoTerminalClient, 'newPools' | 'poolsMulti' | 'poolTrades'>;
export type RpcLike = Pick<SolanaRpc, 'mintInfo' | 'tokenSupply' | 'largestAccounts' | 'multipleAccounts' | 'signatures' | 'transaction'>;

export interface PipelineCtx {
  db: Db; settings: SettingsStore; gt: GtLike; rpc: RpcLike; judge: JudgeRunner; monitor: SourceMonitor; batcher: LaunchBatcher;
  now: () => number;
  emit: <E extends keyof EventMap>(channel: E, payload: EventMap[E]) => void;
  sleep: (ms: number) => Promise<void>;
  /** In-memory counters surfaced on Health. */
  counters: { skippedQuote: number; rejected: number };
}
